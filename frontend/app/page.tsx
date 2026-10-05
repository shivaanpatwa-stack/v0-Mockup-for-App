'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import { API_URL, readErrorMessage, type OptimizeResult } from '@/lib/api'

const MumbaiMap = dynamic(() => import('@/components/mumbai-map'), {
  ssr: false,
  loading: () => <div style={{ height: '100%' }} />,
})

type FleetRow = [id: string, zone: string, position: string, eta: string, type: string, status: string]

const placeholderFleet: FleetRow[] = [
  ['AMB-001', 'Andheri West', 'K/W Ward', '6 min', 'ALS', 'Available'],
  ['AMB-002', 'Bandra', 'H/W Ward', '4 min', 'BLS', 'Responding'],
  ['AMB-003', 'Parel', 'G/S Ward', '7 min', 'ALS', 'At Hospital'],
  ['AMB-004', 'Dadar', 'G/N Ward', '5 min', 'BLS', 'Available'],
  ['AMB-005', 'Worli', 'D Ward', '8 min', 'ALS', 'Unavailable'],
]

const MIN_SPACING_KM = 2.0

type Run = OptimizeResult & { hour: number }

function formatHour(hour: number) {
  return hour === 0 ? '12:00 AM' : hour < 12 ? `${hour}:00 AM` : `${hour === 12 ? 12 : hour - 12}:00 PM`
}

const formatScore = (score: number) => score.toFixed(2)
const averageScore = (run: Run) => (run.details.length ? run.total_weighted_score / run.details.length : 0)

function OptimizationStats({ run, previous }: { run: Run; previous: Run | null }) {
  const change = previous && previous.total_weighted_score > 0
    ? ((run.total_weighted_score - previous.total_weighted_score) / previous.total_weighted_score) * 100
    : null
  const top = run.details.reduce<Run['details'][number] | null>((best, p) => (!best || p.weighted_score > best.weighted_score ? p : best), null)

  return (
    <>
      <div className="stat-card"><span>Previous total weighted score</span><strong>{previous ? formatScore(previous.total_weighted_score) : '—'}</strong><em>{previous ? `Last run · ${formatHour(previous.hour)}` : 'No earlier run'}</em></div>
      <div className="stat-card optimized"><span>Optimized total weighted score</span><strong>{formatScore(run.total_weighted_score)}</strong><em>{change === null ? `${formatHour(run.hour)} · ${run.details.length} positions` : `${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(0)}% vs previous run`}</em></div>
      <div className="comparison">
        <p>Optimization impact</p>
        <div><span>Positions placed</span><strong>{previous ? <>{previous.details.length} <b>→</b> </> : null}{run.details.length}</strong></div>
        <div><span>Average score per position</span><strong>{previous ? <>{formatScore(averageScore(previous))} <b>→</b> </> : null}{formatScore(averageScore(run))}</strong></div>
        {top && <div><span>Top position</span><strong>{top.name ?? top.candidate_id}{top.ward_code && ` · ${top.ward_code}`}</strong></div>}
      </div>
    </>
  )
}

export default function Page() {
  const [day, setDay] = useState('Monday')
  const [hour, setHour] = useState(8)
  const [fleet, setFleet] = useState(5)
  const [run, setRun] = useState<Run | null>(null)
  const [previousRun, setPreviousRun] = useState<Run | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function recalculate() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ hour: String(hour), min_spacing_km: MIN_SPACING_KM.toFixed(1) })
      const res = await fetch(`${API_URL}/optimize?${params}`)
      if (!res.ok) {
        setError(await readErrorMessage(res, 'Optimization failed'))
        return
      }
      const result: OptimizeResult = await res.json()
      setPreviousRun(run)
      setRun({ ...result, hour })
    } catch {
      setError(`Couldn't reach the server at ${API_URL}. Is the backend running?`)
    } finally {
      setLoading(false)
    }
  }

  // Live status tracking isn't implemented, so every assigned unit is shown as Available.
  const fleetRows: FleetRow[] = run
    ? run.assignments.map((a) => [a.ambulance_id, a.ward_code ?? '—', a.name ?? a.candidate_id, '—', a.type, 'Available'])
    : placeholderFleet

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div><p className="eyebrow">Fleet intelligence</p><h1>Ambulance Response Optimization Platform</h1></div>
        <div className="topbar-actions"><div className="hospital"><span className="status-dot" /> Hospital A <span>— Parel</span></div><Link href="/register" className="reg-link">Register hospital</Link></div>
      </header>
      <section className="controls" aria-label="Model controls">
        <label>Day<select value={day} onChange={(e) => setDay(e.target.value)}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="range-label">Hour <strong>{formatHour(hour)}</strong><input type="range" min="0" max="23" value={hour} onChange={(e) => setHour(Number(e.target.value))} /></label>
        <label>Fleet size<input className="number-input" type="number" min="1" max="30" value={fleet} onChange={(e) => setFleet(Number(e.target.value))} /></label>
        <button onClick={recalculate} disabled={loading} aria-busy={loading}>{loading ? 'Calculating…' : 'Recalculate'}</button>
      </section>
      {error && <p className="controls-error" role="alert">{error}</p>}
      <section className="content-grid">
        <div className="map-card"><div className="map-heading"><div><p className="eyebrow">Mumbai operations map</p><h2>Demand by administrative ward</h2></div><span className="map-date">Live model view</span></div><div className="map"><MumbaiMap assignments={run?.assignments} /><div className="legend"><span><i className="legend-dot high" /> High demand</span><span><i className="legend-dot medium" /> Medium</span><span><i className="legend-dot low" /> Low</span></div></div></div>
        <aside className="stats-column">{run ? <OptimizationStats run={run} previous={previousRun} /> : <><div className="stat-card"><span>Current average response time</span><strong>14.2 <small>min</small></strong><em>Baseline</em></div><div className="stat-card optimized"><span>Optimized average response time</span><strong>9.1 <small>min</small></strong><em>↓ 36% faster</em></div><div className="comparison"><p>Optimization impact</p><div><span>Reachable within 10 min</span><strong>48% <b>→</b> 71%</strong></div><div><span>Worst high-risk ward</span><strong>18 min <b>→</b> 8 min</strong></div></div></>}</aside>
      </section>
      <section className="fleet-section"><div className="section-heading"><div><p className="eyebrow">Fleet overview</p><h2>Ambulance fleet</h2></div><span>{run ? run.assignments.length : fleet} units modeled · {day}</span></div><div className="table-wrap"><table><thead><tr>{['Ambulance ID', run ? 'Ward' : 'Current zone','Recommended position','ETA / response','Type','Status'].map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{fleetRows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{index === 0 ? <strong>{cell}</strong> : index === 5 ? <span className={`badge ${cell.toLowerCase().replace(' ', '-')}`}>{cell}</span> : cell}</td>)}</tr>)}</tbody></table></div></section>
    </main>
  )
}
