import type { LatLngExpression } from 'leaflet'

const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim()

const cartoUrl = (style: string) =>
  `https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png${CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : ''}`

/** Basemap with labels baked in (location picker, and the dashboard's fallback). */
export const TILE_URL = cartoUrl('light_all')
/** Dashboard basemap without labels; TILE_URL_LABELS goes in a pane above the ward fills. */
export const TILE_URL_NO_LABELS = cartoUrl('light_nolabels')
export const TILE_URL_LABELS = cartoUrl('light_only_labels')

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

export const MUMBAI_CENTER: LatLngExpression = [19.076, 72.8777]
