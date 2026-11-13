import type { Coordinate } from '@/components/trip-map-types'

/**
 * Fetch a driving route from OSRM, or fall back to an interpolated curved road path.
 */
export async function fetchRoadRoute(
  origin: Coordinate,
  destination: Coordinate,
): Promise<Coordinate[]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)

    if (res.ok) {
      const json = await res.json()
      if (json.routes && json.routes.length > 0 && json.routes[0].geometry?.coordinates) {
        return json.routes[0].geometry.coordinates.map((c: [number, number]) => ({
          lat: c[1],
          lng: c[0],
        }))
      }
    }
  } catch {
    // Network or timeout: fall back cleanly to road path simulation
  }

  return generateSimulatedRoadPath(origin, destination)
}

/**
 * Generate a multi-point road path connecting start and end with realistic arterial road bends.
 */
export function generateSimulatedRoadPath(start: Coordinate, end: Coordinate): Coordinate[] {
  const points: Coordinate[] = [start]
  const steps = 6
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    // Subtle lateral deflection reflecting Mumbai north-south arterial routes (e.g. Western Express Highway / SV Road)
    const deflection = Math.sin(t * Math.PI) * 0.003
    const lat = start.lat + (end.lat - start.lat) * t
    const lng = start.lng + (end.lng - start.lng) * t + deflection
    points.push({ lat, lng })
  }
  points.push(end)
  return points
}

