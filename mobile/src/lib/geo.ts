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

// High above 0.46, Medium from 0.20 to 0.46, otherwise Low.
export function demandLevel(score: number): DemandLevel {
  if (score > 0.46) return 'high'
  if (score >= 0.2) return 'medium'
  return 'low'
}
