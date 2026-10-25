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
import CopyCode from '@/components/copy-code'
import EditFleetDialog from '@/components/edit-fleet-dialog'
import HospitalMenu from '@/components/hospital-menu'
import KpiStrip from '@/components/kpi-strip'
import MapLegend from '@/components/map-legend'
import WhatIfPanel from '@/components/what-if-panel'

const MumbaiMap = dynamic(() => import('@/components/mumbai-map'), {
  ssr: false,
  loading: () => <div style={{ height: '100%' }} />,
})

type FleetRow = {
  id: string
  zone: string
  position: string
  eta: string
  type: string
  status: AmbulanceStatus | null
  assignmentStatus: AssignmentStatus | null
}

// Shown only until real fleet data or a run result is available.
const placeholderFleet: FleetRow[] = [
  { id: 'AMB-001', zone: 'Andheri West', position: 'K/W Ward', eta: '6 min', type: 'ALS', status: 'available', assignmentStatus: null },
  { id: 'AMB-002', zone: 'Bandra', position: 'H/W Ward', eta: '4 min', type: 'BLS', status: 'responding', assignmentStatus: null },
  { id: 'AMB-003', zone: 'Parel', position: 'G/S Ward', eta: '7 min', type: 'ALS', status: 'at_hospital', assignmentStatus: null },
  { id: 'AMB-004', zone: 'Dadar', position: 'G/N Ward', eta: '5 min', type: 'BLS', status: 'available', assignmentStatus: null },
  { id: 'AMB-005', zone: 'Worli', position: 'D Ward', eta: '8 min', type: 'ALS', status: 'unavailable', assignmentStatus: null },
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
function buildFleetRows(fleet: FleetAmbulance[] | null, run: Run | null): FleetRow[] {
  const fromRun = new Map(run?.assignments.map((a) => [a.ambulance_id, a]))
  if (fleet) {
    return fleet.map((amb) => {
      const planned = fromRun.get(amb.call_sign)
      const current = amb.current_assignment
      return {
        id: amb.call_sign,
        zone: planned?.ward_code ?? current?.ward_code ?? '—',
        position: planned?.name ?? planned?.candidate_id ?? current?.name ?? current?.candidate_id ?? '—',
        eta: '—',
        type: amb.type,
        status: amb.status,
        // Only when it describes the position shown in this row.
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
      eta: '—',
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

const formatScore = (score: number) => score.toFixed(2)
export default function Page() {
  const [day, setDay] = useState('Monday')
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

  const spacingKm = Number(spacing)
  const spacingValid = spacing.trim() !== '' && spacingKm >= 0 && spacingKm <= MAX_SPACING_KM

  useEffect(() => {
    const controller = new AbortController()
    // The proxy gate only lets this page render with a session; invalid credentials sign out in apiFetch.
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
          // Keep the last known statuses; the next poll will try again.
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
      // The panel keeps its last list; the next Recalculate tries again.
      console.warn('Loading recent runs failed', err)
    }
  }, [hospital])

  useEffect(() => {
    refreshRuns()
  }, [refreshRuns])

  async function refreshHospital() {
    try {
      const found = await getHospital()
      setHospital(found) // also restarts fleet polling, which refreshes GET /fleet at once
      saveHospitalName(found.name)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_ERROR)
    }
  }

  async function onFleetEdited() {
    setFleetChanged(true)
    await refreshHospital()
  }

  async function runSimulation({ numAmbulances, radiusKm }: { numAmbulances: number; radiusKm: number }) {
    if (!spacingValid) return
    setViewing(null)
    setSimRunning(true)
    setError(null)
    try {
      setSimulation(
        await simulate({ hour, num_ambulances: numAmbulances, operating_radius_km: radiusKm, min_spacing_km: spacingKm }),
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
        // Earlier results stay on screen; only the banner changes.
        setError(await readErrorMessage(res, res.status === 503 ? 'Server data unavailable' : 'Optimization failed'))
        return
      }
      const result: OptimizeResult = await res.json()
      setRun({ ...result, hour })
      setFleetChanged(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_ERROR)
    } finally {
      setLoading(false)
      // Failed runs are recorded too, so refresh either way.
      refreshRuns()
    }
  }

  const lastSucceeded = recentRuns?.find((r) => r.status === 'succeeded')
  // The hour whose ward demand the map shows: a past run's or simulation's hour, else the slider's.
  const mapHour = viewing ? viewing.target_hour : simulation ? simulation.parameters.hour : hour
  const fleetRows = buildFleetRows(fleet, run)
  const realRows = fleet !== null || run !== null

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div><p className="eyebrow">Fleet intelligence</p><h1>Ambulance Response Optimization Platform</h1></div>
        <div className="topbar-actions"><div className="hospital"><span className="status-dot" /> {hospital?.name ?? 'Loading hospital…'}{hospital && <CopyCode code={hospital.code} className="hospital-code" />}</div>{hospital && <HospitalMenu hospital={hospital} onChanged={refreshHospital} />}</div>
      </header>
      <section className="controls" aria-label="Model controls">
        <label>Day<select value={day} onChange={(e) => setDay(e.target.value)}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="range-label">Hour <strong>{formatHour(hour)}</strong><input type="range" min="0" max="23" value={hour} onChange={(e) => setHour(Number(e.target.value))} /></label>
        <label>Min spacing<input className="number-input" type="number" min="0" max={MAX_SPACING_KM} step="0.5" value={spacing} onChange={(e) => setSpacing(e.target.value)} aria-invalid={!spacingValid} />km</label>
        <span className="fleet-summary">{hospital ? fleetSummary(hospital) : 'Fleet: —'}</span>
        <button onClick={recalculate} disabled={loading || !hospital || !spacingValid} aria-busy={loading}>{loading ? 'Calculating…' : 'Recalculate'}</button>
      </section>
      {error && <p className="controls-error" role="alert">{error}<button type="button" className="banner-dismiss" aria-label="Dismiss error" onClick={() => setError(null)}>×</button></p>}
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
      {hospital && (
        <WhatIfPanel
          defaultFleet={inService(hospital).length}
          defaultRadiusKm={hospital.operating_radius_km}
          running={simRunning}
          disabled={!spacingValid}
          simulation={simulation}
          liveRun={run}
          onRun={runSimulation}
        />
      )}
      <section className="content-grid">
        <div className="map-card"><div className="map-heading"><div><p className="eyebrow">Mumbai operations map</p><h2>Demand by administrative ward</h2></div><span className="map-date">{lastSucceeded ? `Last calculated: ${formatIST(lastSucceeded.created_at)}` : recentRuns ? 'Not calculated yet' : ''}</span></div><div className="map"><MumbaiMap hour={mapHour} hospital={hospital} assignments={viewing ? pastRunMarkers(viewing) : simulation ? simulation.assignments : run?.assignments} simulated={!viewing && simulation !== null} simulatedRadiusKm={viewing ? null : simulation?.parameters.operating_radius_km} /><MapLegend hourLabel={formatHour(mapHour)} showSimulated={!viewing && simulation !== null} /></div></div>
        <aside className="stats-column"><KpiStrip kpis={viewing ? viewing.kpis : simulation ? simulation.kpis : run?.kpis ?? null} mode={viewing ? 'past' : simulation ? 'simulation' : 'live'} pastLabel={viewing ? `Run #${viewing.run_id}` : undefined} hourLabel={formatHour(mapHour)} totalWeightedScore={viewing ? viewing.total_weighted_score : simulation ? simulation.total_weighted_score : run?.total_weighted_score} /></aside>
      </section>
      <section className="fleet-section"><div className="section-heading"><div><p className="eyebrow">Fleet overview</p><h2>Ambulance fleet</h2></div><div className="section-actions"><span>{fleet ? fleet.length : run ? run.assignments.length : hospital?.fleet_size ?? '—'} units modeled · {day}</span>{hospital && <button type="button" className="back-to-live" onClick={() => setEditOpen(true)}>Edit fleet</button>}</div></div><div className="table-wrap"><table><thead><tr>{['Ambulance ID', realRows ? 'Ward' : 'Current zone','Recommended position','ETA / response','Type','Status'].map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{fleetRows.map((row) => <tr key={row.id}><td><strong>{row.id}</strong></td><td>{row.zone}</td><td>{row.position}</td><td>{row.eta}</td><td>{row.type}</td><td>{row.status ? <span className={`badge ${row.status.replace('_', '-')}`}>{STATUS_LABEL[row.status]}</span> : '—'}{row.assignmentStatus && <span className="assignment-status">{ASSIGNMENT_LABEL[row.assignmentStatus]}</span>}</td></tr>)}</tbody></table></div></section>
      <section className="fleet-section runs-section">
        <div className="section-heading"><div><p className="eyebrow">Run history</p><h2>Recent runs</h2></div><span>Last {RECENT_RUNS_LIMIT} · times in IST</span></div>
        <div className="table-wrap">
          {recentRuns && recentRuns.length === 0 ? (
            <p className="runs-empty">No runs yet. Press Recalculate to create one.</p>
          ) : (
            <table>
              <thead><tr>{['Run', 'Created', 'Target hour', 'Status', 'Score', 'Ambulances'].map((head) => <th key={head}>{head}</th>)}</tr></thead>
              <tbody>
                {recentRuns?.map((r) => {
                  const succeeded = r.status === 'succeeded'
                  return (
                    <tr key={r.run_id} className={viewing?.run_id === r.run_id ? 'run-row viewing' : 'run-row'} title={succeeded ? undefined : r.error_message ?? 'Run failed'}>
                      <td>{succeeded ? <button type="button" className="run-link" onClick={() => viewRun(r.run_id)} disabled={loadingRunId !== null}>{loadingRunId === r.run_id ? 'Loading…' : `#${r.run_id}`}</button> : <strong>#{r.run_id}</strong>}</td>
                      <td>{formatIST(r.created_at)}</td>
                      <td>{formatHour(r.target_hour)}</td>
                      <td><span className={`badge run-${r.status}`}>{succeeded ? 'Succeeded' : 'Failed'}</span></td>
                      <td>{r.total_weighted_score === null ? '—' : formatScore(r.total_weighted_score)}</td>
                      <td>{r.num_ambulances}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
      {hospital && <EditFleetDialog hospital={hospital} open={editOpen} onClose={() => setEditOpen(false)} onChanged={onFleetEdited} />}
    </main>
  )
}
