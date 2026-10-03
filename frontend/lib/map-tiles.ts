import type { LatLngExpression } from 'leaflet'

const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim()

export const TILE_URL = `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png${
  CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : ''
}`

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

export const MUMBAI_CENTER: LatLngExpression = [19.076, 72.8777]
