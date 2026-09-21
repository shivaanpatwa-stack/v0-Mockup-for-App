'use client'

import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'
import WardRiskLayer from './ward-risk-layer'
import 'leaflet/dist/leaflet.css'

const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim()
const TILE_URL = `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png${
  CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : ''
}`

const MUMBAI_CENTER: LatLngExpression = [19.076, 72.8777]
const MUMBAI_BOUNDS: LatLngBoundsExpression = [
  [18.85, 72.75],
  [19.3, 73.05],
]

const markers: { label: string; position: LatLngExpression; color: string }[] = [
  { label: 'Hospital A — Parel', position: [19.0018, 72.842], color: '#1f6feb' },
  { label: 'Ambulance AMB-001 — Andheri West', position: [19.1363, 72.827], color: '#d1242f' },
  { label: 'Recommended position — Dadar', position: [19.0178, 72.8478], color: '#2da44e' },
]

export default function MumbaiMap() {
  return (
    <MapContainer
      center={MUMBAI_CENTER}
      zoom={11}
      minZoom={10}
      maxZoom={16}
      maxBounds={MUMBAI_BOUNDS}
      maxBoundsViscosity={1.0}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url={TILE_URL}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
      />
      <WardRiskLayer hour={21} />
      {markers.map((m) => (
        <CircleMarker
          key={m.label}
          center={m.position}
          radius={9}
          pathOptions={{ color: '#fff', weight: 2, fillColor: m.color, fillOpacity: 1 }}
        >
          <Tooltip>{m.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
