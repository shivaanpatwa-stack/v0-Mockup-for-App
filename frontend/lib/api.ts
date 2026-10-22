export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

// The hospital code from registration, remembered per browser and sent as X-Hospital-Code so the
// backend serves this hospital rather than the newest one. Storage can be unavailable (private mode,
// blocked site data), so every access is guarded; without a code the backend uses the newest hospital.
const HOSPITAL_CODE_KEY = 'hospital_code'
const HOSPITAL_CODE_HEADER = 'X-Hospital-Code'
const CODE_NOT_FOUND_DETAIL = 'Hospital code not found'

/** Fired on window when the stored code turned out to be stale and was cleared. */
export const HOSPITAL_CODE_INVALID_EVENT = 'hospital-code-invalid'
export const STALE_CODE_MESSAGE = "Your saved hospital code wasn't found and has been cleared. Reload the page to continue."

export function getStoredHospitalCode(): string | null {
  try {
    return localStorage.getItem(HOSPITAL_CODE_KEY)
  } catch {
    return null
  }
}

export function saveHospitalCode(code: string) {
  try {
    localStorage.setItem(HOSPITAL_CODE_KEY, code)
  } catch {
    // Without storage the dashboard falls back to the newest hospital.
  }
}

export function clearHospitalCode() {
  try {
    localStorage.removeItem(HOSPITAL_CODE_KEY)
  } catch {
    // Ignore: see saveHospitalCode.
  }
}

/**
 * fetch() against the backend, adding X-Hospital-Code when a code is stored. A 404 "Hospital code not
 * found" means the stored code is stale: it is cleared, HOSPITAL_CODE_INVALID_EVENT fires and an
 * ApiError with STALE_CODE_MESSAGE is thrown, so no caller mistakes it for "no hospital registered".
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const code = getStoredHospitalCode()
  const headers = new Headers(init.headers)
  if (code) headers.set(HOSPITAL_CODE_HEADER, code)
  const res = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (code && res.status === 404) {
    const detail = await res
      .clone()
      .json()
      .then((body) => body?.detail)
      .catch(() => undefined)
    if (detail === CODE_NOT_FOUND_DETAIL) {
      clearHospitalCode()
      window.dispatchEvent(new Event(HOSPITAL_CODE_INVALID_EVENT))
      throw new ApiError(STALE_CODE_MESSAGE)
    }
  }
  return res
}

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
  /** null when the run worked but saving its history failed. */
  run_id: number | null
  /** False when the fleet couldn't reach every coverable ward within max_response_minutes. */
  coverage_guaranteed: boolean
  max_response_minutes: number
  /** Wards no nearby candidate position can reach in time, so they were never required. */
  uncoverable_wards: string[]
  /** Coverable wards the chosen positions don't reach in time (empty when coverage is guaranteed). */
  uncovered_wards: string[]
}

export type AmbulanceStatus = 'available' | 'responding' | 'at_hospital' | 'unavailable'

export type Hospital = {
  hospital_id: number
  /** Short code drivers enter in the app, e.g. "PAREL-4821". */
  code: string
  name: string
  lat: number
  lng: number
  operating_radius_km: number
  fleet_size: number
  ambulances: { id: string; type: 'ALS' | 'BLS'; status: AmbulanceStatus }[]
}

/** The active (most recently registered) hospital, or null if none is registered. Throws ApiError on other server errors. */
export async function getHospital(signal?: AbortSignal): Promise<Hospital | null> {
  const res = await apiFetch('/hospital', { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new ApiError(await readErrorMessage(res, 'Loading the hospital failed'))
  return res.json()
}

export type AssignmentStatus = 'planned' | 'en_route' | 'in_position' | 'cancelled'

export type CurrentAssignment = {
  candidate_id: string
  name: string | null
  ward_code: string | null
  lat: number | null
  lng: number | null
  assignment_status: AssignmentStatus
  valid_from: string
  valid_to: string
}

export type FleetAmbulance = {
  call_sign: string
  type: 'ALS' | 'BLS'
  status: AmbulanceStatus
  status_updated_at: string
  /** The latest non-cancelled assignment, or null. */
  current_assignment: CurrentAssignment | null
}

/** Live status of the active hospital's ambulances. Throws ApiError on a server error. */
export async function getFleet(signal?: AbortSignal): Promise<FleetAmbulance[]> {
  const res = await apiFetch('/fleet', { signal })
  if (!res.ok) throw new ApiError(await readErrorMessage(res, 'Loading the fleet failed'))
  return res.json()
}

async function sendJson<T>(method: 'POST' | 'PATCH', path: string, body: unknown, fallback: string): Promise<T> {
  const res = await apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new ApiError(await readErrorMessage(res, fallback))
  return res.json()
}

export type SimulationRequest = {
  hour: number
  num_ambulances?: number
  operating_radius_km?: number
  min_spacing_km?: number
  max_response_minutes?: number
}

export type SimulationResult = Omit<OptimizeResult, 'run_id'> & {
  simulated: true
  parameters: Required<SimulationRequest> & { synthetic_ambulances: number }
}

/** What-if run for the active hospital. Nothing is saved. Throws ApiError with the backend's detail. */
export function simulate(request: SimulationRequest): Promise<SimulationResult> {
  return sendJson('POST', '/simulate', request, 'Simulation failed')
}

export type HospitalUpdate = { name?: string; operating_radius_km?: number }

/** Rename the active hospital and/or change its radius (its location can't change). */
export function updateHospital(changes: HospitalUpdate): Promise<Hospital> {
  return sendJson('PATCH', '/hospital', changes, 'Saving the hospital failed')
}

export type AmbulanceStatusResponse = {
  call_sign: string
  type: 'ALS' | 'BLS'
  status: AmbulanceStatus
  status_updated_at: string
}

/** Add an ambulance to the active hospital. Throws ApiError (409 if the ID is taken). */
export function addAmbulance(ambulance: { id: string; type: 'ALS' | 'BLS' }): Promise<AmbulanceStatusResponse> {
  return sendJson('POST', '/hospital/ambulances', ambulance, 'Adding the ambulance failed')
}

/** Change an ambulance's availability; 'unavailable' takes it out of service. */
export function setAmbulanceStatus(callSign: string, status: AmbulanceStatus, note?: string): Promise<AmbulanceStatusResponse> {
  return sendJson('PATCH', `/ambulances/${encodeURIComponent(callSign)}/status`, { status, note }, 'Updating the ambulance failed')
}

export type RunStatus = 'succeeded' | 'failed'

export type RunSummary = {
  run_id: number
  /** ISO timestamp with offset. */
  created_at: string
  target_date: string
  target_hour: number
  status: RunStatus
  num_ambulances: number
  total_weighted_score: number | null
  error_message: string | null
}

/** A saved run in the same shape as a live OptimizeResult, plus what it saved. */
export type RunDetail = RunSummary & {
  min_spacing_km: number
  operating_radius_km: number
  model_version: string | null
  details: (Omit<OptimizedPosition, 'name' | 'ward_code' | 'lat' | 'lng'> & {
    rank: number
    name: string | null
    ward_code: string | null
    lat: number | null
    lng: number | null
  })[]
  assignments: (Omit<AmbulanceAssignment, 'weighted_score' | 'lat' | 'lng'> & {
    call_sign: string
    weighted_score: number | null
    lat: number | null
    lng: number | null
    status: AssignmentStatus
    valid_from: string
    valid_to: string
  })[]
}

/** The hospital's most recent runs, newest first. Throws ApiError on a server error. */
export async function getRuns(hospitalId: number, limit = 10, signal?: AbortSignal): Promise<RunSummary[]> {
  const res = await apiFetch(`/runs?hospital_id=${hospitalId}&limit=${limit}`, { signal })
  if (!res.ok) throw new ApiError(await readErrorMessage(res, 'Loading recent runs failed'))
  return res.json()
}

/** One saved run of the active hospital. Throws ApiError (404 if it isn't that hospital's). */
export async function getRun(runId: number): Promise<RunDetail> {
  const res = await apiFetch(`/runs/${runId}`)
  if (!res.ok) throw new ApiError(await readErrorMessage(res, 'Loading the run failed'))
  return res.json()
}

export type DemandScore = {
  ward_code: string
  risk_score: number
}

/** One entry per ward for that hour. Throws ApiError on a server error; pass `signal` to cancel. */
export async function getDemandScores(hour: number, signal?: AbortSignal): Promise<DemandScore[]> {
  const res = await apiFetch(`/demand-scores?hour=${hour}`, { signal })
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
  /** Short code drivers enter in the app; also identifies this hospital to the API. */
  code: string
  fleet_size: number
}

/** The server answered with an error; `message` is its explanation. */
export class ApiError extends Error {}

/** Throws ApiError when the server rejects the request, or TypeError when it can't be reached. */
export async function registerHospital(registration: HospitalRegistration): Promise<RegisterHospitalResponse> {
  const res = await apiFetch('/hospital/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registration),
  })
  if (!res.ok) throw new ApiError(await readErrorMessage(res, 'Registration failed'))
  return res.json()
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
