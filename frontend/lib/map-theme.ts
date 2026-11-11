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
  high: '0.46 to 0.70',
  moderate: '0.20 to 0.46',
  low: '< 0.20',
}

/**
 * Intentional stone & terracotta choropleth theme:
 * - low: muted stone/sand (#AFA79A)
 * - moderate: warm taupe (#9B7E68)
 * - high: muted terracotta (#875E4C)
 * - very-high: deep terracotta/brown (#713C32)
 */
export const DEMAND_COLORS: Record<DemandLevel, string> = {
  'very-high': '#713C32',
  high: '#875E4C',
  moderate: '#9B7E68',
  low: '#AFA79A',
}

export const DEMAND_DESCRIPTION: Record<
  DemandLevel,
  { label: string; range: string; colorHex: string; tone: string }
> = {
  'very-high': { label: 'Very high', range: '> 0.70', colorHex: DEMAND_COLORS['very-high'], tone: 'Very high' },
  high: { label: 'High', range: '0.46 to 0.70', colorHex: DEMAND_COLORS.high, tone: 'High' },
  moderate: { label: 'Moderate', range: '0.20 to 0.46', colorHex: DEMAND_COLORS.moderate, tone: 'Moderate' },
  low: { label: 'Low', range: '< 0.20', colorHex: DEMAND_COLORS.low, tone: 'Low' },
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
  'very-high': '#713C32',
  high: '#875E4C',
  moderate: '#9B7E68',
  medium: '#9B7E68',
  low: '#AFA79A',
  border: '#000000', // Crisp black zone borders
  ink: '#1C1917',
  muted: '#78716C',
  'no-data': '#8A847A', // Muted stone neutral fallback
  surface: '#FAF7F2',
}

export function mapColor(name: MapColor): string {
  return MAP_HEX_COLORS[name] || '#0C4A6E'
}
