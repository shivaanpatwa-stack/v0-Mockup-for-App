'use client'

import { useEffect, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, Pane, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { Control, DomEvent, DomUtil, divIcon, latLng, latLngBounds, type DivIcon, type LatLngBounds } from 'leaflet'
import WardRiskLayer from './ward-risk-layer'
import { MUMBAI_CENTER, TILE_ATTRIBUTION, TILE_URL, TILE_URL_LABELS, TILE_URL_NO_LABELS } from '@/lib/map-tiles'
import { mapColor } from '@/lib/map-theme'
import type { AmbulanceAssignment, Hospital } from '@/lib/api'
import 'leaflet/dist/leaflet.css'

const MUMBAI_BOUNDS: [[number, number], [number, number]] = [
  [18.85, 72.75],
  [19.3, 73.05],
]
const DEFAULT_ZOOM = 11
const FIT_PADDING = 40
const FIT_OPTIONS = { maxZoom: 13, animate: true, duration: 0.5 }

// Pane order, bottom to top: tiles, ward polygons (overlayPane 400), street labels, radius circles,
// markers (markerPane 600), tooltips (tooltipPane 650).
const LABELS_PANE_Z = 450
const RADIUS_PANE_Z = 460

const HOSPITAL_ICON_SIZE = 32
const UNIT_ICON_SIZE = 30

// White cross on a navy rounded square; colors come from CSS (.hospital-marker).
const hospitalIcon = divIcon({
  className: 'hospital-marker',
  html: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="currentColor"/></svg>',
  iconSize: [HOSPITAL_ICON_SIZE, HOSPITAL_ICON_SIZE],
  iconAnchor: [HOSPITAL_ICON_SIZE / 2, HOSPITAL_ICON_SIZE / 2],
  tooltipAnchor: [HOSPITAL_ICON_SIZE / 2, 0],
})

/** Short label drawn inside a unit marker: trailing digits ("AMB-01" -> "01"), else the first letters. */
function unitLabel(ambulanceId: string) {
  const digits = ambulanceId.match(/(\d+)\D*$/)?.[1]
  return (digits ?? ambulanceId.replace(/[^A-Za-z]/g, '')).slice(-3).toUpperCase() || '?'
}

// One icon per type / simulated / label combination, so re-renders reuse the same DOM.
const unitIconCache = new Map<string, DivIcon>()

function unitIcon(type: string, simulated: boolean, label: string): DivIcon {
  const kind = type.toUpperCase() === 'ALS' ? 'als' : 'bls'
  const key = `${kind}|${simulated}|${label}`
  let icon = unitIconCache.get(key)
  if (!icon) {
    icon = divIcon({
      className: 'unit-marker-icon',
      html: `<span class="unit-marker unit-${kind}${simulated ? ' unit-simulated' : ''}">${label}</span>`,
      iconSize: [UNIT_ICON_SIZE, UNIT_ICON_SIZE],
      iconAnchor: [UNIT_ICON_SIZE / 2, UNIT_ICON_SIZE / 2],
      tooltipAnchor: [UNIT_ICON_SIZE / 2, 0],
    })
    unitIconCache.set(key, icon)
  }
  return icon
}

/** Clip bounds to the map's maxBounds so a fit never asks for a view outside them. */
function clipToMumbai(bounds: LatLngBounds): LatLngBounds {
  const limit = latLngBounds(MUMBAI_BOUNDS)
  const south = Math.max(bounds.getSouth(), limit.getSouth())
  const north = Math.min(bounds.getNorth(), limit.getNorth())
  const west = Math.max(bounds.getWest(), limit.getWest())
  const east = Math.min(bounds.getEast(), limit.getEast())
  return south < north && west < east ? latLngBounds([south, west], [north, east]) : bounds
}

type PlanViewportProps = {
  hospital?: Hospital | null
  assignments?: AmbulanceAssignment[]
  simulatedRadiusKm?: number | null
}

/** Fits the view to hospital + radius + markers whenever a new plan is shown, plus a "Reset view" control. */
function PlanViewport({ hospital, assignments, simulatedRadiusKm }: PlanViewportProps) {
  const map = useMap()
  const fitRef = useRef<() => void>(() => {})

  // Kept current on every render, so the control's click handler always fits the latest plan.
  fitRef.current = () => {
    const points: LatLngBounds[] = []
    if (hospital) {
      const radiusKm = Math.max(hospital.operating_radius_km, simulatedRadiusKm ?? 0)
      points.push(latLng(hospital.lat, hospital.lng).toBounds(radiusKm * 2000))
    }
    for (const a of assignments ?? []) points.push(latLng(a.lat, a.lng).toBounds(1))
    if (points.length === 0) {
      map.setView(MUMBAI_CENTER, DEFAULT_ZOOM, { animate: true })
      return
    }
    const bounds = points.reduce((all, b) => all.extend(b), latLngBounds(points[0].getSouthWest(), points[0].getNorthEast()))
    // 40px all round, plus the legend's height at the bottom so no marker ends up behind it.
    const legend = map.getContainer().parentElement?.querySelector<HTMLElement>('.map-legend')
    const legendSpace = legend ? legend.offsetHeight + 12 : 0
    map.fitBounds(clipToMumbai(bounds), {
      ...FIT_OPTIONS,
      paddingTopLeft: [FIT_PADDING, FIT_PADDING],
      paddingBottomRight: [FIT_PADDING, FIT_PADDING + legendSpace],
    })
  }

  // A new run, simulation or past-run view arrives as a new assignments array.
  useEffect(() => {
    if (assignments) fitRef.current()
  }, [assignments])

  useEffect(() => {
    const ResetControl = Control.extend({
      onAdd() {
        const bar = DomUtil.create('div', 'leaflet-bar map-reset-control')
        const button = DomUtil.create('a', '', bar)
        button.href = '#'
        button.setAttribute('role', 'button')
        button.title = 'Reset view'
        button.textContent = 'Reset view'
        DomEvent.disableClickPropagation(bar)
        DomEvent.on(button, 'click', (e) => {
          DomEvent.preventDefault(e)
          fitRef.current()
        })
        return bar
      },
    })
    // Added after the zoom control in the same corner, so it sits right under the zoom buttons.
    const control = new ResetControl({ position: 'topleft' })
    control.addTo(map)
    return () => {
      control.remove()
    }
  }, [map])

  return null
}

type MumbaiMapProps = {
  hour: number
  hospital?: Hospital | null
  assignments?: AmbulanceAssignment[]
  /** Draw `assignments` as unsaved what-if positions (dashed, lighter). */
  simulated?: boolean
  /** A what-if operating radius, drawn when it differs from the hospital's. */
  simulatedRadiusKm?: number | null
}

export default function MumbaiMap({ hour, hospital, assignments, simulated = false, simulatedRadiusKm }: MumbaiMapProps) {
  // If the label-only tiles can't load, fall back to the basemap with labels baked in.
  const [labelsFailed, setLabelsFailed] = useState(false)
  const showSimulatedRadius = hospital && simulatedRadiusKm != null && simulatedRadiusKm !== hospital.operating_radius_km
  const navy = mapColor('navy')

  return (
    <MapContainer
      center={MUMBAI_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={10}
      maxZoom={16}
      zoomSnap={0.5}
      zoomDelta={0.5}
      maxBounds={MUMBAI_BOUNDS}
      maxBoundsViscosity={1.0}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url={labelsFailed ? TILE_URL : TILE_URL_NO_LABELS} attribution={TILE_ATTRIBUTION} subdomains="abcd" />
      <WardRiskLayer hour={hour} />
      {!labelsFailed && (
        <Pane name="labels" style={{ zIndex: LABELS_PANE_Z, pointerEvents: 'none' }}>
          <TileLayer url={TILE_URL_LABELS} subdomains="abcd" eventHandlers={{ tileerror: () => setLabelsFailed(true) }} />
        </Pane>
      )}
      {hospital && (
        <>
          <Pane name="operating-radius" style={{ zIndex: RADIUS_PANE_Z, pointerEvents: 'none' }}>
            <Circle
              center={[hospital.lat, hospital.lng]}
              radius={hospital.operating_radius_km * 1000}
              interactive={false}
              pathOptions={{ color: navy, weight: 1.5, dashArray: '6 6', fillColor: navy, fillOpacity: 0.04 }}
            />
            {showSimulatedRadius && (
              <Circle
                center={[hospital.lat, hospital.lng]}
                radius={simulatedRadiusKm * 1000}
                interactive={false}
                pathOptions={{ color: navy, weight: 1.5, dashArray: '1 5', lineCap: 'round', fill: false }}
              />
            )}
          </Pane>
          <Marker
            position={[hospital.lat, hospital.lng]}
            icon={hospitalIcon}
            title={`${hospital.name}, hospital`}
            alt={`${hospital.name}, hospital`}
          >
            <Tooltip className="map-tooltip">
              <strong>{hospital.name}</strong>
              <div className="map-tooltip-muted">
                Fleet: {hospital.fleet_size} {hospital.fleet_size === 1 ? 'ambulance' : 'ambulances'}
              </div>
            </Tooltip>
          </Marker>
        </>
      )}
      {assignments?.map((a) => {
        const place = a.name ?? a.candidate_id
        const description = `${a.ambulance_id}, ${a.type}, ${place}`
        return (
          <Marker
            key={a.ambulance_id}
            position={[a.lat, a.lng]}
            icon={unitIcon(a.type, simulated, unitLabel(a.ambulance_id))}
            title={simulated ? `${description} (simulated)` : description}
            alt={description}
          >
            <Tooltip className="map-tooltip">
              <div className="map-tooltip-row">
                <strong>{a.ambulance_id}</strong>
                <span className={`type-chip type-${a.type.toLowerCase()}`}>{a.type}</span>
                {simulated && <span className="type-chip type-simulated">Simulated</span>}
              </div>
              <div>{place}</div>
              {a.ward_code && <div className="map-tooltip-muted">Ward {a.ward_code}</div>}
            </Tooltip>
          </Marker>
        )
      })}
      <PlanViewport hospital={hospital} assignments={assignments} simulatedRadiusKm={simulatedRadiusKm} />
    </MapContainer>
  )
}
