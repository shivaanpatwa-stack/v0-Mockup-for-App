export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export type OptimizedPosition = {
  candidate_id: string
  name: string | null
  ward_code: string | null
  weighted_score: number
  lat: number
  lng: number
}

export type AmbulanceAssignment = {
  ambulance_id: string
  type: string
  candidate_id: string
  name: string | null
  ward_code: string | null
  weighted_score: number
  lat: number
  lng: number
}

export type OptimizeResult = {
  chosen_candidates: string[]
  total_weighted_score: number
  details: OptimizedPosition[]
  assignments: AmbulanceAssignment[]
}

export type DemandScore = {
  ward_code: string
  risk_score: number
}

/** One entry per ward for that hour. Throws ApiError on a server error; pass `signal` to cancel. */
export async function getDemandScores(hour: number, signal?: AbortSignal): Promise<DemandScore[]> {
  const res = await fetch(`${API_URL}/demand-scores?hour=${hour}`, { signal })
  if (!res.ok) throw new ApiError(await readErrorMessage(res, 'Loading demand scores failed'))
  return res.json()
}

export type HospitalRegistration = {
  hospital_name: string
  lat: number
  lng: number
  operating_radius_km: number
  ambulances: { id: string; type: 'ALS' | 'BLS' }[]
}

export type RegisterHospitalResponse = {
  status: 'registered'
  hospital_id: number
  fleet_size: number
}

/** The server answered with an error; `message` is its explanation. */
export class ApiError extends Error {}

/** Throws ApiError when the server rejects the request, or TypeError when it can't be reached. */
export async function registerHospital(registration: HospitalRegistration): Promise<RegisterHospitalResponse> {
  const res = await fetch(`${API_URL}/hospital/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registration),
  })
  if (!res.ok) throw new ApiError(await readErrorMessage(res, 'Registration failed'))
  return res.json()
}

// The registered hospital is remembered per browser, so the dashboard knows which one to optimize.
// Storage can be unavailable (private mode, blocked site data), so every access is guarded.
const HOSPITAL_ID_KEY = 'hospital_id'

export function saveHospitalId(id: number) {
  try {
    localStorage.setItem(HOSPITAL_ID_KEY, String(id))
  } catch {
    // Nothing to do: the dashboard will ask the user to register again.
  }
}

export function loadHospitalId(): number | null {
  try {
    const id = Number(localStorage.getItem(HOSPITAL_ID_KEY))
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

export function clearHospitalId() {
  try {
    localStorage.removeItem(HOSPITAL_ID_KEY)
  } catch {
    // Ignore: see saveHospitalId.
  }
}

export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const { detail } = await res.json()
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      // FastAPI validation errors: [{ loc: ['body', 'field'], msg }, ...]
      return detail.map((d) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`).join('; ')
    }
  } catch {
    // Body wasn't JSON; fall through to the generic message.
  }
  return `${fallback} (HTTP ${res.status}).`
}
