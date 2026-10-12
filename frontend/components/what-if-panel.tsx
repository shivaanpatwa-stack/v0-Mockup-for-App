'use client'

import { useEffect, useState } from 'react'
import type { OptimizeResult, SimulationResult } from '@/lib/api'

const MIN_FLEET = 1
const MAX_FLEET = 20
const MIN_RADIUS_KM = 5
const MAX_RADIUS_KM = 30

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value))

type WhatIfPanelProps = {
  /** Real defaults: ambulances in service and the hospital's radius. */
  defaultFleet: number
  defaultRadiusKm: number
  running: boolean
  disabled: boolean
  simulation: SimulationResult | null
  liveRun: OptimizeResult | null
  onRun: (params: { numAmbulances: number; radiusKm: number }) => void
}

const formatWards = (wards: string[]) => (wards.length ? wards.join(', ') : 'none')

export default function WhatIfPanel({
  defaultFleet,
  defaultRadiusKm,
  running,
  disabled,
  simulation,
  liveRun,
  onRun,
}: WhatIfPanelProps) {
  const initialFleet = clamp(defaultFleet, MIN_FLEET, MAX_FLEET)
  const initialRadius = clamp(Math.round(defaultRadiusKm), MIN_RADIUS_KM, MAX_RADIUS_KM)
  const [fleet, setFleet] = useState(String(initialFleet))
  const [radius, setRadius] = useState(initialRadius)

  // Follow the real fleet and radius when they change (e.g. after editing the fleet).
  useEffect(() => setFleet(String(initialFleet)), [initialFleet])
  useEffect(() => setRadius(initialRadius), [initialRadius])

  const fleetCount = Number(fleet)
  const fleetValid = Number.isInteger(fleetCount) && fleetCount >= MIN_FLEET && fleetCount <= MAX_FLEET

  return (
    <details className="whatif-panel">
      <summary>What-if simulator</summary>
      <div className="whatif-controls">
        <label>
          Fleet size
          <input
            className="number-input"
            type="number"
            min={MIN_FLEET}
            max={MAX_FLEET}
            step="1"
            value={fleet}
            onChange={(e) => setFleet(e.target.value)}
            aria-invalid={!fleetValid}
          />
        </label>
        <label className="range-label">
          Operating radius <strong>{radius} km</strong>
          <input
            type="range"
            min={MIN_RADIUS_KM}
            max={MAX_RADIUS_KM}
            step="1"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          onClick={() => onRun({ numAmbulances: fleetCount, radiusKm: radius })}
          disabled={disabled || running || !fleetValid}
          aria-busy={running}
        >
          {running ? 'Simulating…' : 'Run simulation'}
        </button>
      </div>
      {simulation && (
        <table className="whatif-compare">
          <thead>
            <tr>
              <th />
              <th>Live run</th>
              <th>Simulation ({simulation.parameters.num_ambulances} ambulances, {simulation.parameters.operating_radius_km} km)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total weighted score</td>
              <td>{liveRun ? liveRun.total_weighted_score.toFixed(2) : '—'}</td>
              <td>{simulation.total_weighted_score.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Coverage guaranteed</td>
              <td>{liveRun ? (liveRun.coverage_guaranteed ? 'Yes' : 'No') : '—'}</td>
              <td>{simulation.coverage_guaranteed ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
              <td>Uncovered wards</td>
              <td>{liveRun ? formatWards(liveRun.uncovered_wards) : '—'}</td>
              <td>{formatWards(simulation.uncovered_wards)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </details>
  )
}
