'use client'

import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import WardRiskLayer from './ward-risk-layer'
import { MUMBAI_CENTER, TILE_ATTRIBUTION, TILE_URL } from '@/lib/map-tiles'
import type { AmbulanceAssignment } from '@/lib/api'
import 'leaflet/dist/leaflet.css'

const MUMBAI_BOUNDS: LatLngBoundsExpression = [
  [18.85, 72.75],
  [19.3, 73.05],
]

const ASSIGNMENT_COLOR = '#2da44e'

export default function MumbaiMap({ hour, assignments }: { hour: number; assignments?: AmbulanceAssignment[] }) {
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
      <WardRiskLayer hour={hour} />
      {assignments?.map((a) => (
        <CircleMarker
          key={a.ambulance_id}
          center={[a.lat, a.lng]}
          radius={9}
          pane="markerPane"
          pathOptions={{ color: '#fff', weight: 2, fillColor: ASSIGNMENT_COLOR, fillOpacity: 1 }}
        >
          <Tooltip>
            <strong>{a.ambulance_id}</strong> · {a.type}
            <br />
            {a.name ?? a.candidate_id}
            {a.ward_code && ` · Ward ${a.ward_code}`}
            <br />
            Weighted score: {a.weighted_score.toFixed(3)}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
