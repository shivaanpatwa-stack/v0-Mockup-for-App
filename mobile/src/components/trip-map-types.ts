import type { UnitType } from '@/lib/api'

export type Coordinate = { lat: number; lng: number }
export type AssignedPoint = Coordinate & { label: string; type: UnitType }

export type TripMapProps = {
  hospital: Coordinate | null
  assigned: AssignedPoint | null
  /** Height covered at the bottom (the card), so the markers are framed in the visible part. */
  bottomInset: number
  /** Bump this to re-fit the markers (the Recenter button). */
  recenterToken: number
}
