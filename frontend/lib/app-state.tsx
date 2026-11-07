'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ApiError,
  applyScenario,
  getFleet,
  getHospital,
  getRun,
  getRunHistory,
  optimize,
  saveHospitalName,
  simulateScenario,
  type FleetAmbulance,
  type Hospital,
  type OptimizeResult,
  type RunHistoryRow,
  type ScenarioRequest,
  type ScenarioResult,
} from '@/lib/api'
import { planFromResult, planFromRun, type Plan } from '@/lib/plan'

const FLEET_POLL_MS = 5000
const UNDO_MS = 10_000
/** A plan older than this is flagged as stale. */
const STALE_AFTER_MS = 60 * 60 * 1000
export const DEFAULT_SPACING_KM = 2
export const DEFAULT_TARGET_MIN = 20

export type RecalcStatus = 'idle' | 'running' | 'result' | 'error'
export type Toast = { id: number; text: string; undo?: () => void; until?: number; tone?: 'critical' | 'neutral' }

/** A calculated plan waiting for Apply / Discard. */
export type Preview = {
  source: 'recalculate' | 'what_if'
  result: OptimizeResult | ScenarioResult
  request: ScenarioRequest
  hour: number
}

export type Layers = { demand: boolean; reach: boolean; units: boolean }

type AppState = {
  hospital: Hospital | undefined
  fleet: FleetAmbulance[] | null
  history: RunHistoryRow[] | null
  loadError: string | null
  plan: Plan | null
  hour: number
  setHour: (h: number) => void
  spacingKm: number
  setSpacingKm: (km: number) => void
  targetMin: number
  setTargetMin: (m: number) => void
  inService: FleetAmbulance[]
  stale: { stale: boolean; reason: string | null }
  // Recalculate staging (3.6 A)
  recalcStatus: RecalcStatus
  recalcError: string | null
  recalcStartedAt: number | null
  preview: Preview | null
  recalculate: () => void
  previewScenario: (request: ScenarioRequest, result: ScenarioResult) => void
  applyPreview: () => void
  discardPreview: () => void
  pendingApply: boolean
  // Toasts
  toasts: Toast[]
  pushToast: (t: Omit<Toast, 'id'>) => number
  dismissToast: (id: number) => void
  // Live map view
  layers: Layers
  setLayers: (l: Layers) => void
  showUncovered: boolean
  setShowUncovered: (v: boolean) => void
  whatIfOpen: boolean
  setWhatIfOpen: (v: boolean) => void
  scenario: ScenarioResult | null
  setScenario: (s: ScenarioResult | null) => void
  comparing: boolean
  setComparing: (v: boolean) => void
  movesOpen: boolean
  setMovesOpen: (v: boolean) => void
  focusWard: string | null
  setFocusWard: (w: string | null) => void
  pendingScenarioRequest: ScenarioRequest | null
  setPendingScenarioRequest: (r: ScenarioRequest | null) => void
  // Refresh
  refreshHistory: () => Promise<void>
  refreshHospital: () => Promise<void>
  refreshFleet: () => Promise<void>
  setPlanFromRun: (runId: number) => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}

const NETWORK_ERROR = "Couldn't reach the planning service. The previous plan is still in place."

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof TypeError) return NETWORK_ERROR
  return (err as Error)?.message || 'Something went wrong.'
}

const signature = (ids: string[]) => [...ids].sort().join('|')

export function AppProvider({ children }: { children: ReactNode }) {
  const [hospital, setHospital] = useState<Hospital | undefined>()
  const [fleet, setFleet] = useState<FleetAmbulance[] | null>(null)
  const [history, setHistory] = useState<RunHistoryRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [hour, setHour] = useState(() => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date())) % 24)
  const [spacingKm, setSpacingKm] = useState(DEFAULT_SPACING_KM)
  const [targetMin, setTargetMin] = useState(DEFAULT_TARGET_MIN)
  const [recalcStatus, setRecalcStatus] = useState<RecalcStatus>('idle')
  const [recalcError, setRecalcError] = useState<string | null>(null)
  const [recalcStartedAt, setRecalcStartedAt] = useState<number | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [pendingApply, setPendingApply] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [layers, setLayers] = useState<Layers>({ demand: true, reach: true, units: true })
  const [showUncovered, setShowUncovered] = useState(false)
  const [whatIfOpen, setWhatIfOpen] = useState(false)
  const [scenario, setScenario] = useState<ScenarioResult | null>(null)
  const [comparing, setComparing] = useState(false)
  const [movesOpen, setMovesOpen] = useState(true)
  const [focusWard, setFocusWard] = useState<string | null>(null)
  const [pendingScenarioRequest, setPendingScenarioRequest] = useState<ScenarioRequest | null>(null)
  const [, setTick] = useState(0)
  const toastId = useRef(1)
  const applyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoredLatest = useRef(false)

  // Re-render every 30 s so "6 min ago" and staleness stay current.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = toastId.current++
    setToasts((all) => [...all.slice(-2), { ...t, id }])
    if (!t.undo) setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 5000)
    return id
  }, [])
  const dismissToast = useCallback((id: number) => setToasts((all) => all.filter((x) => x.id !== id)), [])

  const refreshHospital = useCallback(async () => {
    try {
      const found = await getHospital()
      setHospital(found)
      saveHospitalName(found.name)
    } catch (err) {
      setLoadError(errorText(err))
    }
  }, [])

  const refreshFleet = useCallback(async () => {
    try {
      setFleet(await getFleet())
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.warn('Fleet refresh failed', err)
    }
  }, [])

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await getRunHistory(50))
    } catch (err) {
      console.warn('Loading run history failed', err)
      setHistory((h) => h ?? [])
    }
  }, [])

  const setPlanFromRun = useCallback(async (runId: number) => {
    const detail = await getRun(runId)
    setPlan(planFromRun(detail))
    setHour(detail.target_hour)
  }, [])

  useEffect(() => {
    refreshHospital()
  }, [refreshHospital])

  useEffect(() => {
    if (!hospital) return
    refreshHistory()
    const poll = () => {
      if (!document.hidden) refreshFleet()
    }
    poll()
    const timer = setInterval(poll, FLEET_POLL_MS)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [hospital, refreshFleet, refreshHistory])

  // After a reload, the latest saved plan is the current plan (never an empty state when one exists).
  useEffect(() => {
    if (restoredLatest.current || plan || !history) return
    restoredLatest.current = true
    const latest = history.find((r) => r.status === 'succeeded')
    if (latest) setPlanFromRun(latest.run_id).catch((err) => console.warn('Loading the latest plan failed', err))
  }, [history, plan, setPlanFromRun])

  const inService = useMemo(() => (fleet ?? []).filter((a) => a.status !== 'unavailable'), [fleet])

  const stale = useMemo(() => {
    if (!plan) return { stale: false, reason: null }
    if (plan.hour !== hour) return { stale: true, reason: `Plan is for ${String(plan.hour).padStart(2, '0')}:00, map shows ${String(hour).padStart(2, '0')}:00` }
    if (fleet) {
      const planned = signature(plan.assignments.map((a) => a.ambulance_id))
      const now = signature(inService.map((a) => a.call_sign))
      if (planned !== now) return { stale: true, reason: 'Units in service changed' }
    }
    if (Date.now() - new Date(plan.calculatedAt).getTime() > STALE_AFTER_MS) return { stale: true, reason: 'Plan is over an hour old' }
    return { stale: false, reason: null }
  }, [plan, hour, fleet, inService])

  const recalculate = useCallback(async () => {
    if (!hospital || recalcStatus === 'running' || pendingApply) return
    setRecalcStatus('running')
    setRecalcError(null)
    setRecalcStartedAt(Date.now())
    const request: ScenarioRequest = { hour, min_spacing_km: spacingKm, max_response_minutes: targetMin }
    try {
      // Preview first (read-only, same planner as /optimize). Apply saves it.
      const result = await simulateScenario(request)
      setPreview({ source: 'recalculate', result, request, hour })
      setRecalcStatus('result')
    } catch (err) {
      setRecalcError(errorText(err))
      setRecalcStatus('error')
    } finally {
      setRecalcStartedAt(null)
    }
  }, [hospital, recalcStatus, pendingApply, hour, spacingKm, targetMin])

  const previewScenario = useCallback((request: ScenarioRequest, result: ScenarioResult) => {
    setPreview({ source: 'what_if', result, request, hour: request.hour })
    setRecalcStatus('result')
    setRecalcError(null)
  }, [])

  const discardPreview = useCallback(() => {
    setPreview(null)
    setRecalcStatus('idle')
  }, [])

  const applyPreview = useCallback(() => {
    if (!preview || pendingApply) return
    const previous = plan
    const shown = planFromResult({ ...(preview.result as OptimizeResult), run_id: null }, preview.hour)
    setPlan(shown)
    setHour(preview.hour)
    setPreview(null)
    setRecalcStatus('idle')
    setPendingApply(true)
    setScenario(null)
    setWhatIfOpen(false)
    const until = Date.now() + UNDO_MS
    let toast = 0
    const undo = () => {
      if (applyTimer.current) clearTimeout(applyTimer.current)
      applyTimer.current = null
      setPlan(previous)
      setPendingApply(false)
      dismissToast(toast)
      pushToast({ text: 'Plan not applied. The previous plan is back.' })
    }
    toast = pushToast({ text: 'Plan applied', undo, until })
    const { source, request } = preview
    applyTimer.current = setTimeout(async () => {
      applyTimer.current = null
      dismissToast(toast)
      try {
        const saved =
          source === 'what_if'
            ? await applyScenario(request)
            : await optimize(request.hour, request.min_spacing_km ?? DEFAULT_SPACING_KM, request.max_response_minutes ?? DEFAULT_TARGET_MIN)
        setPlan(planFromResult(saved, request.hour))
        pushToast({ text: saved.run_id ? `Saved to run history` : 'Applied, but saving to run history failed' })
        refreshHistory()
        refreshFleet()
      } catch (err) {
        setPlan(previous)
        setRecalcError(errorText(err))
        setRecalcStatus('error')
      } finally {
        setPendingApply(false)
      }
    }, UNDO_MS)
  }, [preview, pendingApply, plan, pushToast, dismissToast, refreshHistory, refreshFleet])

  useEffect(() => () => {
    if (applyTimer.current) clearTimeout(applyTimer.current)
  }, [])

  const value: AppState = {
    hospital, fleet, history, loadError, plan, hour, setHour, spacingKm, setSpacingKm, targetMin, setTargetMin,
    inService, stale, recalcStatus, recalcError, recalcStartedAt, preview, recalculate, previewScenario,
    applyPreview, discardPreview, pendingApply, toasts, pushToast, dismissToast, layers, setLayers,
    showUncovered, setShowUncovered, whatIfOpen, setWhatIfOpen, scenario, setScenario, comparing, setComparing,
    movesOpen, setMovesOpen, focusWard, setFocusWard, pendingScenarioRequest, setPendingScenarioRequest,
    refreshHistory, refreshHospital, refreshFleet, setPlanFromRun,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Units whose recommended position differs from where they are now. */
export type Move = {
  callSign: string
  type: string
  fromLabel: string
  fromWard: string | null
  from: { lat: number; lng: number } | null
  toLabel: string
  toWard: string | null
  to: { lat: number; lng: number }
  km: number | null
  status: string | null
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}
export { haversineKm }

/** Moves from each unit's current position (its live assignment, or the hospital) to `assignments`. */
export function movesFor(
  assignments: OptimizeResult['assignments'],
  fleet: FleetAmbulance[] | null,
  hospital: Hospital | undefined,
  previous?: OptimizeResult['assignments'],
): Move[] {
  return assignments.map((a) => {
    const prev = previous?.find((p) => p.ambulance_id === a.ambulance_id)
    const live = fleet?.find((f) => f.call_sign === a.ambulance_id)?.current_assignment
    // A live assignment to this same position that isn't reached yet means the unit still starts
    // from the hospital; one already in position (or elsewhere) is where it starts from.
    const sameSpot = live?.candidate_id === a.candidate_id
    const liveIsStart = live && live.lat != null && live.lng != null && (!sameSpot || live.assignment_status === 'in_position')
    const fromPoint = prev
      ? { lat: prev.lat, lng: prev.lng }
      : liveIsStart
        ? { lat: live!.lat!, lng: live!.lng! }
        : hospital
          ? { lat: hospital.lat, lng: hospital.lng }
          : null
    const fromLabel = prev ? prev.name ?? prev.candidate_id : liveIsStart ? live!.name ?? live!.candidate_id : 'Hospital base'
    const to = { lat: a.lat, lng: a.lng }
    return {
      callSign: a.ambulance_id,
      type: a.type,
      fromLabel,
      fromWard: prev?.ward_code ?? live?.ward_code ?? null,
      from: fromPoint,
      toLabel: a.name ?? a.candidate_id,
      toWard: a.ward_code,
      to,
      km: fromPoint ? haversineKm(fromPoint, to) : null,
      status: live?.assignment_status ?? null,
    }
  })
}

/** How many units change position between two plans (by call sign). */
export function unitsMoved(next: OptimizeResult['assignments'], prev: OptimizeResult['assignments'] | undefined) {
  if (!prev) return next.length
  return next.filter((a) => prev.find((p) => p.ambulance_id === a.ambulance_id)?.candidate_id !== a.candidate_id).length
}
