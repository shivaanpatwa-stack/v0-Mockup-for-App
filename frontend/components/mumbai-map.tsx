'use client'

import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import WardRiskLayer from './ward-risk-layer'
import { MUMBAI_CENTER, TILE_ATTRIBUTION, TILE_URL } from '@/lib/map-tiles'
import type { OptimizedPosition } from '@/lib/api'
import 'leaflet/dist/leaflet.css'

const MUMBAI_BOUNDS: LatLngBoundsExpression = [
  [18.85, 72.75],
  [19.3, 73.05],
]

const RECOMMENDED_COLOR = '#2da44e'

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
      {positions?.map((p) => (
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
      ))}
    </MapContainer>
  )
}
