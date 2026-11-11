import type { UnitType } from '@/lib/api'

export type Coordinate = { lat: number; lng: number }
/** The base. `name` is what its tap callout says. */
export type BasePoint = Coordinate & { name?: string }
/** The unit's staging position: `label` is the short text inside the marker, `name` the place for its callout. */
export type AssignedPoint = Coordinate & { label: string; type: UnitType; name?: string }

export type TripMapProps = {
  hospital: BasePoint | null
  assigned: AssignedPoint | null
  /** Height covered at the bottom (the card), so the markers are framed in the visible part. */
  bottomInset: number
  /** Bump this to re-fit the markers (the Recenter button). */
  recenterToken: number
}
