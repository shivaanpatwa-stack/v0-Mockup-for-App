'use client'

import { useState, useEffect } from 'react'
import {
  FlaskConical,
  Play,
  RotateCcw,
  Sliders,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Minus,
  Plus,
  Sparkles,
  Zap,
  ShieldAlert,
} from 'lucide-react'
import type { OptimizeResult, SimulationResult } from '@/lib/api'

const MIN_FLEET = 1
const MAX_FLEET = 20
const MIN_RADIUS_KM = 5
const MAX_RADIUS_KM = 30
const MIN_SPACING_KM = 0.5
const MAX_SPACING_KM = 5.0

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value))

function formatHour(h: number) {
  if (h === 0) return '12:00 AM'
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return '12:00 PM'
  return `${h - 12}:00 PM`
}

function formatWards(wards: string[]) {
  return wards.length ? wards.join(', ') : 'None (Full reach)'
}

export type WhatIfParams = {
  numAmbulances: number
  radiusKm: number
  spacingKm?: number
  maxResponseMinutes?: number
  hour?: number
}

type WhatIfPanelProps = {
  /** Real defaults: ambulances in service and the hospital's radius. */
  defaultFleet: number
  defaultRadiusKm: number
  currentSpacingKm?: number
  currentHour?: number
  running: boolean
  disabled: boolean
  simulation: SimulationResult | null
  liveRun: OptimizeResult | null
  onRun: (params: WhatIfParams) => void
  onDiscard?: () => void
}

export default function WhatIfPanel({
  defaultFleet,
  defaultRadiusKm,
  currentSpacingKm = 2.0,
  currentHour = 20,
  running,
  disabled,
  simulation,
  liveRun,
  onRun,
  onDiscard,
}: WhatIfPanelProps) {
  const initialFleet = clamp(defaultFleet, MIN_FLEET, MAX_FLEET)
  const initialRadius = clamp(Math.round(defaultRadiusKm), MIN_RADIUS_KM, MAX_RADIUS_KM)
  const initialSpacing = clamp(Number(currentSpacingKm.toFixed(1)), MIN_SPACING_KM, MAX_SPACING_KM)

  const [fleet, setFleet] = useState<number>(initialFleet)
  const [radius, setRadius] = useState<number>(initialRadius)
  const [spacing, setSpacing] = useState<number>(initialSpacing)
  const [maxResponseMinutes, setMaxResponseMinutes] = useState<number>(20)
  const [targetHour, setTargetHour] = useState<number>(currentHour)
  const [activePreset, setActivePreset] = useState<string | null>(null)

  // Follow props when base configuration changes
  useEffect(() => {
    setFleet(clamp(defaultFleet, MIN_FLEET, MAX_FLEET))
  }, [defaultFleet])

  useEffect(() => {
    setRadius(clamp(Math.round(defaultRadiusKm), MIN_RADIUS_KM, MAX_RADIUS_KM))
  }, [defaultRadiusKm])

  useEffect(() => {
    setSpacing(clamp(Number(currentSpacingKm.toFixed(1)), MIN_SPACING_KM, MAX_SPACING_KM))
  }, [currentSpacingKm])

  useEffect(() => {
    setTargetHour(currentHour)
  }, [currentHour])

  const handleReset = () => {
    setFleet(initialFleet)
    setRadius(initialRadius)
    setSpacing(initialSpacing)
    setMaxResponseMinutes(20)
    setTargetHour(currentHour)
    setActivePreset(null)
  }

  // Presets
  const applyPreset = (presetName: string) => {
    setActivePreset(presetName)
    if (presetName === 'out_of_service') {
      setFleet(Math.max(1, defaultFleet - 1))
      setRadius(initialRadius)
      setSpacing(initialSpacing)
      setMaxResponseMinutes(20)
    } else if (presetName === 'expansion') {
      setFleet(Math.min(MAX_FLEET, defaultFleet + 2))
      setRadius(initialRadius)
      setSpacing(initialSpacing)
      setMaxResponseMinutes(20)
    } else if (presetName === 'dense_staging') {
      setFleet(initialFleet)
      setSpacing(1.0)
      setMaxResponseMinutes(20)
    } else if (presetName === 'wide_dispersal') {
      setFleet(initialFleet)
      setSpacing(3.5)
      setMaxResponseMinutes(20)
    } else if (presetName === 'strict_sla') {
      setFleet(initialFleet)
      setSpacing(initialSpacing)
      setMaxResponseMinutes(15)
    }
  }

  const handleRun = () => {
    onRun({
      numAmbulances: fleet,
      radiusKm: radius,
      spacingKm: spacing,
      maxResponseMinutes,
      hour: targetHour,
    })
  }

  const syntheticCount = Math.max(0, fleet - defaultFleet)
  const deficitCount = Math.max(0, defaultFleet - fleet)

  // Comparison metrics calculation
  const liveAvgTime = liveRun?.kpis?.avg_response_min.after ?? null
  const simAvgTime = simulation?.kpis?.avg_response_min.after ?? null
  const timeDelta = liveAvgTime !== null && simAvgTime !== null ? Number((simAvgTime - liveAvgTime).toFixed(1)) : null

  const liveCoverage15 = liveRun?.kpis?.demand_within_15_min_pct.after ?? null
  const simCoverage15 = simulation?.kpis?.demand_within_15_min_pct.after ?? null
  const cov15Delta = liveCoverage15 !== null && simCoverage15 !== null ? Math.round(simCoverage15 - liveCoverage15) : null

  const liveWards20 = liveRun?.kpis?.wards_covered_20_min
  const simWards20 = simulation?.kpis?.wards_covered_20_min

  const liveWorst = liveRun?.kpis?.worst_high_risk_ward
  const simWorst = simulation?.kpis?.worst_high_risk_ward

  return (
    <details className="whatif-panel" open={simulation !== null ? true : undefined}>
      <summary className="whatif-summary">
        <div className="whatif-summary-left">
          <div className="whatif-icon-badge">
            <FlaskConical className="w-4 h-4 text-sky-700" />
          </div>
          <div>
            <div className="whatif-title">
              What-If Scenario Simulator
              {simulation && (
                <span className="whatif-active-badge">
                  Active Simulation: {simulation.parameters.num_ambulances} units · {simulation.parameters.operating_radius_km} km
                </span>
              )}
            </div>
            <div className="whatif-subtitle">
              Stress-test out-of-service resilience, fleet expansion, staging spacing, and response guarantees.
            </div>
          </div>
        </div>

        <div className="whatif-summary-right">
          {simulation && onDiscard && (
            <button
              type="button"
              className="whatif-summary-discard"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDiscard()
              }}
            >
              Discard Simulation
            </button>
          )}
          {!simulation && (
            <div className="whatif-teaser-tags">
              <span className="whatif-teaser-tag">Resilience (-1)</span>
              <span className="whatif-teaser-tag">Expansion (+2)</span>
              <span className="whatif-teaser-tag">Spacing</span>
              <span className="whatif-teaser-tag">15-Min SLA</span>
            </div>
          )}
          <ChevronDown className="whatif-chevron w-4 h-4" />
        </div>
      </summary>

      <div className="whatif-body">
        {/* Quick Scenario Presets */}
        <div className="whatif-presets-section">
          <div className="whatif-section-label">
            <Sparkles className="w-3.5 h-3.5" /> Quick Scenario Presets
          </div>
          <div className="whatif-presets-grid">
            <button
              type="button"
              className={`whatif-preset-btn ${activePreset === 'out_of_service' ? 'active' : ''}`}
              onClick={() => applyPreset('out_of_service')}
            >
              <div className="whatif-preset-title">
                <Minus className="w-3.5 h-3.5 text-rose-600" /> 1 Out of Service (-1)
              </div>
              <div className="whatif-preset-desc">Simulate sudden mechanical failure or crew off-duty</div>
            </button>

            <button
              type="button"
              className={`whatif-preset-btn ${activePreset === 'expansion' ? 'active' : ''}`}
              onClick={() => applyPreset('expansion')}
            >
              <div className="whatif-preset-title">
                <Plus className="w-3.5 h-3.5 text-emerald-600" /> Fleet Expansion (+2)
              </div>
              <div className="whatif-preset-desc">Evaluate adding 2 backup BLS ambulances to the fleet</div>
            </button>

            <button
              type="button"
              className={`whatif-preset-btn ${activePreset === 'dense_staging' ? 'active' : ''}`}
              onClick={() => applyPreset('dense_staging')}
            >
              <div className="whatif-preset-title">
                <Zap className="w-3.5 h-3.5 text-amber-600" /> Dense Staging (1.0 km)
              </div>
              <div className="whatif-preset-desc">Cluster units tightly near central high-incident wards</div>
            </button>

            <button
              type="button"
              className={`whatif-preset-btn ${activePreset === 'wide_dispersal' ? 'active' : ''}`}
              onClick={() => applyPreset('wide_dispersal')}
            >
              <div className="whatif-preset-title">
                <Sliders className="w-3.5 h-3.5 text-sky-600" /> Wide Dispersal (3.5 km)
              </div>
              <div className="whatif-preset-desc">Enforce wider spacing to safeguard suburban fringes</div>
            </button>

            <button
              type="button"
              className={`whatif-preset-btn ${activePreset === 'strict_sla' ? 'active' : ''}`}
              onClick={() => applyPreset('strict_sla')}
            >
              <div className="whatif-preset-title">
                <ShieldAlert className="w-3.5 h-3.5 text-purple-600" /> Strict 15-Min SLA
              </div>
              <div className="whatif-preset-desc">Cap maximum allowable response time to 15 minutes</div>
            </button>
          </div>
        </div>

        {/* Grouped Parameter Controls */}
        <div className="whatif-controls-grid">
          {/* Group 1: Fleet Capacity */}
          <div className="whatif-control-card">
            <div className="whatif-control-header">
              <span className="whatif-control-label">Fleet Capacity</span>
              <span className="whatif-control-val">{fleet} units</span>
            </div>
            <div className="whatif-stepper-wrap">
              <button
                type="button"
                className="whatif-step-btn"
                onClick={() => setFleet((prev) => Math.max(MIN_FLEET, prev - 1))}
                disabled={fleet <= MIN_FLEET}
                aria-label="Decrease fleet size"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                className="whatif-number-input"
                min={MIN_FLEET}
                max={MAX_FLEET}
                value={fleet}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  if (!isNaN(val)) setFleet(clamp(val, MIN_FLEET, MAX_FLEET))
                }}
              />
              <button
                type="button"
                className="whatif-step-btn"
                onClick={() => setFleet((prev) => Math.min(MAX_FLEET, prev + 1))}
                disabled={fleet >= MAX_FLEET}
                aria-label="Increase fleet size"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="whatif-control-note">
              {syntheticCount > 0 && (
                <span className="text-amber-800 font-medium">
                  +{syntheticCount} simulated BLS unit{syntheticCount > 1 ? 's' : ''} added
                </span>
              )}
              {deficitCount > 0 && (
                <span className="text-rose-800 font-medium">
                  {deficitCount} live unit{deficitCount > 1 ? 's' : ''} taken out of service
                </span>
              )}
              {syntheticCount === 0 && deficitCount === 0 && (
                <span>Matches active fleet ({defaultFleet} in service)</span>
              )}
            </div>
          </div>

          {/* Group 2: Territorial Geometry */}
          <div className="whatif-control-card">
            <div className="whatif-control-header">
              <span className="whatif-control-label">Operating Radius</span>
              <span className="whatif-control-val">{radius} km</span>
            </div>
            <input
              type="range"
              className="whatif-slider"
              min={MIN_RADIUS_KM}
              max={MAX_RADIUS_KM}
              step={1}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
            <div className="whatif-range-labels">
              <span>{MIN_RADIUS_KM} km</span>
              <span>Base: {Math.round(defaultRadiusKm)} km</span>
              <span>{MAX_RADIUS_KM} km</span>
            </div>
          </div>

          {/* Group 3: Spacing & Geometry */}
          <div className="whatif-control-card">
            <div className="whatif-control-header">
              <span className="whatif-control-label">Minimum Spacing</span>
              <span className="whatif-control-val">{spacing.toFixed(1)} km</span>
            </div>
            <input
              type="range"
              className="whatif-slider"
              min={MIN_SPACING_KM}
              max={MAX_SPACING_KM}
              step={0.5}
              value={spacing}
              onChange={(e) => setSpacing(Number(e.target.value))}
            />
            <div className="whatif-range-labels">
              <span>0.5 km (Clustered)</span>
              <span>2.0 km (Default)</span>
              <span>5.0 km (Dispersed)</span>
            </div>
          </div>

          {/* Group 4: SLA Response Target */}
          <div className="whatif-control-card">
            <div className="whatif-control-header">
              <span className="whatif-control-label">Max Response SLA</span>
              <span className="whatif-control-val">{maxResponseMinutes} min</span>
            </div>
            <div className="whatif-pill-group">
              <button
                type="button"
                className={`whatif-pill-btn ${maxResponseMinutes === 15 ? 'active' : ''}`}
                onClick={() => setMaxResponseMinutes(15)}
              >
                15 min (Strict)
              </button>
              <button
                type="button"
                className={`whatif-pill-btn ${maxResponseMinutes === 20 ? 'active' : ''}`}
                onClick={() => setMaxResponseMinutes(20)}
              >
                20 min (Standard)
              </button>
              <button
                type="button"
                className={`whatif-pill-btn ${maxResponseMinutes === 25 ? 'active' : ''}`}
                onClick={() => setMaxResponseMinutes(25)}
              >
                25 min (Extended)
              </button>
            </div>
            <div className="whatif-control-note">
              Target hour: <strong>{formatHour(targetHour)}</strong>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="whatif-action-bar">
          <div className="whatif-action-left">
            <button
              type="button"
              className="whatif-run-btn"
              onClick={handleRun}
              disabled={disabled || running}
              aria-busy={running}
            >
              <Play className="w-4 h-4 fill-current" />
              {running ? 'Running Simulation…' : 'Run Scenario Simulation'}
            </button>
            <button
              type="button"
              className="whatif-reset-btn"
              onClick={handleReset}
              disabled={running}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Parameters
            </button>
          </div>

          {simulation && onDiscard && (
            <button
              type="button"
              className="whatif-discard-btn"
              onClick={onDiscard}
            >
              Discard & Return to Live
            </button>
          )}
        </div>

        {/* Side-by-Side Comparison Section */}
        {simulation && (
          <div className="whatif-results-section">
            <div className="whatif-results-header">
              <div>
                <h4 className="whatif-results-title">Scenario Impact vs Live Operations</h4>
                <p className="whatif-results-subtitle">
                  Comparing current live deployment against simulated scenario ({simulation.parameters.num_ambulances} units,{' '}
                  {simulation.parameters.operating_radius_km} km radius, {simulation.parameters.min_spacing_km} km spacing)
                </p>
              </div>
              <div className="whatif-results-meta">
                <span className="whatif-badge-sim">SIMULATION ACTIVE</span>
              </div>
            </div>

            <div className="whatif-comparison-table-wrapper">
              <table className="whatif-comparison-table">
                <thead>
                  <tr>
                    <th>Performance Metric</th>
                    <th>Live Plan</th>
                    <th>Simulated Scenario</th>
                    <th>Net Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Avg Response Time */}
                  <tr>
                    <td>
                      <div className="whatif-metric-name">Average Response Time</div>
                      <div className="whatif-metric-sub">City-wide incident demand weighted</div>
                    </td>
                    <td className="whatif-val-live">
                      {liveAvgTime !== null ? `${liveAvgTime.toFixed(1)} min` : '—'}
                    </td>
                    <td className="whatif-val-sim">
                      {simAvgTime !== null ? `${simAvgTime.toFixed(1)} min` : '—'}
                    </td>
                    <td>
                      {timeDelta !== null ? (
                        <span
                          className={`whatif-delta-pill ${
                            timeDelta < 0 ? 'delta-good' : timeDelta > 0 ? 'delta-bad' : 'delta-neutral'
                          }`}
                        >
                          {timeDelta < 0 ? (
                            <>
                              <TrendingDown className="w-3 h-3" /> {Math.abs(timeDelta)} min faster
                            </>
                          ) : timeDelta > 0 ? (
                            <>
                              <TrendingUp className="w-3 h-3" /> +{timeDelta} min slower
                            </>
                          ) : (
                            'No change'
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>

                  {/* 15-Min Demand Coverage */}
                  <tr>
                    <td>
                      <div className="whatif-metric-name">15-Min Demand Coverage</div>
                      <div className="whatif-metric-sub">Percentage of forecasted calls within 15 min</div>
                    </td>
                    <td className="whatif-val-live">
                      {liveCoverage15 !== null ? `${Math.round(liveCoverage15)}%` : '—'}
                    </td>
                    <td className="whatif-val-sim">
                      {simCoverage15 !== null ? `${Math.round(simCoverage15)}%` : '—'}
                    </td>
                    <td>
                      {cov15Delta !== null ? (
                        <span
                          className={`whatif-delta-pill ${
                            cov15Delta > 0 ? 'delta-good' : cov15Delta < 0 ? 'delta-bad' : 'delta-neutral'
                          }`}
                        >
                          {cov15Delta > 0 ? (
                            <>
                              <TrendingUp className="w-3 h-3" /> +{cov15Delta}% coverage
                            </>
                          ) : cov15Delta < 0 ? (
                            <>
                              <TrendingDown className="w-3 h-3" /> {cov15Delta}% coverage
                            </>
                          ) : (
                            'No change'
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>

                  {/* 20-Min Ward Reach */}
                  <tr>
                    <td>
                      <div className="whatif-metric-name">Full City Ward Reach</div>
                      <div className="whatif-metric-sub">Wards reachable under 20 minutes</div>
                    </td>
                    <td className="whatif-val-live">
                      {liveWards20 ? `${liveWards20.after} / ${liveWards20.total} wards` : '—'}
                    </td>
                    <td className="whatif-val-sim">
                      {simWards20 ? `${simWards20.after} / ${simWards20.total} wards` : '—'}
                    </td>
                    <td>
                      {liveWards20 && simWards20 ? (
                        <span
                          className={`whatif-delta-pill ${
                            simWards20.after > liveWards20.after
                              ? 'delta-good'
                              : simWards20.after < liveWards20.after
                              ? 'delta-bad'
                              : 'delta-neutral'
                          }`}
                        >
                          {simWards20.after - liveWards20.after > 0
                            ? `+${simWards20.after - liveWards20.after} wards`
                            : simWards20.after - liveWards20.after < 0
                            ? `${simWards20.after - liveWards20.after} wards`
                            : 'Identical reach'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>

                  {/* Worst High-Risk Ward */}
                  <tr>
                    <td>
                      <div className="whatif-metric-name">Worst High-Risk Ward</div>
                      <div className="whatif-metric-sub">Longest response time among high-demand areas</div>
                    </td>
                    <td className="whatif-val-live">
                      {liveWorst ? (
                        <span>
                          Ward <strong>{liveWorst.ward_code}</strong> ({liveWorst.after_min?.toFixed(1) ?? '—'} min)
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whatif-val-sim">
                      {simWorst ? (
                        <span>
                          Ward <strong>{simWorst.ward_code}</strong> ({simWorst.after_min?.toFixed(1) ?? '—'} min)
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {liveWorst?.after_min != null && simWorst?.after_min != null ? (
                        <span
                          className={`whatif-delta-pill ${
                            simWorst.after_min < liveWorst.after_min
                              ? 'delta-good'
                              : simWorst.after_min > liveWorst.after_min
                              ? 'delta-bad'
                              : 'delta-neutral'
                          }`}
                        >
                          {(simWorst.after_min - liveWorst.after_min).toFixed(1)} min
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>

                  {/* Coverage Guaranteed SLA */}
                  <tr>
                    <td>
                      <div className="whatif-metric-name">Coverage Guaranteed SLA</div>
                      <div className="whatif-metric-sub">Every coverable ward reached within time cap</div>
                    </td>
                    <td className="whatif-val-live">
                      {liveRun ? (
                        liveRun.coverage_guaranteed ? (
                          <span className="whatif-status-badge status-good">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Guaranteed
                          </span>
                        ) : (
                          <span className="whatif-status-badge status-warn">
                            <AlertTriangle className="w-3.5 h-3.5" /> Deficit
                          </span>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whatif-val-sim">
                      {simulation.coverage_guaranteed ? (
                        <span className="whatif-status-badge status-good">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Guaranteed
                        </span>
                      ) : (
                        <span className="whatif-status-badge status-warn">
                          <AlertTriangle className="w-3.5 h-3.5" /> Deficit
                        </span>
                      )}
                    </td>
                    <td>
                      {simulation.coverage_guaranteed ? (
                        <span className="text-emerald-700 text-xs font-semibold">100% SLA Satisfied</span>
                      ) : (
                        <span className="text-rose-700 text-xs font-semibold">
                          SLA Breached ({simulation.uncovered_wards.length} Ward{simulation.uncovered_wards.length > 1 ? 's' : ''})
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Uncovered Wards */}
                  <tr>
                    <td>
                      <div className="whatif-metric-name">Uncovered Wards</div>
                      <div className="whatif-metric-sub">Wards exceeding maximum response target</div>
                    </td>
                    <td className="whatif-val-live">
                      {liveRun ? formatWards(liveRun.uncovered_wards) : '—'}
                    </td>
                    <td className="whatif-val-sim">
                      {formatWards(simulation.uncovered_wards)}
                    </td>
                    <td>
                      {simulation.uncovered_wards.length === 0 ? (
                        <span className="text-emerald-700 text-xs font-medium">Full territorial safety</span>
                      ) : (
                        <span className="text-rose-700 text-xs font-medium">Needs staging adjustment</span>
                      )}
                    </td>
                  </tr>

                  {/* Total Optimization Score */}
                  <tr>
                    <td>
                      <div className="whatif-metric-name">Optimization Objective Score</div>
                      <div className="whatif-metric-sub">Cumulative demand weight served</div>
                    </td>
                    <td className="whatif-val-live">
                      {liveRun ? liveRun.total_weighted_score.toFixed(2) : '—'}
                    </td>
                    <td className="whatif-val-sim font-semibold">
                      {simulation.total_weighted_score.toFixed(2)}
                    </td>
                    <td>
                      {liveRun && (
                        <span
                          className={`whatif-delta-pill ${
                            simulation.total_weighted_score >= liveRun.total_weighted_score
                              ? 'delta-good'
                              : 'delta-bad'
                          }`}
                        >
                          {simulation.total_weighted_score - liveRun.total_weighted_score >= 0 ? '+' : ''}
                          {(simulation.total_weighted_score - liveRun.total_weighted_score).toFixed(2)} pts
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
