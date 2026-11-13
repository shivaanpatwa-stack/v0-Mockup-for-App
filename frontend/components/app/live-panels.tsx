'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Send,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
import { movesFor, unitsMoved, useApp, type Move } from '@/lib/app-state'
import { dispatchAllAmbulances, setAssignmentStatus, type Kpis, type OptimizeResult } from '@/lib/api'
import { DATA_LABEL } from '@/lib/config'
import { HOURLY_DEMAND } from '@/lib/demand-profile'
import { ago, formatClock, hourLabel, num, plural } from '@/lib/format'
import { WARD_NAMES } from '@/lib/ward-names'
import { DEMAND_LABEL, demandLevel } from '@/lib/map-theme'
import { getBundledScoresForHour } from '@/lib/ward-risk-data'
import { isTyping } from '@/components/app/shell'

/** "▼ 7.3 min" style change mark: icon + signed number, never colour alone. */
function Delta({ before, after, unit, better }: { before: number | null | undefined; after: number | null | undefined; unit: string; better: 'lower' | 'higher' }) {
  if (before == null || after == null) return null
  const d = after - before
  if (Math.abs(d) < 0.05) return <span className="kpi-delta">no change</span>
  const Icon = d < 0 ? ArrowDown : ArrowUp
  const good = better === 'lower' ? d < 0 : d > 0
  return (
    <span className={`kpi-delta ${good ? '' : 'worse'}`} title="Compared with every unit waiting at the hospital">
      <Icon size={11} aria-hidden="true" style={{ verticalAlign: '-1px' }} />
      {Math.abs(d).toFixed(1)}
      {unit}
      <span className="sr-only"> {d < 0 ? 'lower' : 'higher'} than all at base</span>
    </span>
  )
}

export function KpiStrip({ kpis, coverageKnown, uncovered, max }: { kpis: Kpis | null; coverageKnown: boolean; uncovered: string[]; max: number }) {
  const { inService, fleet, hour, plan, showUncovered, setShowUncovered } = useApp()
  const [flash, setFlash] = useState(false)
  const sig = kpis ? `${kpis.avg_response_min.after}|${kpis.demand_within_20_min_pct.after}` : ''
  const prev = useRef(sig)
  useEffect(() => {
    if (prev.current && sig && prev.current !== sig) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 800)
      prev.current = sig
      return () => clearTimeout(t)
    }
    prev.current = sig
  }, [sig])
  const cls = `kpi${flash ? ' kpi-flash' : ''}`
  return (
    <section className="kpi-strip" aria-label="Plan summary">
      <div className={cls}>
        <span className="kpi-label">Avg response</span>
        <span className="kpi-value">
          <span className="num">{num(kpis?.avg_response_min.after)}</span>
          <span className="kpi-unit">min</span>
          <Delta before={kpis?.avg_response_min.before} after={kpis?.avg_response_min.after} unit=" min" better="lower" />
        </span>
      </div>
      <div className={cls}>
        <span className="kpi-label">Demand reachable in 20 min</span>
        <span className="kpi-value">
          <span className="num">{num(kpis?.demand_within_20_min_pct.after, 0)}</span>
          <span className="kpi-unit">%</span>
          <Delta before={kpis?.demand_within_20_min_pct.before} after={kpis?.demand_within_20_min_pct.after} unit=" pts" better="higher" />
        </span>
      </div>
      <div className={cls}>
        <span className="kpi-label">Wards within 20 min</span>
        <span className="kpi-value">
          <span className="num">{kpis ? kpis.wards_covered_20_min.after : '–'}</span>
          <span className="kpi-unit">of {kpis?.wards_covered_20_min.total ?? 24}</span>
        </span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Units in service</span>
        <span className="kpi-value">
          <span className="num">{fleet ? inService.length : '–'}</span>
          <span className="kpi-unit">of {fleet?.length ?? '–'}</span>
        </span>
      </div>
      {coverageKnown && uncovered.length > 0 && (
        <div className="kpi kpi-alert" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span>
            <strong>{plural(uncovered.length, 'ward')}</strong> outside the {max}-min target
          </span>
          <button type="button" className="btn btn-sm" aria-pressed={showUncovered} onClick={() => setShowUncovered(!showUncovered)}>
            {showUncovered ? 'Hide' : 'Show'}
          </button>
        </div>
      )}
      <div className="kpi kpi-meta">
        <span className="kpi-label">Plan for</span>
        <span className="mono">
          {plan ? hourLabel(plan.hour) : hourLabel(hour)} · <abbr title={DATA_LABEL}>simulated demand</abbr>
        </span>
      </div>
    </section>
  )
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  return <span className="mono">{Math.floor((now - since) / 1000)} s</span>
}

function diffSummary(next: OptimizeResult, current: OptimizeResult | null) {
  const k = next.kpis
  const c = current?.kpis
  const parts: { label: string; value: string }[] = [
    { label: 'Units moved', value: String(unitsMoved(next.assignments, current?.assignments)) },
  ]
  if (k) {
    parts.push({
      label: '20-min reach',
      value: `${num(c?.demand_within_20_min_pct.after ?? k.demand_within_20_min_pct.before, 0)}% to ${num(k.demand_within_20_min_pct.after, 0)}%`,
    })
    parts.push({
      label: 'Avg response',
      value: `${num(c?.avg_response_min.after ?? k.avg_response_min.before)} to ${num(k.avg_response_min.after)} min`,
    })
  }
  return parts
}

/** 3.6 A: Recalculate staging, with idle, stale, running, result, applied (toast) and error states. */
export function RecalcControl() {
  const {
    plan, hospital, recalcStatus, recalcError, recalcStartedAt, preview, recalculate, applyPreview, discardPreview,
    cancelPlan, pendingApply, stale, whatIfOpen, setWhatIfOpen, setMovesOpen, inService,
  } = useApp()
  const running = recalcStatus === 'running'
  const noUnits = hospital !== undefined && inService.length === 0
  return (
    <div className="map-toolbar">
      <div className="map-toolbar-row">
        <button
          type="button"
          className={`btn btn-primary${stale.stale && recalcStatus === 'idle' ? ' btn-stale' : ''}`}
          onClick={recalculate}
          disabled={running || pendingApply || !hospital || noUnits}
          aria-keyshortcuts="R"
          aria-describedby="recalc-status"
        >
          {running ? <Loader2 className="spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          {running ? 'Calculating' : 'Recalculate staging'}
          {!running && <kbd aria-hidden="true" style={{ color: 'inherit', borderColor: 'rgba(255,255,255,.4)' }}>R</kbd>}
        </button>
        <button type="button" className="btn" aria-pressed={whatIfOpen} onClick={() => setWhatIfOpen(!whatIfOpen)} aria-keyshortcuts="W">
          <SlidersHorizontal aria-hidden="true" /> What if… <kbd aria-hidden="true">W</kbd>
        </button>
        {plan && !running && recalcStatus === 'idle' && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: '#ef4444' }}
            onClick={() => {
              if (window.confirm('Cancel active staging plan? All mobile crews will be instructed to stand by.')) {
                cancelPlan()
              }
            }}
            title="Cancel active staging plan and instruct crews to stand by"
          >
            <XCircle aria-hidden="true" /> Cancel plan
          </button>
        )}
      </div>

      {recalcStatus === 'error' ? (
        <div id="recalc-status" className="recalc-status is-error" role="alert">
          <XCircle aria-hidden="true" />
          <span>
            {recalcError}
            {plan ? ' The previous plan is still in place.' : ''}
          </span>
          <button type="button" className="btn btn-sm" onClick={recalculate}>Retry</button>
        </div>
      ) : running && recalcStartedAt ? (
        <div id="recalc-status" className="recalc-status" role="status">
          Running the planner for {plural(inService.length, 'unit')} · <Elapsed since={recalcStartedAt} />
        </div>
      ) : noUnits ? (
        <div id="recalc-status" className="recalc-status is-stale" role="status">
          <span className="dot" aria-hidden="true" /> No units in service. Add or reactivate one in Staging plan.
        </div>
      ) : stale.stale && recalcStatus === 'idle' ? (
        <div id="recalc-status" className="recalc-status is-stale" role="status">
          <span className="status status-warning"><span className="dot" aria-hidden="true" /></span>
          Inputs changed, recalculate recommended · {stale.reason}
        </div>
      ) : (
        <div id="recalc-status" className="recalc-status" role="status">
          {pendingApply
            ? 'Applying the new plan…'
            : plan
              ? `Last calculated ${formatClock(plan.calculatedAt)} · ${ago(plan.calculatedAt)}`
              : 'No active plan. Recalculate staging to place your units.'}
        </div>
      )}

      {recalcStatus === 'result' && preview && (
        <section className="result-panel" aria-labelledby="result-title">
          <h2 id="result-title">
            {preview.source === 'what_if' ? 'Scenario plan' : 'New plan'} for {hourLabel(preview.hour)}, not applied yet
          </h2>
          <dl className="result-diff">
            {diffSummary(preview.result as OptimizeResult, plan).map((p) => (
              <div key={p.label}>
                <dt className="muted" style={{ display: 'inline' }}>{p.label} </dt>
                <dd className="mono" style={{ display: 'inline', margin: 0 }}>{p.value}</dd>
              </div>
            ))}
          </dl>
          {'assumptions' in preview.result && preview.result.assumptions.length > 0 && (
            <ul className="result-assumptions">
              {preview.result.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
          <div className="result-actions">
            <button type="button" className="btn btn-primary" onClick={applyPreview}>
              <Check aria-hidden="true" /> Apply plan
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMovesOpen(true)
                const el = document.getElementById('moves-title')
                el?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Review moves
            </button>
            <button type="button" className="btn btn-ghost" onClick={discardPreview}>Discard</button>
          </div>
        </section>
      )}
    </div>
  )
}

const STATUS_TEXT: Record<string, string> = { planned: 'Staged (not dispatched)', en_route: 'Dispatched · On the way', in_position: 'In position' }

function MoveRow({ m, hour, preview, onHover, hot }: { m: Move; hour: number; preview: boolean; onHover: (id: string | null) => void; hot: boolean }) {
  const { pushToast, refreshFleet, fleet } = useApp()
  const [busy, setBusy] = useState(false)
  const scores = getBundledScoresForHour(hour)
  const score = m.toWard ? scores[m.toWard] : undefined
  const unit = fleet?.find((f) => f.call_sign === m.callSign)
  const dispatch = async () => {
    setBusy(true)
    try {
      await setAssignmentStatus(m.callSign, 'en_route')
      pushToast({ text: `${m.callSign} dispatched to ${m.toLabel} — staging location sent to crew` })
      refreshFleet()
    } catch (err) {
      pushToast({ text: `Couldn't dispatch ${m.callSign}: ${(err as Error).message}`, tone: 'critical' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className={`move${hot ? ' is-hover' : ''}`} onMouseEnter={() => onHover(m.callSign)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(m.callSign)}>
      <div className="move-top">
        <span className="move-id">{m.callSign} <span className="muted">{m.type}</span></span>
        {!preview && (
          <span
            className={`status ${
              unit?.status === 'responding'
                ? 'status-responding'
                : unit?.status === 'at_hospital'
                  ? 'status-hospital'
                  : 'status-available'
            }`}
          >
            {unit?.status === 'responding' ? (
              <>
                <span className="dot" aria-hidden="true" />
                Responding to a call
              </>
            ) : unit?.status === 'at_hospital' ? (
              <>
                <span className="dot" aria-hidden="true" />
                At hospital
              </>
            ) : (m.status ?? 'planned') === 'in_position' ? (
              <>
                <Check aria-hidden="true" />
                In position
              </>
            ) : (
              <>
                <span className="dot" aria-hidden="true" />
                {STATUS_TEXT[m.status ?? 'planned'] ?? m.status}
              </>
            )}
          </span>
        )}
      </div>
      <div className="move-path">
        {m.fromLabel} <ArrowRight size={12} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> <b>{m.toLabel}</b>
        {m.km != null && <span className="mono"> · {m.km.toFixed(1)} km</span>}
      </div>
      {m.toWard && (
        <div className="move-why">
          Ward {m.toWard}
          {WARD_NAMES[m.toWard] ? ` (${WARD_NAMES[m.toWard]})` : ''}
          {score !== undefined ? `: ${DEMAND_LABEL[demandLevel(score)].toLowerCase()} predicted demand at ${hourLabel(hour)}` : ''}
        </div>
      )}
      {!preview && (m.status === 'planned' || m.status === null) && (
        <div className="move-actions">
          <button type="button" className="btn btn-sm btn-primary" style={{ gap: 4 }} disabled={busy} onClick={dispatch}>
            <Send size={12} aria-hidden="true" /> Dispatch
          </button>
        </div>
      )}
    </li>
  )
}

export function MovesPanel({ hot, onHover }: { hot: string | null; onHover: (id: string | null) => void }) {
  const { plan, preview, fleet, hospital, movesOpen, setMovesOpen, pushToast, refreshFleet, cancelPlan } = useApp()
  const showingPreview = Boolean(preview)
  const source = (preview?.result as OptimizeResult | undefined) ?? plan
  const hour = preview?.hour ?? plan?.hour ?? 0
  const moves = source
    ? movesFor(source.assignments, fleet, hospital, showingPreview ? plan?.assignments : undefined).filter(
        (m) => !showingPreview || !plan || m.km == null || m.km > 0.05,
      )
    : []
  const plannedMoves = !showingPreview ? moves.filter((m) => m.status === 'planned' || m.status === null) : []
  const [dispatchingAll, setDispatchingAll] = useState(false)

  const dispatchAll = async () => {
    if (plannedMoves.length === 0) return
    setDispatchingAll(true)
    try {
      await dispatchAllAmbulances().catch(() =>
        Promise.all(plannedMoves.map((m) => setAssignmentStatus(m.callSign, 'en_route')))
      )
      pushToast({ text: `All ${plannedMoves.length} units dispatched — locations shared with mobile crews` })
      refreshFleet()
    } catch (err) {
      pushToast({ text: `Couldn't dispatch all units: ${(err as Error).message}`, tone: 'critical' })
    } finally {
      setDispatchingAll(false)
    }
  }

  if (!movesOpen) {
    return (
      <aside className="moves is-collapsed" aria-label="Moves">
        <button type="button" className="btn btn-icon btn-ghost" onClick={() => setMovesOpen(true)} aria-label="Show moves" style={{ margin: 4 }}>
          <ChevronLeft aria-hidden="true" />
        </button>
      </aside>
    )
  }
  return (
    <aside className="moves" aria-labelledby="moves-title">
      <div className="moves-head">
        <h2 id="moves-title">
          {showingPreview ? 'Proposed moves' : 'Moves'} <span className="muted mono">{moves.length}</span>
        </h2>
        <button type="button" className="btn btn-icon btn-ghost" onClick={() => setMovesOpen(false)} aria-label="Collapse moves">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      {!showingPreview && plan && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plannedMoves.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ width: '100%', justifyContent: 'center', gap: 6 }}
              disabled={dispatchingAll}
              onClick={dispatchAll}
            >
              {dispatchingAll ? <Loader2 className="spin" size={13} aria-hidden="true" /> : <Send size={13} aria-hidden="true" />}
              Dispatch all ({plannedMoves.length} {plannedMoves.length === 1 ? 'unit' : 'units'})
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ width: '100%', justifyContent: 'center', gap: 6, color: '#ef4444', fontSize: 12 }}
            onClick={() => {
              if (window.confirm('Cancel active staging plan? All mobile crews will be instructed to stand by.')) {
                cancelPlan()
              }
            }}
          >
            <XCircle size={13} aria-hidden="true" /> Cancel live plan
          </button>
        </div>
      )}
      {fleet && fleet.length === 0 ? (
        <div className="empty">
          <strong>No units stationed here</strong>
          <span>Add an ambulance in Staging plan so the planner has something to place.</span>
          <Link href="/app/plan" className="btn btn-sm" style={{ justifySelf: 'start' }}>Open Staging plan</Link>
        </div>
      ) : !source ? (
        <div className="empty">
          <strong>No plan yet</strong>
          <span>Recalculate staging to get a position for each unit.</span>
        </div>
      ) : moves.length === 0 ? (
        <div className="empty">
          <strong>No units need to move</strong>
          <span>Every unit is already where this plan wants it.</span>
        </div>
      ) : (
        <ul className="moves-list">
          {moves.map((m) => <MoveRow key={m.callSign} m={m} hour={hour} preview={showingPreview} onHover={onHover} hot={hot === m.callSign} />)}
        </ul>
      )}
    </aside>
  )
}

export function TimeScrubber() {
  const { hour, setHour, plan } = useApp()
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setHour((hour + 1) % 24), 1200)
    return () => clearInterval(t)
  }, [playing, hour, setHour])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || document.querySelector('dialog[open]')) return
      if (e.key === 'ArrowRight') setHour((hour + 1) % 24)
      if (e.key === 'ArrowLeft') setHour((hour + 23) % 24)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hour, setHour])
  return (
    <div className="scrubber" role="group" aria-label="Time of day">
      <button type="button" className="btn btn-icon" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play through the day'}>
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>
      <div className="scrubber-track">
        <div className="scrubber-bars" aria-hidden="true">
          {HOURLY_DEMAND.map((d) => (
            <span
              key={d.hour}
              className={[d.hour === hour ? 'is-current' : '', plan?.hour === d.hour ? 'is-plan' : ''].join(' ')}
              style={{ height: `${d.heightPct}%` }}
              title={`${hourLabel(d.hour)}: ${d.level} city-wide demand`}
            />
          ))}
        </div>
        <input
          className="range"
          type="range"
          min={0}
          max={23}
          step={1}
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          aria-label="Hour of day"
          aria-valuetext={`${hourLabel(hour)}, ${HOURLY_DEMAND[hour]?.level ?? ''} city-wide demand`}
        />
        <div className="scrubber-ticks" aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: -16 }}>
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>
      <span className="scrubber-hour" aria-live="polite">{hourLabel(hour)}</span>
    </div>
  )
}

export function MapLegend({ showUncovered }: { showUncovered: boolean }) {
  const { plan } = useApp()
  const targetMin = plan?.max_response_minutes ?? 20
  return (
    <aside className="map-legend" aria-label="Map legend">
      <strong style={{ fontWeight: 500 }}>Predicted demand</strong> <span className="muted">(relative risk score, 0 to 1)</span>
      <div className="legend-ramp" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="legend-ends"><span>Low &lt;0.20</span><span>Very high &gt;0.70</span></div>
      <div className="legend-rows">
        <div className="legend-row"><span className="legend-sym reach" aria-hidden="true" /> Reachable in {targetMin} min</div>
        {showUncovered && <div className="legend-row"><span className="legend-sym uncovered" aria-hidden="true" /> Outside the response target</div>}
        <div className="legend-row"><span className="legend-sym unit" aria-hidden="true" /> Unit (ALS solid, BLS outline)</div>
        <div className="legend-row"><span className="legend-sym ghost" aria-hidden="true" /> Current position, arrow to new</div>
        <div className="legend-row"><span className="legend-sym base" aria-hidden="true" /> Hospital base</div>
      </div>
      <p className="legend-note">
        {DATA_LABEL}. <Link href="/app/data">What is assumed</Link>
      </p>
    </aside>
  )
}

export function LayerToggles() {
  const { layers, setLayers, plan } = useApp()
  const targetMin = plan?.max_response_minutes ?? 20
  const toggle = (k: keyof typeof layers) => setLayers({ ...layers, [k]: !layers[k] })
  return (
    <div className="map-side-controls">
      <fieldset className="layer-toggles" style={{ margin: 0, padding: 0 }}>
        <legend className="sr-only">Map layers</legend>
        <label><input type="checkbox" checked={layers.demand} onChange={() => toggle('demand')} /> Demand</label>
        <label><input type="checkbox" checked={layers.reach} onChange={() => toggle('reach')} /> {targetMin}-min reach</label>
        <label><input type="checkbox" checked={layers.units} onChange={() => toggle('units')} /> Units</label>
      </fieldset>
    </div>
  )
}
