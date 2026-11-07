import type { ScenarioRequest } from '@/lib/api'
import { hourLabel } from '@/lib/format'

/** One line describing what a scenario assumes, in plain words. */
export function describeScenario(p: ScenarioRequest): string {
  const parts = [hourLabel(p.hour)]
  if (p.num_ambulances) parts.push(`${p.num_ambulances} units`)
  if (p.travel_time_multiplier && p.travel_time_multiplier !== 1) parts.push(`travel ${Math.round((p.travel_time_multiplier - 1) * 100)}% slower`)
  if (p.demand_multiplier && p.demand_multiplier !== 1) {
    const pct = Math.round((p.demand_multiplier - 1) * 100)
    parts.push(`demand ${pct > 0 ? '+' : ''}${pct}%${p.demand_wards?.length ? ` in ${p.demand_wards.join(', ')}` : ''}`)
  }
  if (p.closed_candidates?.length) parts.push(`${p.closed_candidates.length} position(s) closed`)
  if (p.max_response_minutes) parts.push(`${p.max_response_minutes}-min target`)
  return parts.join(' · ')
}
