import { WARD_HOUR_RISK_SCORES } from '@/lib/ward-risk-data'

export type DemandLevel = 'low' | 'moderate' | 'high' | 'peak'
export type HourDemand = { hour: number; total: number; heightPct: number; level: DemandLevel }

/**
 * City-wide demand per hour: the sum of every ward's risk score for that hour, from the same
 * ward_hour_risk_scores data the map and the optimizer use (simulated, see DATA_LABEL).
 * heightPct maps the quietest hour to 20% and the busiest to 100%.
 */
export const HOURLY_DEMAND: HourDemand[] = (() => {
  const totals = Array.from({ length: 24 }, (_, hour) =>
    Object.values(WARD_HOUR_RISK_SCORES[hour] ?? {}).reduce((sum, score) => sum + score, 0),
  )
  const min = Math.min(...totals)
  const max = Math.max(...totals)
  return totals.map((total, hour) => {
    const heightPct = max === min ? 100 : Math.round(20 + (80 * (total - min)) / (max - min))
    const level: DemandLevel = heightPct === 100 ? 'peak' : heightPct >= 80 ? 'high' : heightPct < 40 ? 'low' : 'moderate'
    return { hour, total: Math.round(total * 100) / 100, heightPct, level }
  })
})()
