// Shared by the map (Leaflet) and the legend (plain React). No Leaflet import here, so the legend
// can be rendered by the page without pulling Leaflet into server rendering.

/** risk_score bands: below LOW_MAX is low, LOW_MAX..HIGH_MIN is medium, above HIGH_MIN is high. */
export const LOW_MAX = 0.2
export const HIGH_MIN = 0.46

export type DemandLevel = 'high' | 'medium' | 'low'

export function demandLevel(score: number): DemandLevel {
  if (score < LOW_MAX) return 'low'
  if (score <= HIGH_MIN) return 'medium'
  return 'high'
}

export const DEMAND_LABEL: Record<DemandLevel, string> = { high: 'High', medium: 'Medium', low: 'Low' }

type MapColor = 'navy' | 'high' | 'medium' | 'low' | 'border' | 'ink' | 'muted' | 'no-data'

/**
 * The value of the CSS variable --map-{name} from globals.css, the single source of the map palette.
 * Leaflet writes colors into SVG attributes, which can't use var(), so they are read at draw time.
 */
export function mapColor(name: MapColor): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(`--map-${name}`).trim()
}
