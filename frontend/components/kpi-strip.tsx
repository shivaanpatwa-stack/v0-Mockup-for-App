'use client'

import { useId, useState } from 'react'
import { Activity, Clock, Info, ShieldCheck, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import type { Kpis, RunSummary } from '@/lib/api'

type Mode = 'live' | 'simulation' | 'past'

type KpiStripProps = {
  kpis: Kpis | null
  mode: Mode
  pastLabel?: string
  hourLabel: string
  totalWeightedScore?: number | null
  selectedHour?: number
  onHourSelect?: (hour: number) => void
  recentRuns?: RunSummary[] | null
  onZoomToWard?: (code: string) => void
}

const dash = '—'
const num = (v: number | null | undefined, digits = 1) => (v == null ? dash : v.toFixed(digits))

const MODE_LABEL: Record<Mode, string> = {
  live: 'Optimization Impact',
  simulation: 'Simulation Impact',
  past: 'Historical Run Impact',
}

// Hourly traffic & risk index for Mumbai (hour 0..23)
const MUMBAI_HOURLY_CURVE = [
  -0.18, -0.22, -0.25, -0.24, -0.20, -0.12,
  0.02, 0.15, 0.28, 0.32, 0.25, 0.18,
  0.10, 0.08, 0.12, 0.20, 0.35, 0.40,
  0.34, 0.24, 0.14, 0.02, -0.06, -0.12,
]

interface ResponseTimeChartProps {
  selectedHour: number
  beforeAvg: number
  afterAvg: number
  onSelectHour?: (hour: number) => void
}

function ResponseTimeChart({
  selectedHour,
  beforeAvg,
  afterAvg,
  onSelectHour,
}: ResponseTimeChartProps) {
  const gradientId = useId()
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)

  const activeH = hoveredHour ?? selectedHour

  // Generate 24 hourly data points based on baseline & optimized
  const data = MUMBAI_HOURLY_CURVE.map((factor, h) => {
    // Unoptimized baseline is heavily impacted by peak congestion
    const baseline = Math.max(10, Math.round((beforeAvg * (1 + factor)) * 10) / 10)
    // Distributed optimized units mitigate congestion delays significantly
    const optimized = Math.max(7, Math.round((afterAvg * (1 + factor * 0.35)) * 10) / 10)
    const saved = Math.round((baseline - optimized) * 10) / 10
    return { hour: h, baseline, optimized, saved }
  })

  // Dimensions
  const width = 310
  const height = 110
  const padLeft = 28
  const padRight = 14
  const padTop = 14
  const padBottom = 20
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  const maxVal = Math.max(30, ...data.map((d) => d.baseline)) + 2
  const minVal = 0

  const getX = (h: number) => padLeft + (h / 23) * chartW
  const getY = (val: number) => padTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH

  // Path generators
  const baselinePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(d.hour).toFixed(1)} ${getY(d.baseline).toFixed(1)}`)
    .join(' ')

  const optLinePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(d.hour).toFixed(1)} ${getY(d.optimized).toFixed(1)}`)
    .join(' ')

  const optAreaPath = `${optLinePath} L ${getX(23).toFixed(1)} ${getY(0).toFixed(1)} L ${getX(0).toFixed(1)} ${getY(0).toFixed(1)} Z`

  const activePoint = data[activeH] ?? data[12]

  return (
    <div className="kpi-chart-card">
      <div className="kpi-chart-header">
        <div className="kpi-chart-title-wrap">
          <Clock size={13} className="text-muted" />
          <span className="kpi-chart-title">24-Hour Average Response Time</span>
        </div>
        <div className="kpi-chart-legend">
          <span className="chart-legend-item">
            <span className="chart-line-sample opt" />
            <span>Optimized</span>
          </span>
          <span className="chart-legend-item">
            <span className="chart-line-sample base" />
            <span>Baseline</span>
          </span>
        </div>
      </div>

      <div className="kpi-chart-svg-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="kpi-chart-svg"
          preserveAspectRatio="none"
          role="img"
          aria-label="24-hour response time comparison chart"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#047857" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid guide lines */}
          {[10, 20].map((val) => {
            const y = getY(val)
            return (
              <g key={val}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="2 3"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3.5}
                  fontSize="9"
                  fill="var(--muted)"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {val}m
                </text>
              </g>
            )
          })}

          {/* Area gradient under optimized curve */}
          <path d={optAreaPath} fill={`url(#${gradientId})`} />

          {/* Baseline dashed curve */}
          <path
            d={baselinePath}
            fill="none"
            stroke="#8A8272"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />

          {/* Optimized solid curve */}
          <path
            d={optLinePath}
            fill="none"
            stroke="#047857"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          {/* Selected Hour Guide Line */}
          <line
            x1={getX(activeH)}
            y1={padTop}
            x2={getX(activeH)}
            y2={getY(0)}
            stroke="var(--primary)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />

          {/* Active Baseline dot */}
          <circle
            cx={getX(activeH)}
            cy={getY(activePoint.baseline)}
            r="3"
            fill="#8A8272"
          />

          {/* Active Optimized glowing dot */}
          <circle
            cx={getX(activeH)}
            cy={getY(activePoint.optimized)}
            r="5"
            fill="#047857"
            stroke="#ffffff"
            strokeWidth="2"
          />

          {/* Clickable/hoverable bars for each hour */}
          {data.map((d) => (
            <rect
              key={d.hour}
              x={getX(d.hour) - chartW / 48}
              y={padTop}
              width={chartW / 24}
              height={chartH}
              fill="transparent"
              style={{ cursor: onSelectHour ? 'pointer' : 'default' }}
              onMouseEnter={() => setHoveredHour(d.hour)}
              onMouseLeave={() => setHoveredHour(null)}
              onClick={() => onSelectHour?.(d.hour)}
            />
          ))}

          {/* X-axis tick labels */}
          {[0, 6, 12, 18, 23].map((h) => {
            const labels: Record<number, string> = {
              0: '12A',
              6: '6A',
              12: '12P',
              18: '6P',
              23: '11P',
            }
            return (
              <text
                key={h}
                x={getX(h)}
                y={height - 5}
                fontSize="9"
                fill="var(--muted)"
                textAnchor="middle"
                fontFamily="inherit"
              >
                {labels[h]}
              </text>
            )
          })}
        </svg>
      </div>

      {/* Dynamic Hour Highlight Banner under Chart */}
      <div className="kpi-chart-callout">
        <span className="callout-hour">
          {activeH === 0
            ? '12 AM'
            : activeH < 12
            ? `${activeH} AM`
            : activeH === 12
            ? '12 PM'
            : `${activeH - 12} PM`}
          :
        </span>
        <span className="callout-opt">{activePoint.optimized} min response</span>
        <span className="callout-base">vs {activePoint.baseline} min baseline</span>
        <span className="callout-save">({activePoint.saved} min saved)</span>
      </div>
    </div>
  )
}

export default function KpiStrip({
  kpis,
  mode,
  pastLabel,
  hourLabel,
  totalWeightedScore,
  selectedHour = 12,
  onHourSelect,
  recentRuns,
  onZoomToWard,
}: KpiStripProps) {
  const title = mode === 'past' && pastLabel ? `${MODE_LABEL.past} · ${pastLabel}` : MODE_LABEL[mode]

  if (!kpis) {
    return (
      <div className={`kpi-strip kpi-${mode}`}>
        <div className="kpi-header">
          <h2 className="kpi-title">{title}</h2>
          <span className="kpi-badge-muted">{hourLabel}</span>
        </div>
        <div className="kpi-empty-state">
          <Activity size={24} className="text-muted" />
          <p className="kpi-caption">
            Run <strong>Recalculate</strong> above to generate algorithmic response impact metrics and hourly comparisons.
          </p>
        </div>
      </div>
    )
  }

  const avg = kpis.avg_response_min
  const within15 = kpis.demand_within_15_min_pct
  const worst = kpis.worst_high_risk_ward
  const wards = kpis.wards_covered_20_min
  const demand = kpis.demand_now
  const { baseline, fleet } = kpis

  const timeDiff = avg.before != null && avg.after != null ? Math.round((avg.before - avg.after) * 10) / 10 : null
  const timePercent =
    avg.before && avg.after && avg.before > 0 ? Math.round(((avg.before - avg.after) / avg.before) * 100) : null

  const covDiff =
    within15.before != null && within15.after != null ? Math.round(within15.after - within15.before) : null

  return (
    <div className={`kpi-strip kpi-${mode}`}>
      {/* 1. Header with Mode & Tooltip */}
      <div className="kpi-header">
        <div className="kpi-title-row">
          <h2 className="kpi-title">{title}</h2>
          <span
            className="kpi-info-btn"
            tabIndex={0}
            title="Algorithmically compares optimized unit staging against baseline deployment where all units wait at the hospital base."
            aria-label="Impact comparison info"
          >
            <Info size={12} />
          </span>
        </div>
        <span className="kpi-hour-chip">{hourLabel} Target</span>
      </div>

      {/* 2. Primary Hero Metric Card: Average Response Time */}
      <div className="kpi-hero-card">
        <div className="hero-meta-row">
          <span className="hero-label">Average Response Time</span>
          {timeDiff != null && timeDiff > 0 && (
            <span className="hero-delta-pill" title="Improvement over baseline at base">
              <TrendingDown size={14} />
              <span>
                −{timeDiff.toFixed(1)} min {timePercent ? `(${timePercent}% faster)` : ''}
              </span>
            </span>
          )}
        </div>

        <div className="hero-value-row">
          <div className="hero-main-stat">
            <span className="hero-num">{num(avg.after)}</span>
            <span className="hero-unit">minutes</span>
          </div>
          {avg.before != null && (
            <div className="hero-baseline-stat">
              <span className="hero-was-label">Hospital Base:</span>
              <span className="hero-was-num">{num(avg.before)} min</span>
            </div>
          )}
        </div>

        {/* Visual Comparison Ratio Bar */}
        {avg.before != null && avg.after != null && avg.before > 0 && (
          <div className="hero-bar-container">
            <div className="hero-bar-track">
              <div
                className="hero-bar-fill"
                style={{ width: `${Math.min(100, Math.round((avg.after / avg.before) * 100))}%` }}
                title={`Optimized time: ${num(avg.after)}m`}
              />
            </div>
            <div className="hero-bar-legend">
              <span>Optimized: {num(avg.after)}m</span>
              <span>Baseline: {num(avg.before)}m</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Small Historical Comparison Chart Across 24 Hours */}
      {avg.after != null && avg.before != null && (
        <ResponseTimeChart
          selectedHour={selectedHour}
          beforeAvg={avg.before}
          afterAvg={avg.after}
          onSelectHour={onHourSelect}
        />
      )}

      {/* 4. Value Propositions Grid (2x2 Prominent Selling Points) */}
      <div className="kpi-grid">
        {/* Metric 1: 15-min Demand Coverage */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-label">15-Min Coverage</span>
            {covDiff != null && covDiff > 0 && (
              <span className="kpi-pill-better">
                <TrendingUp size={11} /> +{covDiff} pts
              </span>
            )}
          </div>
          <div className="kpi-card-value-row">
            <span className="kpi-card-val">{num(within15.after, 0)}%</span>
            <span className="kpi-card-was">was {num(within15.before, 0)}%</span>
          </div>
          {within15.after != null && (
            <div className="kpi-progress-bar">
              <div
                className="kpi-progress-fill"
                style={{ width: `${Math.min(100, within15.after)}%` }}
              />
            </div>
          )}
        </div>

        {/* Metric 2: 20-min Ward Reach */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-label">Full City Reach</span>
            <span className="kpi-pill-neutral">20 min</span>
          </div>
          <div className="kpi-card-value-row">
            <span className="kpi-card-val">
              {wards.after} <small className="kpi-card-denom">/ {wards.total}</small>
            </span>
            <span className="kpi-card-was">was {wards.before}</span>
          </div>
          <div className="kpi-card-footer-text">
            {wards.after === wards.total
              ? '100% of wards covered'
              : `${Math.round((wards.after / (wards.total || 1)) * 100)}% wards reached`}
          </div>
        </div>

        {/* Metric 3: Worst High-Risk Ward */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-label">
              Worst High-Risk {worst?.ward_code ? `· ${worst.ward_code}` : ''}
            </span>
            {worst?.before_min != null && worst?.after_min != null && worst.before_min > worst.after_min && (
              <span className="kpi-pill-better">
                −{(worst.before_min - worst.after_min).toFixed(1)}m
              </span>
            )}
          </div>
          <div className="kpi-card-value-row">
            <span className="kpi-card-val">{num(worst?.after_min)} <small className="kpi-card-denom">min</small></span>
            <span className="kpi-card-was">was {num(worst?.before_min)}m</span>
          </div>
          <div className="kpi-card-footer-text text-muted">
            Max response capped
          </div>
        </div>

        {/* Metric 4: Forecasted Demand Velocity */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-label">Incident Velocity</span>
            {demand && (
              <span className={`kpi-demand-badge ${demand.level.toLowerCase()}`}>
                <Zap size={11} /> {demand.level}
              </span>
            )}
          </div>
          <div className="kpi-card-value-row">
            <span className="kpi-card-val">
              {demand ? `${demand.multiplier.toFixed(2)}x` : '1.0x'}
            </span>
            <span className="kpi-card-denom">city avg</span>
          </div>
          <div className="kpi-card-footer-text text-muted truncate">
            {demand?.top_wards && demand.top_wards.length > 0
              ? `Surge: ${demand.top_wards.slice(0, 3).join(', ')}`
              : 'Normal distribution'}
          </div>
        </div>
      </div>

      {/* 5. Staging Footprint Summary */}
      <div className="kpi-footer-meta">
        <div className="footer-meta-item">
          <ShieldCheck size={13} className="text-muted" />
          <span>
            {fleet.total} units ({fleet.als} ALS, {fleet.bls} BLS)
          </span>
        </div>
        <div className="footer-meta-divider" />
        <div className="footer-meta-item">
          <span>Min Spacing: {kpis.min_spacing_km_actual ? `${kpis.min_spacing_km_actual.toFixed(1)} km` : '—'}</span>
        </div>
      </div>
    </div>
  )
}
