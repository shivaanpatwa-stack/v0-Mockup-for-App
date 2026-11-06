// Shared by the map (Leaflet) and the legend (plain React). No Leaflet import here, so the legend
// can be rendered by the page without pulling Leaflet into server rendering.

/** risk_score bands: below LOW_MAX is low, LOW_MAX..MODERATE_MAX is moderate, MODERATE_MAX..HIGH_MAX is high, above HIGH_MAX is very high. */
export const LOW_MAX = 0.2
export const MODERATE_MAX = 0.46
export const HIGH_MAX = 0.7

// Backwards-compatible alias
export const HIGH_MIN = MODERATE_MAX

export type DemandLevel = 'very-high' | 'high' | 'moderate' | 'low'

export function demandLevel(score: number): DemandLevel {
  if (score < LOW_MAX) return 'low'
  if (score <= MODERATE_MAX) return 'moderate'
  if (score <= HIGH_MAX) return 'high'
  return 'very-high'
}

export const DEMAND_LABEL: Record<DemandLevel, string> = {
  'very-high': 'Very High',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
}

export const DEMAND_RANGE: Record<DemandLevel, string> = {
  'very-high': '> 0.70',
  high: '0.46 – 0.70',
  moderate: '0.20 – 0.46',
  low: '< 0.20',
}

/**
 * Single-hue warm ramp: Sand -> Ochre / Light Terracotta -> Terracotta -> Deep Brick.
 * Principle: Warm tones = what the city needs (demand/risk), Blue/Navy = what you control (ambulances/coverage).
 * Completely color-blind safe, with zero clash against green KPI performance indicators.
 */
export const DEMAND_COLORS: Record<DemandLevel, string> = {
  'very-high': '#882414', // Deep Brick
  high: '#C45A3C',        // Terracotta
  moderate: '#DF9B6D',    // Ochre / Light Terracotta
  low: '#EEDEC5',         // Sand
}

export const DEMAND_DESCRIPTION: Record<
  DemandLevel,
  { label: string; range: string; colorHex: string; tone: string }
> = {
  'very-high': { label: 'Very High', range: '> 0.70', colorHex: '#882414', tone: 'Deep Brick' },
  high: { label: 'High', range: '0.46 – 0.70', colorHex: '#C45A3C', tone: 'Terracotta' },
  moderate: { label: 'Moderate', range: '0.20 – 0.46', colorHex: '#DF9B6D', tone: 'Ochre' },
  low: { label: 'Low', range: '< 0.20', colorHex: '#EEDEC5', tone: 'Sand' },
}

export type MapColor =
  | 'navy'
  | 'very-high'
  | 'high'
  | 'moderate'
  | 'medium'
  | 'low'
  | 'border'
  | 'ink'
  | 'muted'
  | 'no-data'
  | 'surface'

/**
 * Solid hex colors ensuring SVG attributes never fail or render empty strings.
 */
export const MAP_HEX_COLORS: Record<MapColor, string> = {
  navy: '#0C4A6E',
  'very-high': '#882414',
  high: '#C45A3C',
  moderate: '#DF9B6D',
  medium: '#DF9B6D',
  low: '#EEDEC5',
  border: '#FFFFFF', // Thin white borders
  ink: '#1C1917',
  muted: '#78716C',
  'no-data': '#E8DEC8', // Soft neutral sand fallback
  surface: '#FAF7F2',
}

export function mapColor(name: MapColor): string {
  return MAP_HEX_COLORS[name] || '#0C4A6E'
}
