const EARTH_RADIUS_KM = 6371.0088

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

export const formatKm = (km: number) => `${km.toFixed(1)} km`

export type DemandLevel = 'high' | 'medium' | 'low'

// Same thresholds as the web dashboard's choropleth: <0.33 low, 0.33-0.66 medium, >0.66 high.
export function demandLevel(score: number): DemandLevel {
  if (score > 0.66) return 'high'
  if (score >= 0.33) return 'medium'
  return 'low'
}
