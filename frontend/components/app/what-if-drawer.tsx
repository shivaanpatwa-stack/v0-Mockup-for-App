'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Minus, Plus, RotateCcw, Save, X } from 'lucide-react'
import { DEFAULT_SPACING_KM, DEFAULT_TARGET_MIN, useApp } from '@/lib/app-state'
import { ApiError, getCandidates, saveScenario, simulateScenario, type Candidate, type ScenarioRequest, type ScenarioResult } from '@/lib/api'
import { hourLabel, num } from '@/lib/format'
import { WARD_NAMES } from '@/lib/ward-names'
import { isTyping } from '@/components/app/shell'

type Knobs = {
  hour: number
  units: number
  radiusKm: number
  spacingKm: number
  targetMin: number
  demand: number
  demandWards: string[]
  traffic: number
  closed: string[]
}

const WARDS = Object.keys(WARD_NAMES)

type Preset = { id: string; label: string; detail: string; apply: (k: Knobs, inService: number) => Knobs }

/** Assumptions, not data: each preset only sets the knobs, and the tooltip says exactly how. */
export const PRESETS: Preset[] = [
  {
    id: 'monsoon',
    label: 'Monsoon evening',
    detail: 'Assumes 19:00, travel times 40% slower and predicted demand 15% higher in every ward.',
    apply: (k) => ({ ...k, hour: 19, traffic: 1.4, demand: 1.15, demandWards: [] }),
  },
  {
    id: 'rush',
    label: 'Rush hour',
    detail: 'Assumes 18:00 and travel times 25% slower. Demand as predicted.',
    apply: (k) => ({ ...k, hour: 18, traffic: 1.25, demand: 1, demandWards: [] }),
  },
  {
    id: 'festival',
    label: 'Festival night',
    detail: 'Assumes 21:00, predicted demand 40% higher in wards D, G/N and G/S (Girgaon, Dadar and Worli seafronts) and travel times 20% slower.',
    apply: (k) => ({ ...k, hour: 21, demand: 1.4, demandWards: ['D', 'G/N', 'G/S'], traffic: 1.2 }),
  },
  {
    id: 'down2',
    label: '2 units down',
    detail: 'Assumes two fewer units in service than now (at least one stays). Everything else unchanged.',
    apply: (k, n) => ({ ...k, units: Math.max(1, n - 2) }),
  },
]

export function toRequest(k: Knobs): ScenarioRequest {
  return {
    hour: k.hour,
    num_ambulances: k.units,
    operating_radius_km: k.radiusKm,
    min_spacing_km: k.spacingKm,
    max_response_minutes: k.targetMin,
    demand_multiplier: k.demand,
    demand_wards: k.demandWards.length ? k.demandWards : null,
    travel_time_multiplier: k.traffic,
    closed_candidates: k.closed,
  }
}

function fromRequest(r: ScenarioRequest, base: Knobs): Knobs {
  return {
    hour: r.hour,
    units: r.num_ambulances ?? base.units,
    radiusKm: r.operating_radius_km ?? base.radiusKm,
    spacingKm: r.min_spacing_km ?? base.spacingKm,
    targetMin: r.max_response_minutes ?? base.targetMin,
    demand: r.demand_multiplier ?? 1,
    demandWards: r.demand_wards ?? [],
    traffic: r.travel_time_multiplier ?? 1,
    closed: r.closed_candidates ?? [],
  }
}

function trafficLabel(m: number) {
  if (m <= 1.02) return 'Clear roads'
  if (m < 1.3) return 'Busy'
  if (m < 1.6) return 'Heavy rain'
  return 'Monsoon gridlock'
}

export default function WhatIfDrawer() {
  const {
    hospital, inService, hour, setHour, plan, spacingKm, targetMin, setWhatIfOpen, setScenario, scenario,
    setComparing, comparing, previewScenario, pushToast, pendingScenarioRequest, setPendingScenarioRequest,
  } = useApp()

  const base: Knobs = useMemo(
    () => ({
      hour,
      units: Math.max(1, inService.length),
      radiusKm: hospital?.operating_radius_km ?? 15,
      spacingKm: spacingKm ?? DEFAULT_SPACING_KM,
      targetMin: targetMin ?? DEFAULT_TARGET_MIN,
      demand: 1,
      demandWards: [],
      traffic: 1,
      closed: [],
    }),
    // Base is taken when the drawer opens; later hour changes come from the knobs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hospital, inService.length],
  )
  const [knobs, setKnobs] = useState<Knobs>(() => (pendingScenarioRequest ? fromRequest(pendingScenarioRequest, base) : base))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    if (pendingScenarioRequest) setPendingScenarioRequest(null)
  }, [pendingScenarioRequest, setPendingScenarioRequest])

  // Keep the map's hour in step with the scenario hour.
  useEffect(() => {
    if (knobs.hour !== hour) setHour(knobs.hour)
  }, [knobs.hour, hour, setHour])

  // Live readout: recalculate shortly after the knobs stop moving; only the latest answer counts.
  useEffect(() => {
    if (!hospital || inService.length === 0) return
    const id = ++seq.current
    setPending(true)
    const t = setTimeout(async () => {
      try {
        const result = await simulateScenario(toRequest(knobs))
        if (id === seq.current) {
          setScenario(result)
          setError(null)
        }
      } catch (err) {
        if (id === seq.current) setError(err instanceof ApiError ? err.message : "Couldn't reach the planning service.")
      } finally {
        if (id === seq.current) setPending(false)
      }
    }, 600)
    return () => clearTimeout(t)
  }, [knobs, hospital, inService.length, setScenario])

  // Hold Space to compare with the current plan; Esc closes the drawer.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || document.querySelector('dialog[open]')) return
      if (e.code === 'Space') {
        e.preventDefault()
        setComparing(true)
      }
      if (e.key === 'Escape') setWhatIfOpen(false)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setComparing(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      setComparing(false)
    }
  }, [setComparing, setWhatIfOpen])

  useEffect(() => () => setScenario(null), [setScenario])

  const loadCandidates = useCallback(() => {
    if (candidates) return
    getCandidates(knobs.radiusKm)
      .then(setCandidates)
      .catch(() => setCandidates([]))
  }, [candidates, knobs.radiusKm])

  const set = <K extends keyof Knobs>(key: K, value: Knobs[K]) => setKnobs((k) => ({ ...k, [key]: value }))
  const synthetic = scenario?.parameters.synthetic_ambulances ?? Math.max(0, knobs.units - inService.length)
  const now = plan?.kpis
  const next = scenario?.kpis

  const useAsPlan = () => {
    if (!scenario) return
    previewScenario(toRequest(knobs), scenario as ScenarioResult)
    setWhatIfOpen(false)
  }

  const save = async () => {
    const label = name.trim()
    if (!label) return
    try {
      await saveScenario(label, toRequest(knobs), {
        avg_response_min: next?.avg_response_min.after ?? null,
        reach_20_pct: next?.demand_within_20_min_pct.after ?? null,
        reach_15_pct: next?.demand_within_20_min_pct.after ?? null,
        wards_covered: next?.wards_covered_20_min.after ?? null,
      })
      pushToast({ text: `Saved "${label}" to Scenarios` })
      setNaming(false)
      setName('')
    } catch (err) {
      pushToast({ text: `Couldn't save: ${(err as Error).message}`, tone: 'critical' })
    }
  }

  return (
    <section className="whatif" aria-labelledby="whatif-title">
      <div className="whatif-col">
        <h2 id="whatif-title">What if…</h2>
        <p className="muted" style={{ fontSize: 12 }}>Assumption presets. Each one only sets the knobs.</p>
        <div className="whatif-presets">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="chip" title={p.detail} aria-description={p.detail} onClick={() => setKnobs((k) => p.apply(k, inService.length))}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="knob" style={{ marginTop: 4 }}>
          <span className="knob-head">
            Close a staging position <output>{knobs.closed.length || 'none'}</output>
          </span>
          <select
            className="select"
            value=""
            onFocus={loadCandidates}
            onChange={(e) => e.target.value && set('closed', [...knobs.closed, e.target.value])}
          >
            <option value="">{candidates === null ? 'Choose a position…' : candidates.length ? 'Choose a position…' : 'None within range'}</option>
            {(candidates ?? [])
              .filter((c) => !knobs.closed.includes(c.candidate_id))
              .map((c) => (
                <option key={c.candidate_id} value={c.candidate_id}>
                  {c.name ?? c.candidate_id} {c.ward_code ? `(${c.ward_code})` : ''}
                </option>
              ))}
          </select>
        </label>
        {knobs.closed.length > 0 && (
          <div className="ward-picker">
            {knobs.closed.map((id) => (
              <button key={id} type="button" className="chip" onClick={() => set('closed', knobs.closed.filter((c) => c !== id))} aria-label={`Reopen ${candidates?.find((c) => c.candidate_id === id)?.name ?? id}`}>
                {candidates?.find((c) => c.candidate_id === id)?.name ?? id} <X size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="whatif-col">
        <div className="whatif-grid">
          <div className="knob">
            <span className="knob-head" id="k-units">Ambulances available <output>{inService.length} to {knobs.units} units</output></span>
            <div className="stepper" role="group" aria-labelledby="k-units">
              <button type="button" className="btn btn-icon btn-sm" aria-label="One fewer unit" onClick={() => set('units', Math.max(1, knobs.units - 1))}><Minus aria-hidden="true" /></button>
              <output className="mono" aria-live="polite">{knobs.units}</output>
              <button type="button" className="btn btn-icon btn-sm" aria-label="One more unit" onClick={() => set('units', Math.min(20, knobs.units + 1))}><Plus aria-hidden="true" /></button>
            </div>
            {synthetic > 0 && <span className="muted">Includes {synthetic} simulated BLS {synthetic === 1 ? 'unit' : 'units'}</span>}
          </div>
          <label className="knob">
            <span className="knob-head">Time <output>{hourLabel(knobs.hour)}</output></span>
            <input className="range" type="range" min={0} max={23} value={knobs.hour} onChange={(e) => set('hour', Number(e.target.value))} aria-valuetext={hourLabel(knobs.hour)} />
            <span className="knob-ends"><span>00:00</span><span>23:00</span></span>
          </label>
          <label className="knob">
            <span className="knob-head">Demand surge <output>{knobs.demand === 1 ? 'as predicted' : `${knobs.demand > 1 ? '+' : ''}${Math.round((knobs.demand - 1) * 100)}% calls`}</output></span>
            <input className="range" type="range" min={0.7} max={1.6} step={0.05} value={knobs.demand} onChange={(e) => set('demand', Number(e.target.value))} aria-valuetext={`${Math.round((knobs.demand - 1) * 100)} percent`} />
            <span className="knob-ends"><span>-30%</span><span>+60%</span></span>
          </label>
          <label className="knob">
            <span className="knob-head">Road speed <output>{trafficLabel(knobs.traffic)}{knobs.traffic > 1 ? ` (+${Math.round((knobs.traffic - 1) * 100)}%)` : ''}</output></span>
            <input className="range" type="range" min={1} max={2} step={0.05} value={knobs.traffic} onChange={(e) => set('traffic', Number(e.target.value))} aria-valuetext={trafficLabel(knobs.traffic)} />
            <span className="knob-ends"><span>Clear roads</span><span>Monsoon gridlock</span></span>
          </label>
          <div className="knob">
            <span className="knob-head" id="k-target">Target response</span>
            <div className="segmented" role="radiogroup" aria-labelledby="k-target">
              {[15, 20, 25].map((m) => (
                <button key={m} type="button" role="radio" aria-checked={knobs.targetMin === m} onClick={() => set('targetMin', m)}>{m} min</button>
              ))}
            </div>
          </div>
          <label className="knob">
            <span className="knob-head">Operating radius <output>{knobs.radiusKm} km</output></span>
            <input className="range" type="range" min={5} max={30} step={1} value={knobs.radiusKm} onChange={(e) => set('radiusKm', Number(e.target.value))} />
            <span className="knob-ends"><span>5 km</span><span>30 km</span></span>
          </label>
          <label className="knob">
            <span className="knob-head">Spacing between units <output>{knobs.spacingKm.toFixed(1)} km</output></span>
            <input className="range" type="range" min={0.5} max={5} step={0.5} value={knobs.spacingKm} onChange={(e) => set('spacingKm', Number(e.target.value))} />
            <span className="knob-ends"><span>Clustered</span><span>Spread out</span></span>
          </label>
        </div>
        {knobs.demand !== 1 && (
          <div>
            <span className="muted" style={{ fontSize: 12 }}>Surge applies to: {knobs.demandWards.length ? knobs.demandWards.join(', ') : 'every ward'}</span>
            <div className="ward-picker" role="group" aria-label="Wards with the demand surge">
              {WARDS.map((w) => (
                <button key={w} type="button" className="chip" aria-pressed={knobs.demandWards.includes(w)} title={WARD_NAMES[w]}
                  onClick={() => set('demandWards', knobs.demandWards.includes(w) ? knobs.demandWards.filter((x) => x !== w) : [...knobs.demandWards, w])}>
                  {w}
                </button>
              ))}
            </div>
            {knobs.demandWards.length === 0 && <span className="muted" style={{ fontSize: 12 }}>A surge in every ward scales all wards equally, so units won&apos;t move. Pick wards to see where they would go.</span>}
          </div>
        )}
      </div>

      <div className="whatif-col">
        <h2>Now to scenario {pending && <Loader2 className="spin" size={13} aria-label="Calculating" style={{ verticalAlign: '-2px' }} />}</h2>
        <div className="readout" aria-live="polite">
          <div className="readout-row"><span>Avg response</span><span className="mono">{num(now?.avg_response_min.after)} to {num(next?.avg_response_min.after)} min</span></div>
          <div className="readout-row"><span>Demand reachable in 20 min</span><span className="mono">{num(now?.demand_within_20_min_pct.after, 0)}% to {num(next?.demand_within_20_min_pct.after, 0)}%</span></div>
          <div className="readout-row"><span>Wards within 20 min</span><span className="mono">{now?.wards_covered_20_min.after ?? '–'} to {next?.wards_covered_20_min.after ?? '–'}</span></div>
          {scenario && scenario.assumptions.length > 0 && (
            <ul className="assumption-list">{scenario.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          )}
          {error && <p className="status status-critical" role="alert">{error}</p>}
        </div>
        {naming ? (
          <form className="readout-actions" onSubmit={(e) => { e.preventDefault(); save() }}>
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ganeshotsav, 2 units down" aria-label="Scenario name" maxLength={80} />
            <button type="submit" className="btn btn-sm" disabled={!name.trim()}>Save</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNaming(false)}>Cancel</button>
          </form>
        ) : (
          <div className="readout-actions">
            <button type="button" className="btn btn-sm" disabled={!scenario || pending || synthetic > 0} onClick={useAsPlan}
              title={synthetic > 0 ? 'Uses simulated units, so it can only be a preview' : undefined}>Use as staging plan</button>
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={comparing}
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
            >
              Hold to compare <kbd aria-hidden="true">Space</kbd>
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setNaming(true)} disabled={!scenario}><Save aria-hidden="true" /> Save</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setKnobs(base)}><RotateCcw aria-hidden="true" /> Reset</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setWhatIfOpen(false)}><X aria-hidden="true" /> Close</button>
          </div>
        )}
        {comparing && <p className="muted" style={{ fontSize: 12 }}>Showing the current plan</p>}
      </div>
    </section>
  )
}
