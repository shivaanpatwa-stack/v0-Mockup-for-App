'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { KpiStrip, LayerToggles, MapLegend, MovesPanel, RecalcControl, TimeScrubber } from '@/components/app/live-panels'
import WhatIfDrawer from '@/components/app/what-if-drawer'
import { movesFor, useApp } from '@/lib/app-state'
import type { OptimizeResult } from '@/lib/api'
import type { Ghost } from '@/components/app/live-map'

const LiveMap = dynamic(() => import('@/components/app/live-map'), {
  ssr: false,
  loading: () => <div className="empty" style={{ height: '100%' }}>Loading the map…</div>,
})

export default function LiveMapPage() {
  const app = useApp()
  const { plan, preview, scenario, whatIfOpen, comparing, hospital, fleet, hour, layers, showUncovered, focusWard } = app
  const [hot, setHot] = useState<string | null>(null)

  // What the map shows: hold-to-compare > open scenario > unapplied preview > current plan.
  const view = useMemo(() => {
    if (whatIfOpen && scenario && !comparing) return { result: scenario as OptimizeResult, scenario: true, hour: scenario.parameters.hour }
    if (preview && !comparing) return { result: preview.result as OptimizeResult, scenario: true, hour: preview.hour }
    return { result: plan, scenario: false, hour: comparing && plan ? plan.hour : hour }
  }, [whatIfOpen, scenario, comparing, preview, plan, hour])

  const ghosts = useMemo<Ghost[]>(() => {
    const r = view.result
    if (!r) return []
    if (view.scenario) {
      return movesFor(r.assignments, fleet, hospital, plan?.assignments)
        .filter((m) => m.from && m.km != null && m.km > 0.05)
        .map((m) => ({ callSign: m.callSign, from: m.from!, to: m.to }))
    }
    if (!hot) return []
    const m = movesFor(r.assignments, fleet, hospital).find((x) => x.callSign === hot)
    return m?.from && m.km && m.km > 0.05 ? [{ callSign: m.callSign, from: m.from, to: m.to }] : []
  }, [view, fleet, hospital, plan, hot])

  const uncovered = plan?.coverageKnown ? plan.uncovered_wards : []

  return (
    <div className="live">
      <h1 className="sr-only">Live map</h1>
      <KpiStrip kpis={plan?.kpis ?? null} coverageKnown={Boolean(plan?.coverageKnown)} uncovered={uncovered} max={plan?.max_response_minutes ?? 20} />
      <div className="live-body">
        <div className="map-wrap">
          <LiveMap
            hour={view.hour}
            hospital={hospital}
            units={view.result?.assignments ?? []}
            unitsAreScenario={view.scenario}
            ghosts={ghosts}
            reachFrom={view.result?.chosen_candidates ?? []}
            uncoveredWards={showUncovered ? uncovered : []}
            layers={layers}
            focusWard={focusWard}
            hotUnit={hot}
            onHoverUnit={setHot}
          />
          <RecalcControl />
          <LayerToggles />
          {!whatIfOpen && <MapLegend showUncovered={showUncovered && uncovered.length > 0} />}
          {!whatIfOpen && <TimeScrubber />}
          {whatIfOpen && <WhatIfDrawer />}
        </div>
        <MovesPanel hot={hot} onHover={setHot} />
      </div>
    </div>
  )
}
