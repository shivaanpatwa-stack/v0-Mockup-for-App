import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  describeError,
  getDemandScores,
  getFleet,
  getHospital,
  getRateLimitedUntil,
  isAuthError,
  isRateLimitError,
  NETWORK_MESSAGE,
  onRateLimitChange,
  setAssignmentStage,
  setAuthFailureHandler,
  setStoredHospitalCode,
  setUnitStatus,
} from '@/lib/api'
import type { AmbulanceStatus, AppError, AssignmentStage, FleetUnit } from '@/lib/api'
import { istParts } from '@/lib/time'

const CODE_KEY = 'ambulanceiq.hospitalCode'
const NAME_KEY = 'ambulanceiq.hospitalName'
const UNIT_KEY = 'ambulanceiq.unit'
// Offline cache: the last good answers, shown when the server can't be reached.
const CACHE_HOSPITAL_KEY = 'cache.hospital'
const CACHE_UNIT_KEY = 'cache.unit'
const CACHE_WRITE_INTERVAL_MS = 5_000
const BACK_ONLINE_MS = 3_000

export const CODE_INVALID_NOTICE = 'Your hospital code is no longer valid.'

type StageTimes = Partial<Record<AssignmentStage, Date>>
/** The base, as cached: enough to draw it on the map and measure the distance to it. */
export type HospitalBasics = { name: string; lat: number; lng: number }
type CachedUnit = Pick<FleetUnit, 'call_sign' | 'type' | 'status' | 'current_assignment'> & { cachedAt: number }

const UNIT_TYPES = ['ALS', 'BLS']
const STATUSES = ['available', 'responding', 'at_hospital', 'unavailable']

function parseCachedHospital(raw: string | null | undefined): HospitalBasics | null {
  try {
    const h = raw ? JSON.parse(raw) : null
    return h && typeof h.name === 'string' && Number.isFinite(h.lat) && Number.isFinite(h.lng) ? { name: h.name, lat: h.lat, lng: h.lng } : null
  } catch {
    return null
  }
}

function parseCachedUnit(raw: string | null | undefined): CachedUnit | null {
  try {
    const u = raw ? JSON.parse(raw) : null
    if (!u || typeof u.call_sign !== 'string' || !UNIT_TYPES.includes(u.type) || !STATUSES.includes(u.status) || !Number.isFinite(u.cachedAt)) return null
    const a = u.current_assignment
    if (a !== null && !(a && typeof a.candidate_id === 'string' && typeof a.valid_from === 'string' && typeof a.valid_to === 'string')) return null
    return { call_sign: u.call_sign, type: u.type, status: u.status, current_assignment: a, cachedAt: u.cachedAt }
  } catch {
    return null
  }
}
export type PositionUpdate = { name: string; revisedAt: Date }
export type ActionResult = { ok: true } | { ok: false; error: AppError }

type FleetContextValue = {
  /** Stored code/unit have been read from the device. */
  ready: boolean
  hospitalCode: string | null
  hospitalName: string | null
  unitId: string | null
  /** Shown on the code screen after the server rejected the stored code. */
  notice: string | null
  /** Epoch ms until which the server has told this device to stop (HTTP 429); null when not locked out. */
  rateLimitUntil: number | null
  clearNotice: () => void

  hospital: HospitalBasics | null
  fleet: FleetUnit[]
  /** At least one GET /fleet has succeeded for this hospital. */
  fleetLoaded: boolean
  unit: FleetUnit | null
  /** ward_code -> risk score for the hour of the unit's current assignment. */
  demand: Record<string, number>
  /** The last refresh failed; the data above is the last known data. */
  error: AppError | null
  /** The server can't be reached (network failure or 5xx): data comes from the cache and actions are off. */
  offline: boolean
  /** A poll just succeeded after being offline; true for a few seconds. */
  backOnline: boolean
  /** When the data on screen was fetched (this session's last good poll, or the cache's timestamp). */
  dataAt: number | null
  lastUpdated: Date | null
  positionUpdate: PositionUpdate | null
  /** When this session moved the assignment to each stage (the backend doesn't store stage times). */
  stageTimes: StageTimes
  actionError: AppError | null

  connect: (code: string, name: string) => Promise<void>
  selectUnit: (callSign: string) => Promise<void>
  /** "Switch unit": forget the unit only. */
  clearUnit: () => Promise<void>
  /** "Change hospital": forget the code and the unit. */
  changeHospital: () => Promise<void>
  refresh: (options?: { force?: boolean }) => Promise<void>
  setAvailability: (status: AmbulanceStatus) => Promise<ActionResult>
  setStage: (stage: AssignmentStage) => Promise<ActionResult>
  dismissPositionUpdate: () => void
  clearActionError: () => void
}

const FleetContext = createContext<FleetContextValue | null>(null)

const assignmentKeyOf = (plan: { candidate_id: string; valid_from: string }) => `${plan.candidate_id}|${plan.valid_from}`

export function useFleet(): FleetContextValue {
  const value = useContext(FleetContext)
  if (!value) throw new Error('useFleet must be used inside <FleetProvider>')
  return value
}

export function FleetProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [hospitalCode, setHospitalCode] = useState<string | null>(null)
  const [hospitalName, setHospitalName] = useState<string | null>(null)
  const [unitId, setUnitId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(() => getRateLimitedUntil())

  const [hospital, setHospital] = useState<HospitalBasics | null>(null)
  const [fleet, setFleet] = useState<FleetUnit[]>([])
  const [fleetLoaded, setFleetLoaded] = useState(false)
  const [demand, setDemand] = useState<Record<string, number>>({})
  const [error, setError] = useState<AppError | null>(null)
  const [cachedAt, setCachedAt] = useState<number | null>(null)
  const [backOnline, setBackOnline] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [positionUpdate, setPositionUpdate] = useState<PositionUpdate | null>(null)
  const [stageLog, setStageLog] = useState<{ key: string; times: StageTimes }>({ key: '', times: {} })
  const [actionError, setActionError] = useState<AppError | null>(null)

  // Refs mirror state for callbacks that outlive a render (polling, in-flight requests).
  const codeRef = useRef<string | null>(null)
  const unitRef = useRef<string | null>(null)
  const hospitalRef = useRef<HospitalBasics | null>(null)
  const errorRef = useRef<AppError | null>(null)
  const backOnlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache writes: keep only the newest snapshot, and write at most once per CACHE_WRITE_INTERVAL_MS.
  const cachePending = useRef<{ hospital: HospitalBasics; unit: CachedUnit } | null>(null)
  const cacheTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cacheLastWrite = useRef(0)
  const fleetRef = useRef<FleetUnit[]>([])
  // The plan seen by the previous poll; null until the first poll for this unit has landed.
  const lastAssignment = useRef<{ unitId: string; candidateId: string | null; validFrom: string | null } | null>(null)
  // IST hour -> ward_code -> risk score. Scores for an hour don't change, so each hour is fetched once.
  const demandCache = useRef(new Map<number, Record<string, number>>())
  const demandRetryAt = useRef(0)
  // A status change that has been shown but not confirmed by the server yet; polls must not undo it.
  const pendingStatus = useRef<{ callSign: string; status: AmbulanceStatus } | null>(null)
  // Same idea for the assignment stage: the driver's tap is remembered for 10 s after the PATCH so a poll
  // that still carries the old value can neither undo it on screen nor look like a change from dispatch.
  const expectedStage = useRef<{ callSign: string; key: string; status: AssignmentStage; until: number } | null>(null)

  const unit = useMemo(() => fleet.find((u) => u.call_sign === unitId) ?? null, [fleet, unitId])
  const assignment = unit?.current_assignment ?? null
  const assignmentKey = assignment ? assignmentKeyOf(assignment) : ''
  const stageTimes = stageLog.key === assignmentKey ? stageLog.times : {}

  const commitFleet = useCallback((next: FleetUnit[]) => {
    fleetRef.current = next
    setFleet(next)
  }, [])

  const commitHospital = useCallback((next: HospitalBasics | null) => {
    hospitalRef.current = next
    setHospital(next)
  }, [])

  const commitError = useCallback((next: AppError | null) => {
    errorRef.current = next
    setError(next)
  }, [])

  const flushCache = useCallback(() => {
    cacheTimer.current = null
    const pending = cachePending.current
    if (!pending) return
    cachePending.current = null
    cacheLastWrite.current = Date.now()
    AsyncStorage.multiSet([
      [CACHE_HOSPITAL_KEY, JSON.stringify(pending.hospital)],
      [CACHE_UNIT_KEY, JSON.stringify(pending.unit)],
    ]).catch(() => {})
  }, [])

  const queueCacheWrite = useCallback(
    (hospitalBasics: HospitalBasics, cachedUnit: CachedUnit) => {
      cachePending.current = { hospital: hospitalBasics, unit: cachedUnit }
      if (cacheTimer.current) return // a write is already scheduled and will pick up this newest snapshot
      cacheTimer.current = setTimeout(flushCache, Math.max(0, cacheLastWrite.current + CACHE_WRITE_INTERVAL_MS - Date.now()))
    },
    [flushCache],
  )

  /** Forget the cache, including any write that hasn't happened yet (so it can't come back). */
  const clearCache = useCallback(async () => {
    if (cacheTimer.current) clearTimeout(cacheTimer.current)
    cacheTimer.current = null
    cachePending.current = null
    setCachedAt(null)
    await AsyncStorage.multiRemove([CACHE_HOSPITAL_KEY, CACHE_UNIT_KEY]).catch(() => {})
  }, [])

  useEffect(
    () => () => {
      if (backOnlineTimer.current) clearTimeout(backOnlineTimer.current)
      if (cacheTimer.current) clearTimeout(cacheTimer.current)
    },
    [],
  )

  const resetData = useCallback(() => {
    commitHospital(null)
    commitFleet([])
    setFleetLoaded(false)
    setDemand({})
    commitError(null)
    setBackOnline(false)
    setLastUpdated(null)
    setPositionUpdate(null)
    setStageLog({ key: '', times: {} })
    setActionError(null)
    lastAssignment.current = null
    pendingStatus.current = null
    expectedStage.current = null
    demandCache.current.clear()
    demandRetryAt.current = 0
  }, [commitError, commitFleet, commitHospital])

  useEffect(() => {
    AsyncStorage.multiGet([CODE_KEY, NAME_KEY, UNIT_KEY, CACHE_HOSPITAL_KEY, CACHE_UNIT_KEY])
      .then((pairs) => {
        const stored = Object.fromEntries(pairs)
        const code = stored[CODE_KEY] ?? null
        // A unit only means something together with the hospital it belongs to.
        const storedUnit = code ? (stored[UNIT_KEY] ?? null) : null
        codeRef.current = code
        unitRef.current = storedUnit
        setStoredHospitalCode(code)
        setHospitalCode(code)
        setHospitalName(code ? (stored[NAME_KEY] ?? null) : null)
        setUnitId(storedUnit)

        // Show the last known position straight away; the first poll replaces it (or the offline banner explains it).
        const cachedUnit = parseCachedUnit(stored[CACHE_UNIT_KEY])
        const cachedHospital = parseCachedHospital(stored[CACHE_HOSPITAL_KEY])
        if (code && storedUnit && cachedUnit?.call_sign === storedUnit) {
          const { cachedAt: at, ...fields } = cachedUnit
          commitFleet([{ ...fields, status_updated_at: null }])
          commitHospital(cachedHospital)
          setCachedAt(at)
        }
      })
      .catch(() => {})
      .finally(() => setReady(true))
  }, [commitFleet, commitHospital])

  const connect = useCallback(
    async (code: string, name: string) => {
      codeRef.current = code
      unitRef.current = null
      setStoredHospitalCode(code)
      resetData()
      setNotice(null)
      setHospitalCode(code)
      setHospitalName(name)
      setUnitId(null)
      await AsyncStorage.multiSet([
        [CODE_KEY, code],
        [NAME_KEY, name],
      ]).catch(() => {})
      await AsyncStorage.removeItem(UNIT_KEY).catch(() => {})
      await clearCache()
    },
    [clearCache, resetData],
  )

  const clearUnit = useCallback(async () => {
    unitRef.current = null
    lastAssignment.current = null
    pendingStatus.current = null
    expectedStage.current = null
    setUnitId(null)
    setPositionUpdate(null)
    setStageLog({ key: '', times: {} })
    setActionError(null)
    await AsyncStorage.removeItem(UNIT_KEY).catch(() => {})
    await clearCache()
  }, [clearCache])

  const dropHospital = useCallback(
    async (message: string | null) => {
      codeRef.current = null
      unitRef.current = null
      setStoredHospitalCode(null)
      resetData()
      setHospitalCode(null)
      setHospitalName(null)
      setUnitId(null)
      setNotice(message)
      await AsyncStorage.multiRemove([CODE_KEY, NAME_KEY, UNIT_KEY]).catch(() => {})
      await clearCache()
    },
    [clearCache, resetData],
  )

  const changeHospital = useCallback(() => dropHospital(null), [dropHospital])
  // Any response saying "Hospital code not found" means the stored code is stale.
  const invalidateCode = useCallback(() => dropHospital(CODE_INVALID_NOTICE), [dropHospital])

  const refresh = useCallback(
    async (options?: { force?: boolean }) => {
      const code = codeRef.current
      if (!code) return
      if (getRateLimitedUntil()) return // polling is paused until the server's Retry-After passes
      try {
        const needHospital = options?.force || !hospitalRef.current
        const [list, hospitalInfo] = await Promise.all([
          getFleet(),
          needHospital ? getHospital() : Promise.resolve(hospitalRef.current),
        ])
        if (codeRef.current !== code) return // the hospital changed while this was in flight

        // Show what the driver just did even if the server's answer predates it.
        const pending = pendingStatus.current
        let expected = expectedStage.current
        if (expected && Date.now() > expected.until) expected = expectedStage.current = null
        const merged = list.map((u) => {
          let unit = u
          if (pending && u.call_sign === pending.callSign) unit = { ...unit, status: pending.status }
          const plan = unit.current_assignment
          if (expected && u.call_sign === expected.callSign && plan && assignmentKeyOf(plan) === expected.key) {
            unit = { ...unit, current_assignment: { ...plan, assignment_status: expected.status } }
          }
          return unit
        })
        const basics = hospitalInfo ? { name: hospitalInfo.name, lat: hospitalInfo.lat, lng: hospitalInfo.lng } : null
        const fetchedAt = Date.now()
        commitFleet(merged)
        commitHospital(basics)
        setFleetLoaded(true)
        setLastUpdated(new Date(fetchedAt))
        setCachedAt(null)

        // Back from offline: drop the banner and say so briefly.
        if (errorRef.current?.kind === 'network') {
          setBackOnline(true)
          if (backOnlineTimer.current) clearTimeout(backOnlineTimer.current)
          backOnlineTimer.current = setTimeout(() => setBackOnline(false), BACK_ONLINE_MS)
        }
        commitError(null)

        const current = merged.find((u) => u.call_sign === unitRef.current)
        if (unitRef.current && !current) {
          // The stored unit isn't in this hospital's fleet any more: pick again.
          await clearUnit()
          return
        }

        // Remember this answer for when the server can't be reached.
        if (current && basics) {
          queueCacheWrite(basics, {
            call_sign: current.call_sign,
            type: current.type,
            status: current.status,
            current_assignment: current.current_assignment,
            cachedAt: fetchedAt,
          })
        }

        // The plan changed under the driver: a different candidate or a different time window.
        const plan = current?.current_assignment ?? null
        const snapshot = current
          ? { unitId: current.call_sign, candidateId: plan?.candidate_id ?? null, validFrom: plan?.valid_from ?? null }
          : null
        const previous = lastAssignment.current
        if (
          current && plan && previous?.unitId === current.call_sign &&
          (previous.candidateId !== plan.candidate_id || previous.validFrom !== plan.valid_from)
        ) {
          setPositionUpdate({ name: plan.name ?? plan.candidate_id, revisedAt: new Date() })
        }
        lastAssignment.current = snapshot

        // Demand scores are per IST hour of the plan's start.
        if (plan?.valid_from) {
          const hour = istParts(plan.valid_from).hour
          const cached = demandCache.current.get(hour)
          if (cached) {
            setDemand(cached)
          } else if (Date.now() >= demandRetryAt.current) {
            try {
              const scores = await getDemandScores(hour)
              const byWard = Object.fromEntries(scores.map((s) => [s.ward_code, s.risk_score]))
              demandCache.current.set(hour, byWard)
              setDemand(byWard)
            } catch (err) {
              if (isAuthError(err)) return // the session was reset centrally
              // The demand chip is decoration: hide it, keep the screen working, and try again in a minute.
              demandRetryAt.current = Date.now() + 60_000
              setDemand({})
            }
          } else {
            setDemand({})
          }
        }
      } catch (err) {
        if (codeRef.current !== code) return
        // A refused code resets the session and a 429 shows the lockout banner; both are handled centrally.
        if (isAuthError(err) || isRateLimitError(err)) return
        commitError(describeError(err)) // last known data (or the cache) stays on screen
      }
    },
    [clearUnit, commitError, commitFleet, commitHospital, queueCacheWrite],
  )

  // Central reactions to what the fetch wrapper sees.
  useEffect(() => {
    setAuthFailureHandler(() => {
      invalidateCode()
    })
    return () => setAuthFailureHandler(null)
  }, [invalidateCode])

  useEffect(() => onRateLimitChange(setRateLimitUntil), [])

  // When the lockout ends, clear the banner and let polling pick up again (once; never a loop).
  useEffect(() => {
    if (!rateLimitUntil) return
    const wait = rateLimitUntil - Date.now()
    if (wait <= 0) {
      setRateLimitUntil(null)
      return
    }
    const timer = setTimeout(() => {
      setRateLimitUntil(null)
      refresh()
    }, wait + 250)
    return () => clearTimeout(timer)
  }, [rateLimitUntil, refresh])

  const selectUnit = useCallback(async (callSign: string) => {
    unitRef.current = callSign
    lastAssignment.current = null
    expectedStage.current = null
    setUnitId(callSign)
    setPositionUpdate(null)
    setStageLog({ key: '', times: {} })
    setActionError(null)
    await AsyncStorage.setItem(UNIT_KEY, callSign).catch(() => {})
  }, [])

  const setAvailability = useCallback(
    async (status: AmbulanceStatus): Promise<ActionResult> => {
      const callSign = unitRef.current
      if (!callSign) return { ok: false, error: { kind: 'http', message: 'No unit selected.' } }
      if (errorRef.current?.kind === 'network') return { ok: false, error: { kind: 'network', message: NETWORK_MESSAGE } }

      const apply = (value: AmbulanceStatus) =>
        commitFleet(fleetRef.current.map((u) => (u.call_sign === callSign ? { ...u, status: value } : u)))
      const previous = fleetRef.current.find((u) => u.call_sign === callSign)?.status

      pendingStatus.current = { callSign, status }
      apply(status) // update the UI immediately
      try {
        await setUnitStatus(callSign, status)
        pendingStatus.current = null
        refresh()
        return { ok: true }
      } catch (err) {
        pendingStatus.current = null
        if (previous) apply(previous) // roll back
        return { ok: false, error: describeError(err) }
      }
    },
    [commitFleet, refresh],
  )

  const setStage = useCallback(
    async (stage: AssignmentStage): Promise<ActionResult> => {
      const callSign = unitRef.current
      const plan = fleetRef.current.find((u) => u.call_sign === callSign)?.current_assignment
      if (!callSign || !plan) return { ok: false, error: { kind: 'http', message: 'No assignment to update.' } }
      if (errorRef.current?.kind === 'network') return { ok: false, error: { kind: 'network', message: NETWORK_MESSAGE } }

      const key = assignmentKeyOf(plan)
      const previous = plan.assignment_status
      const apply = (status: AssignmentStage) =>
        commitFleet(
          fleetRef.current.map((u) =>
            u.call_sign === callSign && u.current_assignment && assignmentKeyOf(u.current_assignment) === key
              ? { ...u, current_assignment: { ...u.current_assignment, assignment_status: status } }
              : u,
          ),
        )

      expectedStage.current = { callSign, key, status: stage, until: Date.now() + 10_000 }
      apply(stage) // update the UI immediately
      setStageLog((log) => ({ key, times: { ...(log.key === key ? log.times : {}), [stage]: new Date() } }))
      try {
        await setAssignmentStage(callSign, stage)
        expectedStage.current = { callSign, key, status: stage, until: Date.now() + 10_000 }
        setActionError(null)
        return { ok: true }
      } catch (err) {
        expectedStage.current = null
        apply(previous) // roll back
        setStageLog((log) => {
          if (log.key !== key) return log
          const { [stage]: _undone, ...rest } = log.times
          return { key, times: rest }
        })
        const failure = describeError(err)
        setActionError(failure)
        return { ok: false, error: failure }
      }
    },
    [commitFleet],
  )

  const value = useMemo<FleetContextValue>(
    () => ({
      ready,
      hospitalCode,
      hospitalName,
      unitId,
      notice,
      rateLimitUntil,
      clearNotice: () => setNotice(null),
      hospital,
      fleet,
      fleetLoaded,
      unit,
      demand,
      error,
      offline: error?.kind === 'network',
      backOnline,
      dataAt: lastUpdated ? lastUpdated.getTime() : cachedAt,
      lastUpdated,
      positionUpdate,
      stageTimes,
      actionError,
      connect,
      selectUnit,
      clearUnit,
      changeHospital,
      refresh,
      setAvailability,
      setStage,
      dismissPositionUpdate: () => setPositionUpdate(null),
      clearActionError: () => setActionError(null),
    }),
    [ready, hospitalCode, hospitalName, unitId, notice, rateLimitUntil, hospital, fleet, fleetLoaded, unit, demand, error, backOnline, cachedAt, lastUpdated, positionUpdate, stageTimes, actionError, connect, selectUnit, clearUnit, changeHospital, refresh, setAvailability, setStage],
  )

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>
}
