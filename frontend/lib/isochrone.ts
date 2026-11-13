import type { FeatureCollection } from 'geojson'

export type TravelTimeMatrix = Record<string, Record<string, number>>

let cachedMatrix: TravelTimeMatrix | null = null

/**
 * Loads the travel time matrix (minutes from each candidate to each ward).
 */
export async function loadTravelTimeMatrix(): Promise<TravelTimeMatrix> {
  if (cachedMatrix) return cachedMatrix
  try {
    const res = await fetch('/data/travel_time_matrix.json')
    if (res.ok) {
      cachedMatrix = await res.json()
      return cachedMatrix!
    }
  } catch (err) {
    console.error('Failed to load travel time matrix', err)
  }
  return {}
}

/**
 * Returns the set of ward codes reachable within `maxMinutes` (default 20 min)
 * from any of the active candidate positions.
 */
export function getIsochroneWards(
  matrix: TravelTimeMatrix | null,
  candidateIds: string[],
  maxMinutes: number = 20.0
): Set<string> {
  const reached = new Set<string>()
  if (!matrix || candidateIds.length === 0) return reached

  // Normalize candidate IDs (e.g. CAND-01 -> CAND_0001 or CAND_0048)
  const normalizedIds = candidateIds.map((id) => {
    const cleaned = id.trim()
    const match = cleaned.match(/^CAND[-_]?(\d+)$/i)
    if (match) {
      const num = parseInt(match[1], 10)
      return `CAND_${num.toString().padStart(4, '0')}`
    }
    return cleaned
  })

  // Get all ward codes present in matrix
  const anyRow = Object.values(matrix)[0]
  const wardCodes = anyRow ? Object.keys(anyRow) : []

  for (const ward of wardCodes) {
    let minTime = Infinity
    for (const cid of normalizedIds) {
      const row = matrix[cid]
      if (row && row[ward] !== undefined) {
        if (row[ward] < minTime) minTime = row[ward]
      }
    }
    if (minTime <= maxMinutes) {
      reached.add(ward)
    }
  }

  return reached
}

/**
 * Filters the zones GeoJSON to return only features within the isochrone reach.
 */
export function filterIsochroneGeoJson(
  zones: FeatureCollection | null,
  isochroneWards: Set<string>
): FeatureCollection | null {
  if (!zones || isochroneWards.size === 0) return null
  return {
    ...zones,
    features: zones.features.filter((f) => {
      const code = f.properties?.ward_code
      return code && isochroneWards.has(code)
    }),
  }
}