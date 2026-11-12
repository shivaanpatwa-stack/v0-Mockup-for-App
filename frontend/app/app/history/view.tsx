'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useApp } from '@/lib/app-state'
import { getRun, restoreRun, type RunDetail, type RunHistoryRow, type RunTrigger } from '@/lib/api'
import { planFromRun } from '@/lib/plan'
import { formatDayClock, hourLabel, num } from '@/lib/format'

const LiveMap = dynamic(() => import('@/components/app/live-map'), { ssr: false })

const TRIGGER: Record<RunTrigger, string> = { manual: 'Manual', what_if: 'What-if', restore: 'Restored' }

function BeforeAfter({ before, after, unit, better, digits = 1 }: { before?: number | null; after?: number | null; unit: string; better: 'lower' | 'higher'; digits?: number }) {
  if (after == null) return <>–</>
  const d = before == null ? 0 : after - before
  const good = better === 'lower' ? d <= 0 : d >= 0
  const Icon = d < 0 ? ArrowDown : ArrowUp
  return (
    <span className={good ? undefined : 'worse'}>
      {num(before, digits)} to {num(after, digits)}
      {unit}
      {Math.abs(d) >= 0.05 && <Icon size={11} aria-label={d < 0 ? 'lower' : 'higher'} style={{ marginLeft: 3, verticalAlign: '-1px' }} />}
    </span>
  )
}

function RunNumber({ id, rows }: { id: number; rows: RunHistoryRow[] }) {
  // The hospital's own count (oldest = 1), not the global database id.
  const ordered = [...rows].sort((a, b) => a.run_id - b.run_id)
  return <>Run {ordered.findIndex((r) => r.run_id === id) + 1}</>
}

export default function RunHistoryPage() {
  const { history, refreshHistory, hospital, setPlanFromRun, pushToast } = useApp()
  const [trigger, setTrigger] = useState<'all' | RunTrigger>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<RunHistoryRow | null>(null)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [compareId, setCompareId] = useState<number | null>(null)
  const [compare, setCompare] = useState<RunDetail | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    refreshHistory()
  }, [refreshHistory])

  useEffect(() => {
    setDetail(null)
    setCompareId(null)
    if (open) getRun(open.run_id).then(setDetail).catch(() => setDetail(null))
  }, [open])
  useEffect(() => {
    setCompare(null)
    if (compareId) getRun(compareId).then(setCompare).catch(() => setCompare(null))
  }, [compareId])

  const rows = useMemo(() => {
    return (history ?? []).filter((r) => {
      if (trigger !== 'all' && r.trigger !== trigger) return false
      const day = r.created_at.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      return true
    })
  }, [history, trigger, from, to])

  const restore = async (row: RunHistoryRow) => {
    if (!window.confirm(`Make this run's positions the current plan for ${hourLabel(row.target_hour)}? It is saved as a new run; nothing is deleted.`)) return
    setBusy(true)
    try {
      const res = await restoreRun(row.run_id)
      await setPlanFromRun(res.run_id)
      await refreshHistory()
      pushToast({ text: `Plan restored for ${hourLabel(row.target_hour)} (${res.units} units)` })
      setOpen(null)
    } catch (err) {
      pushToast({ text: `Couldn't restore: ${(err as Error).message}`, tone: 'critical' })
    } finally {
      setBusy(false)
    }
  }

  const k = open?.kpis
  const ck = compare?.kpis
  const all = history ?? []

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Run history</h1>
          <p>Every plan that was calculated and saved for {hospital?.name ?? 'this hospital'}. Before means every unit waiting at the hospital.</p>
        </div>
      </div>
      <div className="filters" role="group" aria-label="Filter runs">
        <label className="muted" style={{ fontSize: 12 }}>
          Trigger{' '}
          <select className="select" value={trigger} onChange={(e) => setTrigger(e.target.value as typeof trigger)}>
            <option value="all">All</option>
            <option value="manual">Manual</option>
            <option value="what_if">What-if</option>
            <option value="restore">Restored</option>
          </select>
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          From <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          To <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(trigger !== 'all' || from || to) && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setTrigger('all'); setFrom(''); setTo('') }}>Clear filters</button>
        )}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{rows.length} of {all.length} runs</span>
      </div>

      {history === null ? (
        <p className="muted">Loading runs…</p>
      ) : all.length === 0 ? (
        <div className="empty"><strong>No runs yet</strong><span>Recalculate staging on the live map. Each applied plan is saved here.</span></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Saved runs, newest first. Select a row for details.</caption>
            <thead>
              <tr>
                <th>Run</th>
                <th>Saved</th>
                <th>Trigger</th>
                <th>Plan for</th>
                <th className="num-cell">Units</th>
                <th className="num-cell">Moved</th>
                <th className="num-cell">20-min reach</th>
                <th className="num-cell">Avg response</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.run_id} data-clickable className={open?.run_id === r.run_id ? 'is-selected' : undefined} onClick={() => setOpen(r)}>
                  <td>
                    <button type="button" className="sort-btn" onClick={(e) => { e.stopPropagation(); setOpen(r) }}>
                      <RunNumber id={r.run_id} rows={all} />
                    </button>
                  </td>
                  <td className="mono">{formatDayClock(r.created_at)}</td>
                  <td>{TRIGGER[r.trigger] ?? r.trigger}</td>
                  <td className="mono">{hourLabel(r.target_hour)}</td>
                  <td className="num-cell">{r.num_ambulances}</td>
                  <td className="num-cell">{r.units_moved ?? '–'}</td>
                  <td className="num-cell"><BeforeAfter before={r.kpis?.demand_within_20_min_pct.before} after={r.kpis?.demand_within_20_min_pct.after} unit="%" better="higher" digits={0} /></td>
                  <td className="num-cell"><BeforeAfter before={r.kpis?.avg_response_min.before} after={r.kpis?.avg_response_min.after} unit=" min" better="lower" /></td>
                  <td>
                    {r.status === 'succeeded' ? (
                      <span className="status">Saved</span>
                    ) : (
                      <span className="status status-critical" title={r.error_message ?? undefined}><span className="dot" aria-hidden="true" />Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Run time isn&apos;t stored, so there is no duration column. Numbers use simulated demand.</p>

      {open && (
        <aside className="drawer" aria-labelledby="run-title">
          <div className="drawer-head">
            <h2 id="run-title"><RunNumber id={open.run_id} rows={all} /> · {hourLabel(open.target_hour)} plan</h2>
            <button type="button" className="btn btn-icon btn-ghost" aria-label="Close" onClick={() => setOpen(null)}><X aria-hidden="true" /></button>
          </div>
          <div className="drawer-body">
            <p className="muted">
              Saved {formatDayClock(open.created_at)} · {TRIGGER[open.trigger]}
              {open.scenario_parameters?.restored_from ? ' from an earlier run' : ''}
            </p>
            <div className="mini-map">
              {detail ? (
                <LiveMap
                  mini
                  hour={open.target_hour}
                  hospital={hospital}
                  units={planFromRun(detail).assignments}
                  ghosts={
                    compare
                      ? planFromRun(compare).assignments
                          .map((c) => {
                            const a = detail.assignments.find((x) => x.ambulance_id === c.ambulance_id)
                            return a && a.lat != null && a.lng != null ? { callSign: c.ambulance_id, from: { lat: c.lat, lng: c.lng }, to: { lat: a.lat, lng: a.lng } } : null
                          })
                          .filter((g): g is NonNullable<typeof g> => g !== null)
                      : []
                  }
                  layers={{ demand: true, reach: false, units: true }}
                />
              ) : (
                <div className="empty">Loading positions…</div>
              )}
            </div>
            {compare && <p className="muted" style={{ fontSize: 12 }}>Dashed circles are the compared run&apos;s positions, with arrows to this run&apos;s.</p>}

            <label className="muted" style={{ fontSize: 12 }}>
              Compare with{' '}
              <select className="select" value={compareId ?? ''} onChange={(e) => setCompareId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">No comparison</option>
                {all.filter((r) => r.run_id !== open.run_id && r.status === 'succeeded').map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {formatDayClock(r.created_at)} · {hourLabel(r.target_hour)} plan
                  </option>
                ))}
              </select>
            </label>

            <dl className="kv">
              <dt>Avg response</dt>
              <dd>{num(k?.avg_response_min.after)} min{ck ? ` vs ${num(ck.avg_response_min.after)}` : ''}</dd>
              <dt>Demand reachable in 20 min</dt>
              <dd>{num(k?.demand_within_20_min_pct.after, 0)}%{ck ? ` vs ${num(ck.demand_within_20_min_pct.after, 0)}%` : ''}</dd>
              <dt>Wards within 20 min</dt>
              <dd>{k?.wards_covered_20_min.after ?? '–'}{ck ? ` vs ${ck.wards_covered_20_min.after}` : ''}</dd>
              <dt>Units</dt>
              <dd>{open.num_ambulances}{compare ? ` vs ${compare.num_ambulances}` : ''}</dd>
              <dt>Spacing</dt>
              <dd>{open.min_spacing_km} km</dd>
              <dt>Radius</dt>
              <dd>{open.operating_radius_km} km</dd>
            </dl>
            {open.scenario_parameters?.assumptions && open.scenario_parameters.assumptions.length > 0 && (
              <ul className="assumption-list">{open.scenario_parameters.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            )}
            {detail && (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Positions in this run</caption>
                  <thead><tr><th>Unit</th><th>Position</th><th>Ward</th></tr></thead>
                  <tbody>
                    {detail.assignments.map((a) => (
                      <tr key={a.ambulance_id}><td className="mono">{a.ambulance_id}</td><td>{a.name ?? a.candidate_id}</td><td className="mono">{a.ward_code ?? '–'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {open.status === 'succeeded' && (
              <div className="result-actions">
                <button type="button" className="btn" disabled={busy} onClick={() => restore(open)}>Restore this plan</button>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
