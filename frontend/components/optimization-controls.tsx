'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Sparkles, Play, Pause } from 'lucide-react'
import type { Hospital, RunSummary } from '@/lib/api'

// 24-Hour citywide demand profile from ward_hour_risk_scores.csv (min: 5.20 at 4 AM, max: 11.11 at 11 AM)
export const HOURLY_DEMAND_PROFILE = [
  { hour: 0, total: 8.34, heightPct: 63, label: '12:00 AM', level: 'moderate' },
  { hour: 1, total: 8.24, heightPct: 61, label: '01:00 AM', level: 'moderate' },
  { hour: 2, total: 7.39, heightPct: 50, label: '02:00 AM', level: 'moderate' },
  { hour: 3, total: 6.42, heightPct: 37, label: '03:00 AM', level: 'low' },
  { hour: 4, total: 5.20, heightPct: 20, label: '04:00 AM', level: 'low' }, // Overnight trough
  { hour: 5, total: 5.30, heightPct: 21, label: '05:00 AM', level: 'low' },
  { hour: 6, total: 5.75, heightPct: 27, label: '06:00 AM', level: 'low' },
  { hour: 7, total: 6.75, heightPct: 41, label: '07:00 AM', level: 'moderate' },
  { hour: 8, total: 7.23, heightPct: 48, label: '08:00 AM', level: 'moderate' },
  { hour: 9, total: 8.83, heightPct: 69, label: '09:00 AM', level: 'moderate' },
  { hour: 10, total: 10.05, heightPct: 86, label: '10:00 AM', level: 'high' },
  { hour: 11, total: 11.11, heightPct: 100, label: '11:00 AM', level: 'peak' }, // Daytime peak!
  { hour: 12, total: 9.99, heightPct: 85, label: '12:00 PM', level: 'high' },
  { hour: 13, total: 9.25, heightPct: 75, label: '01:00 PM', level: 'moderate' },
  { hour: 14, total: 8.58, heightPct: 66, label: '02:00 PM', level: 'moderate' },
  { hour: 15, total: 8.19, heightPct: 60, label: '03:00 PM', level: 'moderate' },
  { hour: 16, total: 8.93, heightPct: 71, label: '04:00 PM', level: 'moderate' },
  { hour: 17, total: 9.28, heightPct: 75, label: '05:00 PM', level: 'high' },
  { hour: 18, total: 9.77, heightPct: 82, label: '06:00 PM', level: 'high' }, // Evening surge!
  { hour: 19, total: 9.38, heightPct: 77, label: '07:00 PM', level: 'moderate' },
  { hour: 20, total: 9.54, heightPct: 79, label: '08:00 PM', level: 'moderate' },
  { hour: 21, total: 9.38, heightPct: 77, label: '09:00 PM', level: 'moderate' },
  { hour: 22, total: 9.28, heightPct: 75, label: '10:00 PM', level: 'moderate' },
  { hour: 23, total: 8.38, heightPct: 63, label: '11:00 PM', level: 'moderate' },
]

function formatHourMono(h: number): string {
  const normalized = ((h % 24) + 24) % 24
  const period = normalized >= 12 ? 'PM' : 'AM'
  const displayH = normalized % 12 === 0 ? 12 : normalized % 12
  const padded = displayH.toString().padStart(2, '0')
  return `${padded}:00 ${period}`
}

function getHourDemandTag(h: number): { tag: string; level: 'low' | 'moderate' | 'high' | 'peak' } {
  if (h === 11) return { tag: 'City Peak', level: 'peak' }
  if (h === 10 || h === 12) return { tag: 'Morning Surge', level: 'high' }
  if (h >= 17 && h <= 19) return { tag: 'Evening Rush', level: 'high' }
  if (h >= 3 && h <= 6) return { tag: 'Low Activity', level: 'low' }
  return { tag: 'Moderate', level: 'moderate' }
}

interface OptimizationControlsProps {
  hour: number
  onHourChange: (hour: number) => void
  spacing: string
  onSpacingChange: (spacing: string) => void
  spacingValid: boolean
  maxSpacingKm: number
  hospital: Hospital | undefined
  fleetChanged: boolean
  loading: boolean
  onRecalculate: () => void
  lastSucceeded: RunSummary | undefined
  recentRunsCount: number
  confirmationMessage: string | null
  formatHour: (hour: number) => string
  formatIST: (iso: string) => string
}

export default function OptimizationControls({
  hour,
  onHourChange,
  spacing,
  onSpacingChange,
  spacingValid,
  maxSpacingKm,
  hospital,
  fleetChanged,
  loading,
  onRecalculate,
  lastSucceeded,
  recentRunsCount,
  confirmationMessage,
  formatHour,
  formatIST,
}: OptimizationControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  // Auto-play loop to animate through the 24 hours of the day
  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(() => {
      onHourChange((hour + 1) % 24)
    }, 850)
    return () => clearInterval(timer)
  }, [isPlaying, hour, onHourChange])

  const togglePlay = () => {
    setIsPlaying((prev) => !prev)
  }

  const inServiceCount = hospital
    ? hospital.ambulances.filter((a) => a.status !== 'unavailable').length
    : 0

  const demandInfo = getHourDemandTag(hour)

  return (
    <section id="overview" className="optimization-card" aria-label="Optimization Parameters">
      {/* Header with Status Indicator */}
      <div className="opt-header">
        <h2 className="opt-title">Optimization Parameters</h2>
        <div className="opt-status-wrap">
          {loading ? (
            <span className="opt-status-badge calculating">
              <Loader2 size={12} className="animate-spin" />
              <span>Calculating…</span>
            </span>
          ) : fleetChanged ? (
            <span className="opt-status-badge warning">
              <span className="opt-status-dot warning" aria-hidden="true" />
              <span>Fleet Changed</span>
            </span>
          ) : !spacingValid ? (
            <span className="opt-status-badge error">
              <span className="opt-status-dot error" aria-hidden="true" />
              <span>Invalid Spacing</span>
            </span>
          ) : hospital ? (
            <span className="opt-status-badge ready">
              <span className="opt-status-dot ready" aria-hidden="true" />
              <span>Ready</span>
            </span>
          ) : (
            <span className="opt-status-badge warning">
              <span className="opt-status-dot warning" aria-hidden="true" />
              <span>Connecting…</span>
            </span>
          )}
        </div>
      </div>

      {/* Target Hour Section with Histogram, Play Button & Bold Mono Label */}
      <div className="opt-time-section">
        <div className="opt-row-between">
          <div className="opt-time-left">
            <button
              type="button"
              className={`opt-play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={togglePlay}
              title={isPlaying ? 'Pause 24h playback' : 'Play through 24-hour cycle'}
              aria-label={isPlaying ? 'Pause timeline animation' : 'Play through 24-hour cycle'}
            >
              {isPlaying ? (
                <Pause size={13} className="fill-current" />
              ) : (
                <Play size={13} className="fill-current ml-0.5" />
              )}
              <span>{isPlaying ? 'Pause' : 'Play 24h'}</span>
            </button>
            <label className="opt-field-label" htmlFor="opt-hour-slider">
              Target Time
            </label>
          </div>

          <div className="opt-hour-badge-group">
            <span className="opt-hour-mono-label" aria-live="polite">
              {formatHourMono(hour)}
            </span>
            <span className={`opt-demand-chip demand-${demandInfo.level}`}>
              {demandInfo.tag}
            </span>
          </div>
        </div>

        {/* 24-Hour Demand Histogram & Range Slider Container */}
        <div className="opt-slider-container">
          {/* Histogram Bars Layer */}
          <div className="opt-histogram-track" aria-hidden="true">
            {HOURLY_DEMAND_PROFILE.map((item) => {
              const isSelected = item.hour === hour
              const isPeak = item.level === 'peak' || item.level === 'high'
              return (
                <div
                  key={item.hour}
                  className={`opt-histogram-col ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setIsPlaying(false)
                    onHourChange(item.hour)
                  }}
                  title={`${item.label} · ${isPeak ? 'High/Peak' : 'Normal'} demand (${item.total} total risk score)`}
                >
                  <div
                    className={`opt-histogram-bar ${isPeak ? 'bar-peak' : ''} ${isSelected ? 'bar-selected' : ''}`}
                    style={{ height: `${item.heightPct}%` }}
                  />
                </div>
              )
            })}
          </div>

          {/* Native Range Slider Placed Over the Histogram */}
          <input
            id="opt-hour-slider"
            type="range"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => {
              setIsPlaying(false)
              onHourChange(Number(e.target.value))
            }}
            className="opt-slider opt-slider-overlay"
            aria-label="Target hour of day"
          />
        </div>

        {/* Informative Time Ticks with Peak/Low Annotations */}
        <div className="opt-time-ticks" aria-hidden="true">
          <span>12 AM</span>
          <span>4 AM <small className="tick-sub">Low</small></span>
          <span>8 AM</span>
          <span>11 AM <small className="tick-sub peak">Peak</small></span>
          <span>2 PM</span>
          <span>6 PM <small className="tick-sub rush">Rush</small></span>
          <span>11 PM</span>
        </div>
      </div>

      {/* Parameters Grid */}
      <div className="opt-params-grid">
        <div className="opt-param-col">
          <span className="opt-param-label">Available Fleet</span>
          <span className="opt-param-value">
            {hospital ? `${inServiceCount} / ${hospital.fleet_size} units` : '—'}
          </span>
        </div>

        <div className="opt-param-divider" aria-hidden="true" />

        <div className="opt-param-col">
          <span className="opt-param-label">Coverage Radius</span>
          <span className="opt-param-value">
            {hospital ? `${hospital.operating_radius_km} km` : '—'}
          </span>
        </div>

        <div className="opt-param-divider" aria-hidden="true" />

        <div className="opt-param-col">
          <label className="opt-param-label" htmlFor="min-spacing-input">
            Min Spacing
          </label>
          <div className="opt-spacing-stepper">
            <input
              id="min-spacing-input"
              className="opt-spacing-input"
              type="number"
              min="0"
              max={maxSpacingKm}
              step="0.5"
              value={spacing}
              onChange={(e) => onSpacingChange(e.target.value)}
              aria-invalid={!spacingValid}
              disabled={loading}
            />
            <span className="opt-spacing-unit">km</span>
          </div>
        </div>
      </div>

      {/* Recalculate CTA & Meta */}
      <div className="opt-actions">
        <button
          type="button"
          className="opt-recalc-btn"
          disabled={loading || !spacingValid || !hospital}
          onClick={onRecalculate}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Optimizing Staging…</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>Recalculate Staging</span>
            </>
          )}
        </button>

        <div className="opt-meta">
          {confirmationMessage ? (
            <span className="opt-meta-confirm">
              <CheckCircle2 size={14} className="opt-confirmation-icon" />
              <span>{confirmationMessage}</span>
            </span>
          ) : lastSucceeded ? (
            <span className="opt-meta-text">
              Last run {formatIST(lastSucceeded.created_at)} ({formatHour(lastSucceeded.target_hour)} plan)
            </span>
          ) : (
            <span className="opt-meta-muted">No runs saved for this hospital yet</span>
          )}
        </div>
      </div>
    </section>
  )
}
