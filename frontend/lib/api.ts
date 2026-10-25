// Every call goes to this app's own /api/backend proxy, which adds the hospital's credentials from
// httpOnly cookies. Page code never sees or stores a hospital code or admin key.
export const API_URL = '/api/backend'

// Only the hospital's display name is remembered in the browser (e.g. for "you're signed in to ...").
const HOSPITAL_NAME_KEY = 'hospital_name'

export function getStoredHospitalName(): string | null {
  try {
    return localStorage.getItem(HOSPITAL_NAME_KEY)
  } catch {
    return null
  }
}

export function saveHospitalName(name: string) {
  try {
    localStorage.setItem(HOSPITAL_NAME_KEY, name)
  } catch {
    // Storage unavailable: only the name is lost, nothing else depends on it.
  }
}

function clearHospitalName() {
  try {
    localStorage.removeItem(HOSPITAL_NAME_KEY)
  } catch {
    // Ignore: see saveHospitalName.
  }
}

export type SignInResult = { ok: true; name: string } | { ok: false; status: number }

/** Sets the session cookies if the code and key are valid. Throws TypeError if the app can't be reached. */
export async function signIn(code: string, adminKey: string): Promise<SignInResult> {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, admin_key: adminKey }),
  })
  if (!res.ok) return { ok: false, status: res.status }
  const { name } = (await res.json()) as { name: string }
  saveHospitalName(name)
  return { ok: true, name }
}

/** Clears the session cookies and the stored name. */
export async function signOut() {
  clearHospitalName()
  try {
    await fetch('/api/session', { method: 'DELETE' })
  } catch {
    // Offline: the cookies stay, but /start lets the user sign in again or switch hospital.
  }
}

export const SESSION_ENDED_MESSAGE = 'Your session has ended. Please sign in again.'

/**
 * fetch() through the proxy. 401/403 means the session's credentials no longer work (signed out
 * elsewhere, or a code or key was regenerated): after one retry, in case a rotation just updated the
 * cookie, the session is cleared and the browser goes to /start.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let res = await fetch(`${API_URL}${path}`, init)
  if (res.status === 401 || res.status === 403) {
    res = await fetch(`${API_URL}${path}`, init)
    if (res.status === 401 || res.status === 403) {
      await signOut()
      window.location.assign('/start')
      throw new ApiError(SESSION_ENDED_MESSAGE)
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
  /** Before/after impact of this placement (null if it couldn't be computed). */
  kpis: Kpis | null
}

export type BeforeAfter = { before: number | null; after: number | null }

/** From backend services/kpis.py. "Before" = every unit at the candidate position nearest the hospital. */
export type Kpis = {
  avg_response_min: BeforeAfter
  demand_within_15_min_pct: BeforeAfter
  demand_within_20_min_pct: BeforeAfter
  worst_high_risk_ward: { ward_code: string; before_min: number | null; after_min: number | null } | null
  wards_covered_20_min: { before: number; after: number; total: number }
  baseline: { hospital_candidate_id: string; distance_km: number | null; approximate: boolean }
  fleet: { total: number; als: number; bls: number }
  /** Smallest distance between two chosen positions; null with one unit. */
  min_spacing_km_actual: number | null
  demand_now: { multiplier: number; level: 'Quiet' | 'Normal' | 'Busy'; top_wards: string[] } | null
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

/** The signed-in hospital. Throws ApiError on server errors (and signs out on invalid credentials). */
export async function getHospital(signal?: AbortSignal): Promise<Hospital> {
  const res = await apiFetch('/hospital', { signal })
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
  kpis: Kpis | null
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
export async function getRuns(limit = 10, signal?: AbortSignal): Promise<RunSummary[]> {
  const res = await apiFetch(`/runs?limit=${limit}`, { signal })
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
  /** Dashboard (admin) key, shown only in this response: the user must save it, it can't be shown again. */
  admin_key: string
  fleet_size: number
}

/** The server answered with an error; `message` is its explanation. */
export class ApiError extends Error {}

/** Throws ApiError when the server rejects the request, or TypeError when it can't be reached. */
/** Public, so it bypasses apiFetch's sign-out handling. Throws TypeError if the app can't be reached. */
export async function registerHospital(registration: HospitalRegistration): Promise<RegisterHospitalResponse> {
  const res = await fetch(`${API_URL}/hospital/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registration),
  })
  if (!res.ok) throw new ApiError(await readErrorMessage(res, 'Registration failed'))
  return res.json()
}

/** New driver code; the old one stops working at once. The proxy updates the session cookie. */
export function rotateDriverCode(): Promise<{ code: string }> {
  return sendJson('POST', '/hospital/rotate-code', undefined, 'Regenerating the driver code failed')
}

/** New dashboard key, returned only here. The proxy updates the session cookie. */
export function rotateDashboardKey(): Promise<{ admin_key: string }> {
  return sendJson('POST', '/hospital/rotate-admin-key', undefined, 'Regenerating the dashboard key failed')
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
