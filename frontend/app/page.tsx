'use client'



import dynamic from 'next/dynamic'

import { useCallback, useEffect, useState } from 'react'

import {

  apiFetch,

  ApiError,

  getFleet,

  getHospital,

  getRun,

  getRuns,

  readErrorMessage,

  saveHospitalName,

  simulate,

  type AmbulanceAssignment,

  type AmbulanceStatus,

  type AssignmentStatus,

  type FleetAmbulance,

  type Hospital,

  type OptimizeResult,

  type RunDetail,

  type RunSummary,

  type SimulationResult,

} from '@/lib/api'

import EditFleetDialog from '@/components/edit-fleet-dialog'

import AppHeader, { type NavSection } from '@/components/app-header'

import HospitalMenu from '@/components/hospital-menu'

import KpiStrip from '@/components/kpi-strip'

import MapLegend from '@/components/map-legend'
import OptimizationControls from '@/components/optimization-controls'

import WhatIfPanel from '@/components/what-if-panel'
import FleetTable from '@/components/fleet-table'
import RunHistoryTable from '@/components/run-history-table'
import { WARD_CENTROIDS } from '@/lib/ward-names'



const MumbaiMap = dynamic(() => import('@/components/mumbai-map'), {

  ssr: false,

  loading: () => <div style={{ height: '100%' }} />,

})



type FleetRow = {

  id: string

  zone: string

  position: string

  fromBase: string

  type: string

  status: AmbulanceStatus | null

  assignmentStatus: AssignmentStatus | null

}



const placeholderFleet: FleetRow[] = [

  { id: 'AMB-001', zone: 'Andheri West', position: 'K/W Ward', fromBase: '—', type: 'ALS', status: 'available', assignmentStatus: null },

  { id: 'AMB-002', zone: 'Bandra', position: 'H/W Ward', fromBase: '—', type: 'BLS', status: 'responding', assignmentStatus: null },

  { id: 'AMB-003', zone: 'Parel', position: 'G/S Ward', fromBase: '—', type: 'ALS', status: 'at_hospital', assignmentStatus: null },

  { id: 'AMB-004', zone: 'Dadar', position: 'G/N Ward', fromBase: '—', type: 'BLS', status: 'available', assignmentStatus: null },

  { id: 'AMB-005', zone: 'Worli', position: 'D Ward', fromBase: '—', type: 'ALS', status: 'unavailable', assignmentStatus: null },

]



const FLEET_POLL_MS = 5000

const RECENT_RUNS_LIMIT = 10



const istParts = new Intl.DateTimeFormat('en-IN', {

  timeZone: 'Asia/Kolkata',

  day: 'numeric',

  month: 'short',

  hour: 'numeric',

  minute: '2-digit',

  hour12: true,

})



/** e.g. "9 Oct, 9:14 PM" in Asia/Kolkata. */

function formatIST(iso: string) {

  const part = Object.fromEntries(istParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))

  return `${part.day} ${part.month}, ${part.hour}:${part.minute} ${String(part.dayPeriod).toUpperCase()}`

}



function formatRelativeTime(iso: string): string {

  const diffMs = Date.now() - new Date(iso).getTime()

  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'Just now'

  const diffMin = Math.floor(diffSec / 60)

  if (diffMin < 60) return `${diffMin}m ago`

  const diffHours = Math.floor(diffMin / 60)

  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)

  if (diffDays === 1) return 'Yesterday'

  if (diffDays < 30) return `${diffDays} days ago`

  return formatIST(iso)

}



function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {

  const R = 6371

  const dLat = (lat2 - lat1) * (Math.PI / 180)

  const dLon = (lon2 - lon1) * (Math.PI / 180)

  const a =

    Math.sin(dLat / 2) * Math.sin(dLat / 2) +

    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c

}



function distanceFromBase(hospital: Hospital | undefined, lat: number | null | undefined, lng: number | null | undefined): string {

  if (!hospital || lat == null || lng == null) return '—'

  return `${haversineKm(hospital.lat, hospital.lng, lat, lng).toFixed(1)} km`

}



/** A saved run's assignments in the shape the map draws; rows without a known position are skipped. */

function pastRunMarkers(view: RunDetail): AmbulanceAssignment[] {

  return view.assignments.flatMap((a) =>

    a.lat === null || a.lng === null ? [] : [{ ...a, lat: a.lat, lng: a.lng, weighted_score: a.weighted_score ?? 0 }],

  )

}



const STATUS_LABEL: Record<AmbulanceStatus, string> = {

  available: 'Available',

  responding: 'Responding',

  at_hospital: 'At hospital',

  unavailable: 'Unavailable',

}



const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {

  planned: 'planned',

  en_route: 'en route',

  in_position: 'in position',

  cancelled: 'cancelled',

}



/** One row per ambulance: live status from GET /fleet, position from the latest run when there is one. */

function buildFleetRows(fleet: FleetAmbulance[] | null, run: Run | null, hospital: Hospital | undefined): FleetRow[] {

  const fromRun = new Map(run?.assignments.map((a) => [a.ambulance_id, a]))

  if (fleet) {

    return fleet.map((amb) => {

      const planned = fromRun.get(amb.call_sign)

      const current = amb.current_assignment

      const lat = planned?.lat ?? current?.lat ?? null

      const lng = planned?.lng ?? current?.lng ?? null

      return {

        id: amb.call_sign,

        zone: planned?.ward_code ?? current?.ward_code ?? '—',

        position: planned?.name ?? planned?.candidate_id ?? current?.name ?? current?.candidate_id ?? '—',

        fromBase: distanceFromBase(hospital, lat, lng),

        type: amb.type,

        status: amb.status,

        assignmentStatus:

          current && (!planned || planned.candidate_id === current.candidate_id) ? current.assignment_status : null,

      }

    })

  }

  if (run) {

    return run.assignments.map((a) => ({

      id: a.ambulance_id,

      zone: a.ward_code ?? '—',

      position: a.name ?? a.candidate_id,

      fromBase: distanceFromBase(hospital, a.lat, a.lng),

      type: a.type,

      status: null,

      assignmentStatus: null,

    }))

  }

  return placeholderFleet

}



const DEFAULT_SPACING_KM = 2

const MAX_SPACING_KM = 10

const NETWORK_ERROR = "Can't reach the server. Is the backend running?"



type Run = OptimizeResult & { hour: number }



function formatHour(hour: number) {

  return hour === 0 ? '12:00 AM' : hour < 12 ? `${hour}:00 AM` : `${hour === 12 ? 12 : hour - 12}:00 PM`

}



/** Ambulances the optimizer can place: every status except unavailable (out of service). */

const inService = (hospital: Hospital) => hospital.ambulances.filter((a) => a.status !== 'unavailable')



function fleetSummary(hospital: Hospital) {

  const active = inService(hospital)

  const count = (type: 'ALS' | 'BLS') => active.filter((a) => a.type === type).length

  return `Fleet: ${active.length} in service (${count('ALS')} ALS, ${count('BLS')} BLS)`

}



export default function Page() {

  const [hour, setHour] = useState(8)

  // Kept as typed so the field can be briefly empty while editing.

  const [spacing, setSpacing] = useState(String(DEFAULT_SPACING_KM))

  const [run, setRun] = useState<Run | null>(null)

  const [loading, setLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)

  // undefined while loading; GET /hospital returning 404 redirects to /register instead.

  const [hospital, setHospital] = useState<Hospital | undefined>(undefined)

  const [fleet, setFleet] = useState<FleetAmbulance[] | null>(null)

  const [recentRuns, setRecentRuns] = useState<RunSummary[] | null>(null)

  // A saved run shown on the map instead of the live result, and the run being loaded.

  const [viewing, setViewing] = useState<RunDetail | null>(null)

  const [loadingRunId, setLoadingRunId] = useState<number | null>(null)

  // An unsaved what-if result shown on the map instead of the live result.

  const [simulation, setSimulation] = useState<SimulationResult | null>(null)

  const [simRunning, setSimRunning] = useState(false)

  const [editOpen, setEditOpen] = useState(false)

  const [fleetChanged, setFleetChanged] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null)

  const [activeNav, setActiveNav] = useState<NavSection>('overview')
  const [highlightedAmbulanceId, setHighlightedAmbulanceId] = useState<string | null>(null)
  const [mapFocus, setMapFocus] = useState<{
    lat: number
    lng: number
    zoom?: number
    wardCode?: string
    key?: number
  } | null>(null)

  const handleZoomToWard = useCallback((code: string) => {
    const centroid = WARD_CENTROIDS[code]
    if (centroid) {
      setMapFocus({
        lat: centroid.lat,
        lng: centroid.lng,
        zoom: 14,
        wardCode: code,
        key: Date.now(),
      })
      const mapEl = document.getElementById('analytics')
      if (mapEl) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [])



  const spacingKm = Number(spacing)

  const spacingValid = spacing.trim() !== '' && spacingKm >= 0 && spacingKm <= MAX_SPACING_KM



  useEffect(() => {

    document.title = 'AmbulanceIQ | Mumbai response model'

  }, [])



  useEffect(() => {

    const controller = new AbortController()

    getHospital(controller.signal)

      .then((found) => {

        setHospital(found)

        saveHospitalName(found.name)

      })

      .catch((err) => {

        if ((err as Error).name === 'AbortError') return

        setError(err instanceof TypeError ? NETWORK_ERROR : (err as Error).message)

      })

    return () => controller.abort()

  }, [])



  // Live fleet status: poll while the tab is visible, refresh as soon as it becomes visible again.

  useEffect(() => {

    if (!hospital) return

    let controller: AbortController | null = null

    const poll = () => {

      if (document.hidden) return

      controller?.abort()

      controller = new AbortController()

      getFleet(controller.signal)

        .then(setFleet)

        .catch((err) => {

          if ((err as Error).name !== 'AbortError') console.warn('Fleet refresh failed', err)

        })

    }

    poll()

    const timer = setInterval(poll, FLEET_POLL_MS)

    document.addEventListener('visibilitychange', poll)

    return () => {

      clearInterval(timer)

      document.removeEventListener('visibilitychange', poll)

      controller?.abort()

    }

  }, [hospital])



  const refreshRuns = useCallback(async () => {

    if (!hospital) return

    try {

      setRecentRuns(await getRuns(RECENT_RUNS_LIMIT))

    } catch (err) {

      console.warn('Loading recent runs failed', err)

    }

  }, [hospital])



  useEffect(() => {

    refreshRuns()

  }, [refreshRuns])



  async function refreshHospital() {

    try {

      const found = await getHospital()

      setHospital(found)

      saveHospitalName(found.name)

    } catch (err) {

      setError(err instanceof ApiError ? err.message : NETWORK_ERROR)

    }

  }



  async function onFleetEdited() {

    setFleetChanged(true)

    await refreshHospital()

  }



  async function runSimulation(params: {
    numAmbulances: number
    radiusKm: number
    spacingKm?: number
    maxResponseMinutes?: number
    hour?: number
  }) {

    setViewing(null)

    setSimRunning(true)

    setError(null)

    try {

      setSimulation(

        await simulate({
          hour: params.hour ?? hour,
          num_ambulances: params.numAmbulances,
          operating_radius_km: params.radiusKm,
          min_spacing_km: params.spacingKm ?? spacingKm,
          max_response_minutes: params.maxResponseMinutes ?? 20,
        }),

      )

    } catch (err) {

      setError(err instanceof ApiError ? err.message : NETWORK_ERROR)

    } finally {

      setSimRunning(false)

    }

  }



  async function viewRun(runId: number) {

    setSimulation(null)

    setLoadingRunId(runId)

    setError(null)

    try {

      setViewing(await getRun(runId))

    } catch (err) {

      setError(err instanceof ApiError ? err.message : NETWORK_ERROR)

    } finally {

      setLoadingRunId(null)

    }

  }



  async function recalculate() {

    if (!hospital || !spacingValid) return

    setViewing(null)

    setSimulation(null)

    setLoading(true)

    setError(null)

    try {

      const params = new URLSearchParams({

        hour: String(hour),

        min_spacing_km: String(spacingKm),

      })

      const res = await apiFetch(`/optimize?${params}`)

      if (!res.ok) {

        setError(await readErrorMessage(res, res.status === 503 ? 'Server data unavailable' : 'Optimization failed'))

        return

      }

      const result: OptimizeResult = await res.json()

      setRun({ ...result, hour })

      setFleetChanged(false)
      setConfirmationMessage(`Positions optimized for ${formatHour(hour)} (${result.assignments.length} units assigned)`)
      setTimeout(() => setConfirmationMessage(null), 4500)

    } catch (err) {

      setError(err instanceof ApiError ? err.message : NETWORK_ERROR)

    } finally {

      setLoading(false)

      refreshRuns()

    }

  }



  const lastSucceeded = recentRuns?.find((r) => r.status === 'succeeded')

  const mapHour = viewing ? viewing.target_hour : simulation ? simulation.parameters.hour : hour

  const fleetRows = buildFleetRows(fleet, run, hospital)

  const realRows = fleet !== null || run !== null



  return (

    <main className="dashboard-shell">

      {/* 1. Structured Header & Navigation */}

      <AppHeader

        hospital={hospital}

        onHospitalChanged={refreshHospital}

        activeNav={activeNav}

        onNavSelect={setActiveNav}

      />



      {/* 2. Controls Bar (One Row, Three Groups) */}

      <OptimizationControls
        hour={hour}
        onHourChange={setHour}
        spacing={spacing}
        onSpacingChange={setSpacing}
        spacingValid={spacingValid}
        maxSpacingKm={MAX_SPACING_KM}
        hospital={hospital}
        fleetChanged={fleetChanged}
        loading={loading}
        onRecalculate={recalculate}
        lastSucceeded={lastSucceeded}
        recentRunsCount={recentRuns?.length ?? 0}
        confirmationMessage={confirmationMessage}
        formatHour={formatHour}
        formatIST={formatIST}
      />



      {error && (

        <p className="controls-error" role="alert">

          {error}

          <button type="button" className="banner-dismiss" aria-label="Dismiss error" onClick={() => setError(null)}>

            ×

          </button>

        </p>

      )}



      {viewing && (

        <div className="controls-notice viewing-banner" role="status">

          <p>Viewing run #{viewing.run_id} from {formatIST(viewing.created_at)} ({formatHour(viewing.target_hour)} plan)</p>

          <button type="button" className="back-to-live" onClick={() => setViewing(null)}>Back to live</button>

        </div>

      )}



      {simulation && (

        <div className="controls-notice viewing-banner simulation-banner" role="status">

          <p>Simulation — not saved ({simulation.parameters.num_ambulances} ambulances, {simulation.parameters.operating_radius_km} km, {formatHour(simulation.parameters.hour)}{simulation.parameters.synthetic_ambulances > 0 ? `, incl. ${simulation.parameters.synthetic_ambulances} simulated BLS` : ''})</p>

          <button type="button" className="back-to-live" onClick={() => setSimulation(null)}>Discard</button>

        </div>

      )}



      {fleetChanged && <p className="controls-notice" role="status">Fleet changed — recalculate to update positions.</p>}



      {!viewing && !simulation && run && !run.coverage_guaranteed && (

        <div className="controls-notice coverage-notice" role="status">

          <p>Fleet too small to guarantee {run.max_response_minutes}-minute coverage of every ward. Uncovered: {run.uncovered_wards.length ? run.uncovered_wards.join(', ') : 'none'}.</p>

          {run.uncoverable_wards.length > 0 && <p className="coverage-secondary">{run.uncoverable_wards.join(', ')} {run.uncoverable_wards.length === 1 ? 'is' : 'are'} outside what nearby positions can reach in {run.max_response_minutes} minutes.</p>}

        </div>

      )}



      {/* What-if simulator collapsed under the controls */}

      {hospital && (

        <WhatIfPanel

          defaultFleet={inService(hospital).length}

          defaultRadiusKm={hospital.operating_radius_km}

          currentSpacingKm={spacingKm}

          currentHour={hour}

          running={simRunning}

          disabled={!spacingValid}

          simulation={simulation}

          liveRun={run}

          onRun={runSimulation}

          onDiscard={() => setSimulation(null)}

        />

      )}



      {/* 4 & 5. Map + Optimization Impact */}

      <section id="analytics" className="content-grid">

        <div className="map-card">

          <h2>Ward demand at {formatHour(mapHour)}</h2>

          <div className="map">

            <MumbaiMap

              hour={mapHour}

              hospital={hospital}

              assignments={viewing ? pastRunMarkers(viewing) : simulation ? simulation.assignments : run?.assignments}

              fleet={fleet}
              simulated={!viewing && simulation !== null}

              simulatedRadiusKm={viewing ? null : simulation?.parameters.operating_radius_km}
              kpis={viewing ? viewing.kpis : simulation ? simulation.kpis : run?.kpis ?? null}
              hospitalCandidateId={viewing?.kpis?.baseline?.hospital_candidate_id ?? run?.kpis?.baseline?.hospital_candidate_id}
              focusTarget={mapFocus}
              highlightedUnitId={highlightedAmbulanceId}
              onHighlightUnit={setHighlightedAmbulanceId}

            />

          </div>

          <MapLegend showSimulated={!viewing && simulation !== null} />

        </div>

        <aside className="stats-column">

          <KpiStrip

            kpis={viewing ? viewing.kpis : simulation ? simulation.kpis : run?.kpis ?? null}

            mode={viewing ? 'past' : simulation ? 'simulation' : 'live'}

            pastLabel={viewing ? `Run #${viewing.run_id}` : undefined}

            hourLabel={formatHour(mapHour)}

            totalWeightedScore={viewing ? viewing.total_weighted_score : simulation ? simulation.total_weighted_score : run?.total_weighted_score}
            selectedHour={mapHour}
            onHourSelect={setHour}
            recentRuns={recentRuns}
            onZoomToWard={handleZoomToWard}

          />

        </aside>

      </section>



      {/* 6. Fleet Table */}

      <FleetTable
        fleet={fleet}
        run={run}
        hospital={hospital}
        realRows={realRows}
        onEditFleet={() => setEditOpen(true)}
        highlightedId={highlightedAmbulanceId}
        onHighlightId={setHighlightedAmbulanceId}
      />



      {/* 7. Run History */}

      <RunHistoryTable
        runs={recentRuns}
        viewing={viewing}
        loadingRunId={loadingRunId}
        onViewRun={viewRun}
        onBackToLive={() => setViewing(null)}
        liveRunId={run?.run_id}
        liveKpis={run?.kpis}
      />



      {hospital && <EditFleetDialog hospital={hospital} open={editOpen} onClose={() => setEditOpen(false)} onChanged={onFleetEdited} />}

    </main>

  )

}

