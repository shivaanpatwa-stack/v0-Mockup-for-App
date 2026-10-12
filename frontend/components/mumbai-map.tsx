'use client'

import { Circle, CircleMarker, MapContainer, Marker, Pane, TileLayer, Tooltip } from 'react-leaflet'
import { divIcon, type LatLngBoundsExpression } from 'leaflet'
import WardRiskLayer from './ward-risk-layer'
import { MUMBAI_CENTER, TILE_ATTRIBUTION, TILE_URL } from '@/lib/map-tiles'
import type { AmbulanceAssignment, Hospital } from '@/lib/api'
import 'leaflet/dist/leaflet.css'

const MUMBAI_BOUNDS: LatLngBoundsExpression = [
  [18.85, 72.75],
  [19.3, 73.05],
]

const ASSIGNMENT_COLOR = '#2da44e'
const HOSPITAL_COLOR = '#1f6feb'
const SIMULATED_COLOR = '#8250df'

// A square "H" badge, so the hospital never looks like a round ambulance marker.
const hospitalIcon = divIcon({
  className: 'hospital-marker',
  html: 'H',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  tooltipAnchor: [12, 0],
})

type MumbaiMapProps = {
  hour: number
  hospital?: Hospital | null
  assignments?: AmbulanceAssignment[]
  /** Draw `assignments` as unsaved what-if positions (hollow, dashed). */
  simulated?: boolean
  /** A what-if operating radius, drawn when it differs from the hospital's. */
  simulatedRadiusKm?: number | null
}

export default function MumbaiMap({ hour, hospital, assignments, simulated = false, simulatedRadiusKm }: MumbaiMapProps) {
  const showSimulatedRadius = hospital && simulatedRadiusKm != null && simulatedRadiusKm !== hospital.operating_radius_km
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
      {hospital && (
        <>
          {/* Own pane above the ward shapes (which load later and would otherwise cover it). */}
          <Pane name="operating-radius" style={{ zIndex: 450 }}>
            <Circle
              center={[hospital.lat, hospital.lng]}
              radius={hospital.operating_radius_km * 1000}
              interactive={false}
              pathOptions={{ color: HOSPITAL_COLOR, weight: 1.5, dashArray: '6 6', fillColor: HOSPITAL_COLOR, fillOpacity: 0.04 }}
            />
            {showSimulatedRadius && (
              <Circle
                center={[hospital.lat, hospital.lng]}
                radius={simulatedRadiusKm * 1000}
                interactive={false}
                pathOptions={{ color: SIMULATED_COLOR, weight: 1.5, dashArray: '2 6', fill: false }}
              />
            )}
          </Pane>
          <Marker position={[hospital.lat, hospital.lng]} icon={hospitalIcon}>
            <Tooltip>
              <strong>{hospital.name}</strong>
              <br />
              Fleet: {hospital.fleet_size} {hospital.fleet_size === 1 ? 'ambulance' : 'ambulances'}
            </Tooltip>
          </Marker>
        </>
      )}
      {assignments?.map((a) => (
        <CircleMarker
          key={a.ambulance_id}
          center={[a.lat, a.lng]}
          radius={9}
          pane="markerPane"
          pathOptions={
            simulated
              ? { color: SIMULATED_COLOR, weight: 2.5, dashArray: '3 3', fillColor: '#ffffff', fillOpacity: 0.85 }
              : { color: '#fff', weight: 2, fillColor: ASSIGNMENT_COLOR, fillOpacity: 1 }
          }
        >
          <Tooltip>
            {simulated && <>Simulated · </>}
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
