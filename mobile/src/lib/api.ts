import { API_URL } from './config'

export type UnitType = 'ALS' | 'BLS'
export type AmbulanceStatus = 'available' | 'responding' | 'at_hospital' | 'unavailable'
// "cancelled" exists in the backend but is only used when the optimizer replaces a plan.
export type AssignmentStage = 'planned' | 'en_route' | 'in_position'

// Shapes below were copied from real responses of the running backend (GET /hospital, GET /fleet).
export type Hospital = {
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
export const NETWORK_MESSAGE = "Can't reach the server."
export const RATE_LIMIT_MESSAGE = 'Too many attempts. Try again in a few minutes.'
const TIMEOUT_MS = 8_000
const DEFAULT_RETRY_AFTER_S = 5 * 60 // when a 429 carries no usable Retry-After
const MAX_RETRY_AFTER_S = 60 * 60

/** No answer (no connection, DNS/TLS failure, the 8 s timeout) or a 5xx: the server is unreachable. Retry-able. */
export class ApiNetworkError extends Error {
  readonly timedOut: boolean
  readonly status: number | null
  constructor(message: string, options: { timedOut?: boolean; status?: number } = {}) {
    super(message)
    this.name = 'ApiNetworkError'
    this.timedOut = options.timedOut ?? false
    this.status = options.status ?? null
  }
}

/** Any other error status (400, 403, 404, 409, 422, ...). `detail` is the backend's own text. */
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

/** The hospital code was refused (401, or the older 404 "Hospital code not found"). */
export class ApiAuthError extends Error {
  readonly status: number
  constructor(status: number) {
    super('Hospital code refused')
    this.name = 'ApiAuthError'
    this.status = status
  }
}

/** 429: too many failed attempts from this device. Nothing is sent until `retryAt`. */
export class ApiRateLimitError extends Error {
  readonly retryAt: number
  constructor(retryAt: number) {
    super(RATE_LIMIT_MESSAGE)
    this.name = 'ApiRateLimitError'
    this.retryAt = retryAt
  }
}

export const isNetworkError = (err: unknown): err is ApiNetworkError => err instanceof ApiNetworkError
export const isAuthError = (err: unknown): err is ApiAuthError => err instanceof ApiAuthError
export const isRateLimitError = (err: unknown): err is ApiRateLimitError => err instanceof ApiRateLimitError

/** What the UI needs from an error: which banner to show and what it says. */
export type AppError =
  | { kind: 'network'; message: string } // shown with Retry; the last data stays on screen
  | { kind: 'http'; message: string } // the backend's own detail text
  | { kind: 'rate-limit'; message: string; retryAt: number }

export function describeError(err: unknown): AppError {
  if (err instanceof ApiNetworkError) return { kind: 'network', message: NETWORK_MESSAGE }
  if (err instanceof ApiRateLimitError) return { kind: 'rate-limit', message: RATE_LIMIT_MESSAGE, retryAt: err.retryAt }
  if (err instanceof ApiHttpError) return { kind: 'http', message: err.detail }
  if (err instanceof ApiAuthError) return { kind: 'http', message: 'Your hospital code is no longer valid.' }
  return { kind: 'http', message: err instanceof Error ? err.message : 'Something went wrong.' }
}

// --- Rate limiting -------------------------------------------------------------------------------
// One lockout for the whole app: once any call gets a 429, every request fails locally (no network)
// until the Retry-After time passes, so nothing can loop against the server.
let rateLimitedUntil = 0
const rateLimitListeners = new Set<(until: number | null) => void>()

/** Epoch ms when requests may resume, or null when not locked out. */
export function getRateLimitedUntil(): number | null {
  return rateLimitedUntil > Date.now() ? rateLimitedUntil : null
}

export function onRateLimitChange(listener: (until: number | null) => void): () => void {
  rateLimitListeners.add(listener)
  return () => {
    rateLimitListeners.delete(listener)
  }
}

function parseRetryAfterSeconds(header: string | null): number {
  if (header) {
    const trimmed = header.trim()
    const seconds = /^\d+$/.test(trimmed) ? Number(trimmed) : (Date.parse(trimmed) - Date.now()) / 1000 // delay-seconds or HTTP-date
    if (Number.isFinite(seconds)) return Math.min(MAX_RETRY_AFTER_S, Math.max(1, Math.ceil(seconds)))
  }
  return DEFAULT_RETRY_AFTER_S
}

// --- Auth failures -------------------------------------------------------------------------------
// The session provider registers this; it forgets the code, unit and cached data and returns to the code screen.
let authFailureHandler: (() => void) | null = null
export function setAuthFailureHandler(handler: (() => void) | null) {
  authFailureHandler = handler
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
  /** Check this code instead of the stored one. A refusal is then reported to the caller, not treated as a stale session. */
  hospitalCode?: string
}

/**
 * The only place that talks to the backend. The only hospital identifier it ever sends is X-Hospital-Code.
 *
 *   network failure / 5xx -> ApiNetworkError   ("Can't reach the server", Retry, nothing cleared)
 *   401 (or 404 "Hospital code not found") -> ApiAuthError, and the session is reset unless a code was passed in
 *   429 -> ApiRateLimitError, and all requests are held back until Retry-After passes
 *   anything else -> ApiHttpError with the backend's detail (403 included; the code is kept)
 */
async function request<T>(path: string, { method = 'GET', body, hospitalCode }: RequestOptions = {}): Promise<T> {
  const lockedUntil = getRateLimitedUntil()
  if (lockedUntil) throw new ApiRateLimitError(lockedUntil)

  const code = hospitalCode ?? storedHospitalCode
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let status: number
  let ok: boolean
  let text: string
  let retryAfter: string | null
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
    retryAfter = res.headers.get('Retry-After')
    text = await res.text()
  } catch {
    throw controller.signal.aborted
      ? new ApiNetworkError(NETWORK_MESSAGE, { timedOut: true })
      : new ApiNetworkError(NETWORK_MESSAGE)
  } finally {
    clearTimeout(timer)
  }

  let json: unknown
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }

  if (!ok) {
    if (status === 429) {
      rateLimitedUntil = Date.now() + parseRetryAfterSeconds(retryAfter) * 1000
      rateLimitListeners.forEach((listener) => listener(rateLimitedUntil))
      throw new ApiRateLimitError(rateLimitedUntil)
    }
    const detail = detailOf(json)
    if (status === 401 || (status === 404 && detail === HOSPITAL_CODE_NOT_FOUND)) {
      if (hospitalCode === undefined) authFailureHandler?.()
      throw new ApiAuthError(status)
    }
    if (status >= 500) throw new ApiNetworkError(NETWORK_MESSAGE, { status })
    throw new ApiHttpError(status, detail ?? `Request failed (HTTP ${status}).`)
  }
  if (json === undefined) throw new ApiNetworkError(NETWORK_MESSAGE, { status })
  return json as T
}

export const getHospital = (code?: string) => request<Hospital>('/hospital', { hospitalCode: code })
export const getFleet = () => request<FleetUnit[]>('/fleet')
export const getDemandScores = (hour: number) => request<DemandScore[]>(`/demand-scores?hour=${hour}`)

export const setUnitStatus = (callSign: string, status: AmbulanceStatus) =>
  request<unknown>(`/ambulances/${encodeURIComponent(callSign)}/status`, { method: 'PATCH', body: { status } })

export const setAssignmentStage = (callSign: string, status: AssignmentStage) =>
  request<unknown>(`/ambulances/${encodeURIComponent(callSign)}/assignment-status`, { method: 'PATCH', body: { status } })
