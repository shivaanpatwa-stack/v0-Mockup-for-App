import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  describeError,
  getDemandScores,
  getFleet,
  getHospital,
  isCodeNotFound,
  setAssignmentStage,
  setStoredHospitalCode,
  setUnitStatus,
} from '@/lib/api'
import type { AmbulanceStatus, AppError, AssignmentStage, FleetUnit, Hospital } from '@/lib/api'
import { istParts } from '@/lib/time'

const CODE_KEY = 'ambulanceiq.hospitalCode'
const NAME_KEY = 'ambulanceiq.hospitalName'
const UNIT_KEY = 'ambulanceiq.unit'

export const CODE_INVALID_NOTICE = 'Your hospital code is no longer valid.'

type StageTimes = Partial<Record<AssignmentStage, Date>>
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
  clearNotice: () => void

  hospital: Hospital | null
  fleet: FleetUnit[]
  /** At least one GET /fleet has succeeded for this hospital. */
  fleetLoaded: boolean
  unit: FleetUnit | null
  /** ward_code -> risk score for the hour of the unit's current assignment. */
  demand: Record<string, number>
  /** The last refresh failed; the data above is the last known data. */
  error: AppError | null
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

  const [hospital, setHospital] = useState<Hospital | null>(null)
  const [fleet, setFleet] = useState<FleetUnit[]>([])
  const [fleetLoaded, setFleetLoaded] = useState(false)
  const [demand, setDemand] = useState<Record<string, number>>({})
  const [error, setError] = useState<AppError | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [positionUpdate, setPositionUpdate] = useState<PositionUpdate | null>(null)
  const [stageLog, setStageLog] = useState<{ key: string; times: StageTimes }>({ key: '', times: {} })
  const [actionError, setActionError] = useState<AppError | null>(null)

  // Refs mirror state for callbacks that outlive a render (polling, in-flight requests).
  const codeRef = useRef<string | null>(null)
  const unitRef = useRef<string | null>(null)
  const hospitalRef = useRef<Hospital | null>(null)
  const fleetRef = useRef<FleetUnit[]>([])
  const lastAssignment = useRef<{ unitId: string; candidateId: string | null } | null>(null)
  const demandHour = useRef<number | null>(null)
  // A status change that has been shown but not confirmed by the server yet; polls must not undo it.
  const pendingStatus = useRef<{ callSign: string; status: AmbulanceStatus } | null>(null)

  const unit = useMemo(() => fleet.find((u) => u.call_sign === unitId) ?? null, [fleet, unitId])
  const assignment = unit?.current_assignment ?? null
  const assignmentKey = assignment ? `${assignment.candidate_id}|${assignment.valid_from}` : ''
  const stageTimes = stageLog.key === assignmentKey ? stageLog.times : {}

  const commitFleet = useCallback((next: FleetUnit[]) => {
    fleetRef.current = next
    setFleet(next)
  }, [])

  const commitHospital = useCallback((next: Hospital | null) => {
    hospitalRef.current = next
    setHospital(next)
  }, [])

  const resetData = useCallback(() => {
    commitHospital(null)
    commitFleet([])
    setFleetLoaded(false)
    setDemand({})
    setError(null)
    setLastUpdated(null)
    setPositionUpdate(null)
    setStageLog({ key: '', times: {} })
    setActionError(null)
    lastAssignment.current = null
    demandHour.current = null
    pendingStatus.current = null
  }, [commitFleet, commitHospital])

  useEffect(() => {
    AsyncStorage.multiGet([CODE_KEY, NAME_KEY, UNIT_KEY])
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
      })
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

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
    },
    [resetData],
  )

  const clearUnit = useCallback(async () => {
    unitRef.current = null
    lastAssignment.current = null
    pendingStatus.current = null
    setUnitId(null)
    setPositionUpdate(null)
    setStageLog({ key: '', times: {} })
    setActionError(null)
    await AsyncStorage.removeItem(UNIT_KEY).catch(() => {})
  }, [])

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
    },
    [resetData],
  )

  const changeHospital = useCallback(() => dropHospital(null), [dropHospital])
  // Any 401 "Invalid hospital code" means the stored code is stale (e.g. rotated by the hospital).
  const invalidateCode = useCallback(() => dropHospital(CODE_INVALID_NOTICE), [dropHospital])

  const refresh = useCallback(
    async (options?: { force?: boolean }) => {
      const code = codeRef.current
      if (!code) return
      try {
        const needHospital = options?.force || !hospitalRef.current
        const [list, hospitalInfo] = await Promise.all([
          getFleet(),
          needHospital ? getHospital() : Promise.resolve(hospitalRef.current),
        ])
        if (codeRef.current !== code) return // the hospital changed while this was in flight

        const pending = pendingStatus.current
        const merged = pending ? list.map((u) => (u.call_sign === pending.callSign ? { ...u, status: pending.status } : u)) : list
        commitFleet(merged)
        commitHospital(hospitalInfo)
        setFleetLoaded(true)
        setError(null)
        setLastUpdated(new Date())

        const current = merged.find((u) => u.call_sign === unitRef.current)
        if (unitRef.current && !current) {
          // The stored unit isn't in this hospital's fleet any more: pick again.
          await clearUnit()
          return
        }

        // A different candidate for the same unit means the optimizer re-planned it.
        const candidateId = current?.current_assignment?.candidate_id ?? null
        const previous = lastAssignment.current
        if (current && previous?.unitId === current.call_sign && previous.candidateId && candidateId && previous.candidateId !== candidateId) {
          setPositionUpdate({ name: current.current_assignment?.name ?? candidateId, revisedAt: new Date() })
        }
        lastAssignment.current = current ? { unitId: current.call_sign, candidateId } : null

        // Demand scores are per hour; only refetch when the assignment's hour changes.
        const validFrom = current?.current_assignment?.valid_from
        if (validFrom) {
          const hour = istParts(validFrom).hour
          if (demandHour.current !== hour) {
            try {
              const scores = await getDemandScores(hour)
              setDemand(Object.fromEntries(scores.map((s) => [s.ward_code, s.risk_score])))
              demandHour.current = hour
            } catch (err) {
              if (isCodeNotFound(err)) return invalidateCode()
              // Demand tags are decoration; the rest of the screen still works without them.
              setDemand({})
            }
          }
        }
      } catch (err) {
        if (codeRef.current !== code) return
        if (isCodeNotFound(err)) return invalidateCode()
        setError(describeError(err)) // last known data stays on screen
      }
    },
    [clearUnit, commitFleet, commitHospital, invalidateCode],
  )

  const selectUnit = useCallback(async (callSign: string) => {
    unitRef.current = callSign
    lastAssignment.current = null
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
        if (isCodeNotFound(err)) invalidateCode()
        return { ok: false, error: describeError(err) }
      }
    },
    [commitFleet, invalidateCode, refresh],
  )

  const setStage = useCallback(
    async (stage: AssignmentStage): Promise<ActionResult> => {
      const callSign = unitRef.current
      if (!callSign || !assignment) return { ok: false, error: { kind: 'http', message: 'No assignment to update.' } }
      try {
        await setAssignmentStage(callSign, stage)
      } catch (err) {
        if (isCodeNotFound(err)) invalidateCode()
        const failure = describeError(err)
        setActionError(failure)
        return { ok: false, error: failure }
      }
      setActionError(null)
      commitFleet(
        fleetRef.current.map((u) =>
          u.call_sign === callSign && u.current_assignment
            ? { ...u, current_assignment: { ...u.current_assignment, assignment_status: stage } }
            : u,
        ),
      )
      setStageLog((log) => ({
        key: assignmentKey,
        times: { ...(log.key === assignmentKey ? log.times : {}), [stage]: new Date() },
      }))
      return { ok: true }
    },
    [assignment, assignmentKey, commitFleet, invalidateCode],
  )

  const value = useMemo<FleetContextValue>(
    () => ({
      ready,
      hospitalCode,
      hospitalName,
      unitId,
      notice,
      clearNotice: () => setNotice(null),
      hospital,
      fleet,
      fleetLoaded,
      unit,
      demand,
      error,
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
    [ready, hospitalCode, hospitalName, unitId, notice, hospital, fleet, fleetLoaded, unit, demand, error, lastUpdated, positionUpdate, stageTimes, actionError, connect, selectUnit, clearUnit, changeHospital, refresh, setAvailability, setStage],
  )

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>
}
