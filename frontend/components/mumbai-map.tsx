'use client'

import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'
import WardRiskLayer from './ward-risk-layer'
import { MUMBAI_CENTER, TILE_ATTRIBUTION, TILE_URL } from '@/lib/map-tiles'
import type { OptimizedPosition } from '@/lib/api'
import 'leaflet/dist/leaflet.css'

const MUMBAI_BOUNDS: LatLngBoundsExpression = [
  [18.85, 72.75],
  [19.3, 73.05],
]

const markers: { label: string; position: LatLngExpression; color: string }[] = [
  { label: 'Hospital A — Parel', position: [19.0018, 72.842], color: '#1f6feb' },
  { label: 'Ambulance AMB-001 — Andheri West', position: [19.1363, 72.827], color: '#d1242f' },
]

const PLACEHOLDER_RECOMMENDATION = { label: 'Recommended position — Dadar', position: [19.0178, 72.8478] as LatLngExpression }
const RECOMMENDED_COLOR = '#2da44e'

// Until the optimizer has run, a placeholder recommendation is shown instead.
export default function MumbaiMap({ positions }: { positions?: OptimizedPosition[] }) {
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
        attribution={TILE_ATTRIBUTION}
        subdomains="abcd"
      />
      <WardRiskLayer hour={21} />
      {markers.map((m) => (
        <CircleMarker
          key={m.label}
          center={m.position}
          radius={9}
          pane="markerPane"
          pathOptions={{ color: '#fff', weight: 2, fillColor: m.color, fillOpacity: 1 }}
        >
          <Tooltip>{m.label}</Tooltip>
        </CircleMarker>
      ))}
      {positions ? (
        positions.map((p) => (
          <CircleMarker
            key={p.candidate_id}
            center={[p.lat, p.lng]}
            radius={9}
            pane="markerPane"
            pathOptions={{ color: '#fff', weight: 2, fillColor: RECOMMENDED_COLOR, fillOpacity: 1 }}
          >
            <Tooltip>
              <strong>{p.name ?? p.candidate_id}</strong>
              <br />
              {p.candidate_id}
              {p.ward_code && ` · Ward ${p.ward_code}`}
              <br />
              Weighted score: {p.weighted_score.toFixed(3)}
            </Tooltip>
          </CircleMarker>
        ))
      ) : (
        <CircleMarker
          center={PLACEHOLDER_RECOMMENDATION.position}
          radius={9}
          pane="markerPane"
          pathOptions={{ color: '#fff', weight: 2, fillColor: RECOMMENDED_COLOR, fillOpacity: 1 }}
        >
          <Tooltip>{PLACEHOLDER_RECOMMENDATION.label}</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  )
}
