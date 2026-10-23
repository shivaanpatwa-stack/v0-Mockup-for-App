import { API_URL } from './config'

export type UnitType = 'ALS' | 'BLS'
export type AmbulanceStatus = 'available' | 'responding' | 'at_hospital' | 'unavailable'
// "cancelled" exists in the backend but is only used when the optimizer replaces a plan.
export type AssignmentStage = 'planned' | 'en_route' | 'in_position'

// Shapes below were copied from real responses of the running backend (GET /hospital, GET /fleet).
export type Hospital = {
  hospital_id: number
  code: string
  name: string
  lat: number
  lng: number
  operating_radius_km: number
  fleet_size: number
  ambulances: { id: string; type: UnitType; status: AmbulanceStatus }[]
}

export type CurrentAssignment = {
  candidate_id: string
  name: string | null
  ward_code: string | null
  lat: number | null
  lng: number | null
  assignment_status: AssignmentStage
  valid_from: string
  valid_to: string
}

export type FleetUnit = {
  call_sign: string
  type: UnitType
  status: AmbulanceStatus
  status_updated_at: string | null
  current_assignment: CurrentAssignment | null
}

export type DemandScore = { ward_code: string; risk_score: number }

export const HOSPITAL_CODE_HEADER = 'X-Hospital-Code'
export const HOSPITAL_CODE_NOT_FOUND = 'Hospital code not found'
const TIMEOUT_MS = 8_000

/** The request never got an answer: no connection, DNS/TLS failure, or the 8 s timeout. */
export class ApiNetworkError extends Error {
  readonly timedOut: boolean
  constructor(message: string, timedOut = false) {
    super(message)
    this.name = 'ApiNetworkError'
    this.timedOut = timedOut
  }
}

/** The server answered with an error status; `detail` is the backend's own text. */
export class ApiHttpError extends Error {
  readonly status: number
  readonly detail: string
  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiHttpError'
    this.status = status
    this.detail = detail
  }
}

export const isNetworkError = (err: unknown): err is ApiNetworkError => err instanceof ApiNetworkError

export const isCodeNotFound = (err: unknown): boolean =>
  err instanceof ApiHttpError && err.status === 404 && err.detail === HOSPITAL_CODE_NOT_FOUND

/** What the UI needs from an error: which banner to show and what it says. */
export type AppError = { kind: 'network' | 'http'; message: string }

export function describeError(err: unknown): AppError {
  if (err instanceof ApiNetworkError) return { kind: 'network', message: err.message }
  if (err instanceof ApiHttpError) return { kind: 'http', message: err.detail }
  return { kind: 'http', message: err instanceof Error ? err.message : 'Something went wrong.' }
}

// The code is attached to every request while one is stored (set by the session provider).
let storedHospitalCode: string | null = null
export function setStoredHospitalCode(code: string | null) {
  storedHospitalCode = code
}

function detailOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('detail' in body)) return null
  const { detail } = body as { detail: unknown }
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{ loc: ['body', 'field'], msg }, ...]
    return detail.map((d) => `${(d?.loc ?? []).slice(1).join('.')}: ${d?.msg}`).join('; ')
  }
  return null
}

type RequestOptions = {
  method?: 'GET' | 'PATCH' | 'POST'
  body?: unknown
  /** Overrides the stored code (used to check a code before saving it). */
  hospitalCode?: string
}

async function request<T>(path: string, { method = 'GET', body, hospitalCode }: RequestOptions = {}): Promise<T> {
  const code = hospitalCode ?? storedHospitalCode
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let status: number
  let ok: boolean
  let text: string
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(code && { [HOSPITAL_CODE_HEADER]: code }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    status = res.status
    ok = res.ok
    text = await res.text()
  } catch {
    throw controller.signal.aborted
      ? new ApiNetworkError(`The server at ${API_URL} took too long to respond.`, true)
      : new ApiNetworkError(`Couldn't reach the server at ${API_URL}.`)
  } finally {
    clearTimeout(timer)
  }

  let json: unknown
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }

  if (!ok) throw new ApiHttpError(status, detailOf(json) ?? `Request failed (HTTP ${status}).`)
  if (json === undefined) throw new ApiHttpError(status, 'The server sent a response the app could not read.')
  return json as T
}

export const getHospital = (code?: string) => request<Hospital>('/hospital', { hospitalCode: code })
export const getFleet = () => request<FleetUnit[]>('/fleet')
export const getDemandScores = (hour: number) => request<DemandScore[]>(`/demand-scores?hour=${hour}`)

export const setUnitStatus = (callSign: string, status: AmbulanceStatus) =>
  request<unknown>(`/ambulances/${encodeURIComponent(callSign)}/status`, { method: 'PATCH', body: { status } })

export const setAssignmentStage = (callSign: string, status: AssignmentStage) =>
  request<unknown>(`/ambulances/${encodeURIComponent(callSign)}/assignment-status`, { method: 'PATCH', body: { status } })
