'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  Ambulance,
  Car,
  Clock,
  MapPinOff,
  Play,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { useApp } from '@/lib/app-state'
import { deleteScenario, getScenarios, type SavedScenario, type ScenarioRequest } from '@/lib/api'
import { formatDayClock, hourLabel, num } from '@/lib/format'

type AssumptionBadge = {
  key: string
  label: string
  detail?: string
  tone: 'neutral' | 'info' | 'warning' | 'critical' | 'accent'
  icon: React.ReactNode
}

function getScenarioBadges(p: ScenarioRequest): AssumptionBadge[] {
  const badges: AssumptionBadge[] = []

  // 1. Time / hour
  badges.push({
    key: 'time',
    label: hourLabel(p.hour),
    tone: 'neutral',
    icon: <Clock size={12} aria-hidden="true" />,
  })

  // 2. Units / fleet
  if (p.num_ambulances != null) {
    badges.push({
      key: 'units',
      label: `${p.num_ambulances} units`,
      tone: 'info',
      icon: <Ambulance size={12} aria-hidden="true" />,
    })
  }

  // 3. Travel speed / traffic
  if (p.travel_time_multiplier && p.travel_time_multiplier !== 1) {
    const slower = p.travel_time_multiplier > 1
    const pct = Math.round(Math.abs(p.travel_time_multiplier - 1) * 100)
    badges.push({
      key: 'traffic',
      label: `Travel ${pct}% ${slower ? 'slower' : 'faster'}`,
      tone: slower ? 'warning' : 'neutral',
      icon: <Car size={12} aria-hidden="true" />,
    })
  }

  // 4. Demand modifier
  if (p.demand_multiplier && p.demand_multiplier !== 1) {
    const pct = Math.round((p.demand_multiplier - 1) * 100)
    const wardsText = p.demand_wards && p.demand_wards.length > 0 ? `in ${p.demand_wards.join(', ')}` : ''
    badges.push({
      key: 'demand',
      label: `Demand ${pct > 0 ? '+' : ''}${pct}%`,
      detail: wardsText || undefined,
      tone: 'accent',
      icon: <TrendingUp size={12} aria-hidden="true" />,
    })
  }

  // 5. Staging closures
  if (p.closed_candidates && p.closed_candidates.length > 0) {
    const count = p.closed_candidates.length
    badges.push({
      key: 'closures',
      label: `${count} spot${count > 1 ? 's' : ''} closed`,
      tone: 'critical',
      icon: <MapPinOff size={12} aria-hidden="true" />,
    })
  }

  // 6. Response target
  if (p.max_response_minutes) {
    badges.push({
      key: 'target',
      label: `${p.max_response_minutes}-min target`,
      tone: 'neutral',
      icon: <Target size={12} aria-hidden="true" />,
    })
  }

  // 7. Spacing rule
  if (p.min_spacing_km && p.min_spacing_km !== 2.0) {
    badges.push({
      key: 'spacing',
      label: `${p.min_spacing_km} km spacing`,
      tone: 'neutral',
      icon: <SlidersHorizontal size={12} aria-hidden="true" />,
    })
  }

  return badges
}

export default function ScenariosPage() {
  const router = useRouter()
  const { setPendingScenarioRequest, setWhatIfOpen, pushToast, hospital } = useApp()
  const [rows, setRows] = useState<SavedScenario[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    getScenarios()
      .then((r) => {
        setRows(r)
        setError(null)
      })
      .catch((err) => setError((err as Error).message))
  }, [])

  useEffect(() => {
    if (hospital) load()
  }, [hospital, load])

  const open = (s: SavedScenario) => {
    setPendingScenarioRequest(s.parameters)
    setWhatIfOpen(true)
    router.push('/app')
  }

  const remove = async (s: SavedScenario) => {
    if (!window.confirm(`Delete the saved scenario "${s.name}"? This can't be undone.`)) return
    try {
      await deleteScenario(s.scenario_id)
      pushToast({ text: `Deleted "${s.name}"` })
      load()
    } catch (err) {
      pushToast({ text: `Couldn't delete: ${(err as Error).message}`, tone: 'critical' })
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Scenarios</h1>
          <p>What-ifs you saved. Open one to see it on the live map and adjust it.</p>
        </div>
        {rows && rows.length > 0 && (
          <span className="muted mono" style={{ fontSize: 13 }}>
            {rows.length} saved scenario{rows.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {error && (
        <p className="controls-error" role="alert">
          {error}{' '}
          <button type="button" className="btn btn-sm" onClick={load}>
            Retry
          </button>
        </p>
      )}

      {rows === null && !error ? (
        <p className="muted">Loading saved scenarios…</p>
      ) : rows && rows.length === 0 ? (
        <div className="empty">
          <strong>No saved scenarios</strong>
          <span>Open What if… on the live map, set the knobs, then choose Save.</span>
        </div>
      ) : rows ? (
        <div className="scenario-grid">
          {rows.map((s) => {
            const badges = getScenarioBadges(s.parameters)
            const targetMin = s.parameters.max_response_minutes ?? 20
            const reach = s.result_summary?.reach_20_pct ?? s.result_summary?.reach_15_pct
            const wardsCovered = s.result_summary?.wards_covered

            return (
              <article key={s.scenario_id} className="scenario-card">
                <div className="scenario-card-head">
                  <div className="scenario-card-identity">
                    <h2 className="scenario-card-title">{s.name}</h2>
                    <span className="scenario-card-date">Saved {formatDayClock(s.created_at)}</span>
                  </div>
                  <div className="scenario-card-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary scenario-btn-open"
                      onClick={() => open(s)}
                    >
                      <Play size={12} fill="currentColor" aria-hidden="true" />
                      <span>Open in What if…</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost scenario-btn-delete"
                      aria-label={`Delete ${s.name}`}
                      title={`Delete ${s.name}`}
                      onClick={() => remove(s)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="scenario-card-metrics">
                  <div className="scenario-metric">
                    <span className="scenario-metric-label">Avg response</span>
                    <div className="scenario-metric-value">
                      <span className="num">{num(s.result_summary?.avg_response_min)}</span>
                      <span className="unit">min</span>
                    </div>
                  </div>
                  <div className="scenario-metric">
                    <span className="scenario-metric-label">{targetMin}-min reach</span>
                    <div className="scenario-metric-value">
                      <span className="num">{num(reach, 0)}</span>
                      <span className="unit">%</span>
                    </div>
                  </div>
                  <div className="scenario-metric">
                    <span className="scenario-metric-label">Wards reached</span>
                    <div className="scenario-metric-value">
                      <span className="num">{wardsCovered != null ? wardsCovered : '–'}</span>
                      <span className="unit">/ 24</span>
                    </div>
                  </div>
                </div>

                <div className="scenario-card-assumptions">
                  <span className="scenario-assumptions-heading">Assumptions</span>
                  <div className="scenario-chips">
                    {badges.map((b) => (
                      <span key={b.key} className={`scenario-chip tone-${b.tone}`}>
                        {b.icon}
                        <span>{b.label}</span>
                        {b.detail && <span className="scenario-chip-detail">{b.detail}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Scenario numbers come from simulated demand and the assumptions listed. They are not forecasts of real events.
      </p>
    </div>
  )
}
