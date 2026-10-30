import type { ReactNode } from 'react'
import type { Kpis } from '@/lib/api'

type Mode = 'live' | 'simulation' | 'past'

type KpiStripProps = {
  kpis: Kpis | null
  mode: Mode
  /** e.g. "Run #12"; shown in past-run mode. */
  pastLabel?: string
  /** The hour the demand chip describes, e.g. "11:00 AM". */
  hourLabel: string
  totalWeightedScore?: number | null
}

/** Whether a change is an improvement: lower is better for times, higher for coverage. */
type Better = 'lower' | 'higher'

const dash = '—'
const num = (v: number | null | undefined, digits = 1) => (v == null ? dash : v.toFixed(digits))

function Delta({ before, after, better, unit }: { before: number | null; after: number | null; better: Better; unit: string }) {
  if (before == null || after == null) return null
  const diff = Math.round((after - before) * 10) / 10
  if (diff === 0) return <span className="kpi-delta">±0</span>
  const improved = better === 'lower' ? diff < 0 : diff > 0
  const sign = diff > 0 ? '+' : '−'
  return (
    <span className={improved ? 'kpi-delta kpi-better' : 'kpi-delta'}>
      {sign}
      {Math.abs(diff).toFixed(unit === '' ? 0 : 1)}
      {unit && ` ${unit}`}
    </span>
  )
}

function Item({ label, before, after, suffix, children }: { label: string; before: string; after: string; suffix?: string; children?: ReactNode }) {
  return (
    <div className="kpi-item">
      <span className="kpi-label">{label}</span>
      <div className="kpi-val-row">
        <strong className="kpi-current">
          {after}
          {suffix && <small className="kpi-suffix"> {suffix}</small>}
        </strong>
        {before !== dash && before !== after && <span className="kpi-was">was {before}</span>}
        {children}
      </div>
    </div>
  )
}

const MODE_LABEL: Record<Mode, string> = { live: 'Optimization impact', simulation: 'Simulation', past: 'Past run' }

export default function KpiStrip({ kpis, mode, pastLabel, hourLabel, totalWeightedScore }: KpiStripProps) {
  const title = mode === 'past' && pastLabel ? `${MODE_LABEL.past} · ${pastLabel}` : MODE_LABEL[mode]

  if (!kpis) {
    return (
      <div className={`kpi-strip kpi-${mode}`}>
        <p className="kpi-title">{title}</p>
        {['Avg response time (min)', 'Demand covered within 15 min (%)', 'Worst high-risk ward', 'Wards covered within 20 min'].map((label) => (
          <Item key={label} label={label} before={dash} after={dash} />
        ))}
        <div className="kpi-hour-divider">
          <span className="kpi-hour-title">This hour</span>
        </div>
        <p className="kpi-caption">Run Recalculate to see impact.</p>
      </div>
    )
  }

  const avg = kpis.avg_response_min
  const within15 = kpis.demand_within_15_min_pct
  const worst = kpis.worst_high_risk_ward
  const wards = kpis.wards_covered_20_min
  const demand = kpis.demand_now
  const { baseline, fleet } = kpis

  return (
    <div className={`kpi-strip kpi-${mode}`}>
      <p className="kpi-title">
        {title}
        <span className="kpi-info" tabIndex={0} title="Depends on where units are placed, not the hour." aria-label="Depends on where units are placed, not the hour.">
          i
        </span>
      </p>

      <Item label="Avg response time (min)" before={num(avg.before)} after={num(avg.after)}>
        <Delta before={avg.before} after={avg.after} better="lower" unit="min" />
      </Item>
      <Item label="Demand covered within 15 min (%)" before={num(within15.before, 0)} after={num(within15.after, 0)}>
        <Delta before={within15.before} after={within15.after} better="higher" unit="pts" />
      </Item>
      <Item label={worst ? `Worst high-risk ward · ${worst.ward_code}` : 'Worst high-risk ward'} before={num(worst?.before_min)} after={num(worst?.after_min)} suffix="min">
        {worst && <Delta before={worst.before_min} after={worst.after_min} better="lower" unit="min" />}
      </Item>
      <Item label="Wards covered within 20 min" before={String(wards.before)} after={String(wards.after)} suffix={`of ${wards.total}`}>
        <Delta before={wards.before} after={wards.after} better="higher" unit="" />
      </Item>

      <p className="kpi-caption">
        Before = all units at base. Modelled travel times.
        {baseline.approximate && baseline.distance_km != null && ` Base is the nearest position, ${baseline.distance_km} km from the hospital.`}
      </p>

      <div className="kpi-hour-divider">
        <span className="kpi-hour-title">This hour</span>
      </div>
      <div className="kpi-hour-block">
        {demand && (
          <div className="kpi-hour-row">
            <span className="kpi-hour-label">Demand</span>
            <span>
              {demand.level}, {demand.multiplier.toFixed(2)}x avg
              {demand.top_wards.length > 0 && <span className="kpi-muted"> · {demand.top_wards.join(', ')}</span>}
            </span>
          </div>
        )}
        <div className="kpi-hour-row">
          <span className="kpi-hour-label">Fleet</span>
          <span>{fleet.total} {fleet.total === 1 ? 'unit' : 'units'} ({fleet.als} ALS, {fleet.bls} BLS)</span>
        </div>
        <div className="kpi-hour-row">
          <span className="kpi-hour-label">Closest pair</span>
          <span>{kpis.min_spacing_km_actual == null ? dash : `${kpis.min_spacing_km_actual.toFixed(2)} km`}</span>
        </div>
        {totalWeightedScore != null && (
          <details className="kpi-advanced-details">
            <summary>Advanced</summary>
            <div className="kpi-advanced-body">
              Total weighted score: <strong>{totalWeightedScore.toFixed(2)}</strong>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
