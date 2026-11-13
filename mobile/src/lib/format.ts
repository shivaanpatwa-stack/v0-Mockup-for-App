/**
 * Formatting and calculation utilities for the AmbulanceIQ mobile client.
 */

/**
 * Format a raw hospital name for professional institutional display.
 * e.g. "lilavati" -> "Lilavati Hospital"
 * e.g. "hinduja healthcare" -> "Hinduja Healthcare Hospital"
 * e.g. "KEM Hospital" -> "KEM Hospital"
 */
export function formatHospitalName(name?: string | null): string {
  if (!name || !name.trim()) return 'Hospital Base'
  const trimmed = name.trim()

  // Standardize capitalization for each word
  const words = trimmed.split(/\s+/).map((w) => {
    // Preserve uppercase acronyms like KEM, BYL, Nair, etc.
    if (w.length <= 4 && w === w.toUpperCase()) return w
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  })
  const capitalized = words.join(' ')

  // If the institution type is already included, return as is
  if (/hospital|clinic|centre|center|nursing|institute/i.test(capitalized)) {
    return capitalized
  }

  return `${capitalized} Hospital`
}

/**
 * Estimate road-network distance and ETA based on Mumbai urban EMS driving conditions.
 * - Detour index (winding factor): ~1.32 to 1.35x of straight-line distance.
 * - EMS urban speed: ~20 km/h in mixed Mumbai traffic (~3.0 min per road km).
 */
export function estimateRoadTravel(haversineDistanceKm: number): {
  roadKm: number
  roadKmText: string
  etaMinutes: number
  etaText: string
} {
  const roadKm = Math.round(haversineDistanceKm * 1.33 * 10) / 10
  const etaMinutes = Math.max(3, Math.round(roadKm * 2.8))

  return {
    roadKm,
    roadKmText: `${roadKm.toFixed(1)} km by road`,
    etaMinutes,
    etaText: etaMinutes < 60 ? `~${etaMinutes} min` : `~${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m`,
  }
}

