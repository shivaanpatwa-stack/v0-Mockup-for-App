'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { Circle, MapContainer, Marker, Pane, Popup, TileLayer, Tooltip, useMap, GeoJSON } from 'react-leaflet'
import { Control, DomEvent, DomUtil, divIcon, latLng, latLngBounds, type DivIcon, type LatLngBounds } from 'leaflet'
import type { FeatureCollection } from 'geojson'
import { Sparkles, AlertCircle, Clock } from 'lucide-react'
import WardRiskLayer from './ward-risk-layer'
import { MUMBAI_CENTER, TILE_ATTRIBUTION, TILE_URL, TILE_URL_LABELS, TILE_URL_NO_LABELS } from '@/lib/map-tiles'
import { mapColor } from '@/lib/map-theme'
import type { AmbulanceAssignment, FleetAmbulance, Hospital, Kpis } from '@/lib/api'
import { loadTravelTimeMatrix, getIsochroneWards, filterIsochroneGeoJson, type TravelTimeMatrix } from '@/lib/isochrone'
import 'leaflet/dist/leaflet.css'

const MUMBAI_BOUNDS: [[number, number], [number, number]] = [
  [18.85, 72.75],
  [19.3, 73.05],
]
const DEFAULT_ZOOM = 11
const FIT_PADDING = 40
const FIT_OPTIONS = { maxZoom: 13, animate: true, duration: 0.5 }

const LABELS_PANE_Z = 450
const ISOCHRONE_PANE_Z = 430
const RADIUS_PANE_Z = 460

const HOSPITAL_ICON_SIZE = 34
const UNIT_ICON_SIZE = 34

const hospitalIcon: DivIcon = divIcon({
  className: 'map-marker-icon hospital-marker-icon',
  html: '<div class="hospital-marker" aria-label="Hospital base"><span class="hospital-marker-plus">+</span></div>',
  iconSize: [HOSPITAL_ICON_SIZE, HOSPITAL_ICON_SIZE],
  iconAnchor: [HOSPITAL_ICON_SIZE / 2, HOSPITAL_ICON_SIZE / 2],
  popupAnchor: [0, -HOSPITAL_ICON_SIZE / 2 - 4],
  tooltipAnchor: [HOSPITAL_ICON_SIZE / 2 + 4, 0],
})

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)

/** The full call sign, never shortened: dispatchers radio units by this ID. */
function unitLabel(id: string): string {
  return id
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function distanceFromBase(hospital: Hospital | null | undefined, lat: number, lng: number): string {
  if (!hospital) return '—'
  return `${haversineKm(hospital.lat, hospital.lng, lat, lng).toFixed(1)} km`
}

function unitIcon(
  type: string,
  simulated: boolean,
  label: string,
  isDeployed: boolean,
  isSelected: boolean,
  isAtBase: boolean = false,
  isHighlighted: boolean = false,
): DivIcon {
  const kind = type.toUpperCase() === 'ALS' ? 'als' : 'bls'
  const stateClass = isHighlighted
    ? 'unit-highlighted'
    : isSelected
    ? 'unit-selected'
    : isAtBase
    ? 'unit-at-base'
    : isDeployed
    ? 'unit-deployed'
    : simulated
    ? 'unit-simulated'
    : 'unit-recommended'

  const safe = escapeHtml(label)
  const w = Math.max(UNIT_ICON_SIZE, 14 + label.length * 7)
  const html = `<div class="unit-marker unit-${kind} ${stateClass}" aria-label="Unit ${safe} (${isAtBase ? 'At Base' : isDeployed ? 'Deployed' : 'Recommended'})">
    ${isHighlighted ? '<span class="unit-beacon-pulse" aria-hidden="true"></span>' : ''}
    ${isDeployed && !isAtBase ? '<span class="unit-deployed-dot" aria-hidden="true"></span>' : ''}
    <span class="unit-num">${safe}</span>
  </div>`

  return divIcon({
    className: `unit-marker-icon ${isHighlighted ? 'unit-marker-icon-highlighted' : ''}`,
    html,
    iconSize: [w, UNIT_ICON_SIZE],
    iconAnchor: [w / 2, UNIT_ICON_SIZE / 2],
    popupAnchor: [0, -UNIT_ICON_SIZE / 2 - 4],
    tooltipAnchor: [w / 2 + 4, 0],
  })
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

function PlanViewport({ hospital, assignments, simulatedRadiusKm }: PlanViewportProps) {
  const map = useMap()
  const fitRef = useRef<() => void>(() => {})

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
    map.fitBounds(clipToMumbai(bounds), {
      ...FIT_OPTIONS,
      paddingTopLeft: [FIT_PADDING, FIT_PADDING],
      paddingBottomRight: [FIT_PADDING, FIT_PADDING],
    })
  }

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
    const control = new ResetControl({ position: 'topleft' })
    control.addTo(map)
    return () => {
      control.remove()
    }
  }, [map])

  return null
}

export type MapLayer = 'demand' | 'risk' | 'ambulances' | 'coverage'

export type MapFocusTarget = {
  lat: number
  lng: number
  zoom?: number
  wardCode?: string
  key?: number
} | null

function MapFocusController({ target }: { target?: MapFocusTarget }) {
  const map = useMap()
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], target.zoom ?? 14, { duration: 0.8 })
    }
  }, [map, target?.key, target?.lat, target?.lng, target?.zoom])
  return null
}

type MumbaiMapProps = {
  hour: number
  hospital?: Hospital | null
  assignments?: AmbulanceAssignment[]
  fleet?: FleetAmbulance[] | null
  simulated?: boolean
  simulatedRadiusKm?: number | null
  kpis?: Kpis | null
  hospitalCandidateId?: string | null
  onViewModeChange?: (mode: 'after' | 'before') => void
  focusTarget?: MapFocusTarget
  highlightedUnitId?: string | null
  onHighlightUnit?: (id: string | null) => void
}

export default function MumbaiMap({
  hour,
  hospital,
  assignments,
  fleet,
  simulated = false,
  simulatedRadiusKm,
  kpis,
  hospitalCandidateId,
  onViewModeChange,
  focusTarget,
  highlightedUnitId,
  onHighlightUnit,
}: MumbaiMapProps) {
  const [labelsFailed, setLabelsFailed] = useState(false)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)

  // Before / After Segmented Toggle state
  const [viewMode, setViewMode] = useState<'after' | 'before'>('after')

  // Travel time matrix for real 15-minute isochrones
  const [matrix, setMatrix] = useState<TravelTimeMatrix | null>(null)
  const [zones, setZones] = useState<FeatureCollection | null>(null)

  useEffect(() => {
    loadTravelTimeMatrix().then(setMatrix)
    fetch('/data/zones_full_features_final.geojson')
      .then((r) => r.json())
      .then(setZones)
      .catch((err) => console.error('Failed to load zones for isochrone', err))
  }, [])

  // Interactive Layer Selector: Demand | Risk | Ambulances | 15m Isochrone
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>({
    demand: true,
    risk: true,
    ambulances: true,
    coverage: true, // Now controls the Real 15-Minute Isochrone!
  })

  const toggleLayer = (layer: MapLayer) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))
  }

  const handleModeSwitch = (mode: 'after' | 'before') => {
    setViewMode(mode)
    onViewModeChange?.(mode)
  }

  // Active candidate positions for isochrone calculation
  const activeCandidateIds = useMemo(() => {
    if (viewMode === 'before') {
      const baseCandidate = hospitalCandidateId || kpis?.baseline.hospital_candidate_id || 'CAND_0048'
      return [baseCandidate]
    }
    return (assignments ?? []).map((a) => a.candidate_id)
  }, [viewMode, assignments, hospitalCandidateId, kpis])

  // Compute the exact 15-minute isochrone reached wards
  const isochroneWards = useMemo(() => {
    return getIsochroneWards(matrix, activeCandidateIds, 15.0)
  }, [matrix, activeCandidateIds])

  // Filter the GeoJSON for the reached isochrone polygons
  const isochroneGeoJson = useMemo(() => {
    return filterIsochroneGeoJson(zones, isochroneWards)
  }, [zones, isochroneWards])

  // Compute marker positions based on viewMode
  // In 'before' mode: All units stationed at the hospital base in a neat radial rosette
  // In 'after' mode: Units placed at their optimized staging positions
  const displayedMarkers = useMemo(() => {
    if (!assignments || assignments.length === 0) return []

    if (viewMode === 'before' && hospital) {
      const total = assignments.length
      const r = 0.003 // ~280 meters offset around the hospital base dock
      return assignments.map((a, idx) => {
        const angle = (2 * Math.PI * idx) / Math.max(1, total) - Math.PI / 2
        return {
          ...a,
          lat: hospital.lat + r * Math.sin(angle),
          lng: hospital.lng + (r / Math.cos((hospital.lat * Math.PI) / 180)) * Math.cos(angle),
          name: `${hospital.name} (Base Dock)`,
        }
      })
    }

    return assignments
  }, [assignments, viewMode, hospital])

  const navy = mapColor('navy') || '#0C4A6E'

  return (
    <div className="mumbai-map-root" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* 1. Floating Before / After Segmented Toggle */}
      <div className="map-segmented-container">
        <div className="map-segmented-pill" role="radiogroup" aria-label="Deployment comparison">
          <button
            type="button"
            className={`map-seg-btn ${viewMode === 'before' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('before')}
            aria-checked={viewMode === 'before'}
            title="Inspect baseline deployment with all units waiting at the hospital base"
          >
            <span className="seg-dot before" />
            <span className="seg-title">Before: All at Base</span>
            {kpis?.avg_response_min.before && (
              <span className="seg-metric">{kpis.avg_response_min.before.toFixed(1)}m</span>
            )}
          </button>
          <button
            type="button"
            className={`map-seg-btn ${viewMode === 'after' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('after')}
            aria-checked={viewMode === 'after'}
            title="Inspect algorithmically optimized distributed fleet staging"
          >
            <span className="seg-dot after" />
            <span className="seg-title">After: Optimized</span>
            {kpis?.avg_response_min.after && (
              <span className="seg-metric">{kpis.avg_response_min.after.toFixed(1)}m</span>
            )}
          </button>
        </div>

        {/* Dynamic Mode Impact Callout */}
        <div className={`map-view-callout ${viewMode === 'before' ? 'callout-before' : 'callout-after'}`}>
          {viewMode === 'before' ? (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
              <span>
                <strong>Baseline Staging:</strong> All units stationed at {hospital?.name || 'Base'}. 15-min isochrone reaches only{' '}
                <strong>{isochroneWards.size} of 24 wards</strong> ({kpis?.demand_within_15_min_pct.before ? `${Math.round(kpis.demand_within_15_min_pct.before)}%` : 'limited'} city demand).
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-sky-700 flex-shrink-0" />
              <span>
                <strong>Optimized Staging:</strong> Distributed fleet. 15-min isochrone expands across{' '}
                <strong>{isochroneWards.size} wards</strong> ({kpis?.demand_within_15_min_pct.after ? `${Math.round(kpis.demand_within_15_min_pct.after)}%` : '90%+'} city demand,{' '}
                {kpis?.avg_response_min.before && kpis?.avg_response_min.after
                  ? `−${(kpis.avg_response_min.before - kpis.avg_response_min.after).toFixed(1)}m faster`
                  : 'faster'}
                ).
              </span>
            </>
          )}
        </div>
      </div>

      {/* 2. Interactive Map Layer Selector */}
      <div className="map-layer-selector" role="toolbar" aria-label="Map layers">
        {(['demand', 'risk', 'ambulances', 'coverage'] as MapLayer[]).map((layer) => {
          const labels: Record<MapLayer, string> = {
            demand: 'Demand',
            risk: 'Risk',
            ambulances: 'Ambulances',
            coverage: 'Coverage',
          }
          const isActive = layers[layer]
          return (
            <button
              key={layer}
              type="button"
              className={`map-layer-btn ${isActive ? 'active' : ''}`}
              onClick={() => toggleLayer(layer)}
              aria-pressed={isActive}
              title={`Toggle ${labels[layer]} layer`}
            >
              <span className={`layer-dot ${layer}`} aria-hidden="true" />
              <span>{labels[layer]}</span>
            </button>
          )
        })}
      </div>

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

        {/* 3. Ward Risk Layer (Demand Choropleth & Risk Labels) */}
        <WardRiskLayer hour={hour} showDemand={layers.demand} showRisk={layers.risk} />

        {/* 4. Real 15-Minute Travel-Time Isochrone Layer */}
        {layers.coverage && isochroneGeoJson && (
          <Pane name="isochrone-pane" style={{ zIndex: ISOCHRONE_PANE_Z, pointerEvents: 'none' }}>
            <GeoJSON
              key={`isochrone-geojson-${viewMode}-${isochroneWards.size}`}
              data={isochroneGeoJson}
              style={() => ({
                color: '#0C4A6E',
                weight: 2.2,
                dashArray: '4 4',
                fillColor: '#0C4A6E',
                fillOpacity: 0.18,
              })}
            />
          </Pane>
        )}

        {/* 5. Geographic Operating Radius Circle (Native Leaflet geodesic circle in meters: radiusKm * 1000) */}
        {layers.coverage && hospital && (
          <Pane name="radius-pane" style={{ zIndex: RADIUS_PANE_Z, pointerEvents: 'none' }}>
            <Circle
              center={[hospital.lat, hospital.lng]}
              radius={hospital.operating_radius_km * 1000}
              pathOptions={{
                color: navy,
                weight: 1.8,
                dashArray: '6 6',
                fillColor: navy,
                fillOpacity: 0.05,
              }}
            />
            {simulatedRadiusKm && simulatedRadiusKm !== hospital.operating_radius_km && (
              <Circle
                center={[hospital.lat, hospital.lng]}
                radius={simulatedRadiusKm * 1000}
                pathOptions={{
                  color: '#78716C',
                  weight: 1.8,
                  dashArray: '3 6',
                  fillColor: '#78716C',
                  fillOpacity: 0.04,
                }}
              />
            )}
          </Pane>
        )}

        {!labelsFailed && (
          <Pane name="labels" style={{ zIndex: LABELS_PANE_Z, pointerEvents: 'none' }}>
            <TileLayer url={TILE_URL_LABELS} subdomains="abcd" eventHandlers={{ tileerror: () => setLabelsFailed(true) }} />
          </Pane>
        )}

        {/* Hospital Base Marker */}
        {hospital && (
          <Marker
            position={[hospital.lat, hospital.lng]}
            icon={hospitalIcon}
            title={`${hospital.name}, hospital base`}
            alt={`${hospital.name}, hospital base`}
          >
            <Popup className="map-ambulance-popup">
              <div className="popup-header">
                <strong>{hospital.name}</strong>
                <span className="popup-badge hospital-badge">Hospital Base</span>
              </div>
              <div className="popup-body">
                <div className="popup-row">
                  <span className="popup-label">Registered Fleet:</span>
                  <span className="popup-val">{hospital.fleet_size} ambulances</span>
                </div>
                <div className="popup-row">
                  <span className="popup-label">15-Min Base Reach:</span>
                  <span className="popup-val">{isochroneWards.size} wards covered</span>
                </div>
                <div className="popup-row">
                  <span className="popup-label">Code:</span>
                  <span className="popup-val font-mono">{hospital.code}</span>
                </div>
              </div>
            </Popup>
            <Tooltip className="map-tooltip">
              <strong>{hospital.name}</strong>
              <div className="map-tooltip-muted">
                Base Facility · {hospital.fleet_size} ambulances
              </div>
            </Tooltip>
          </Marker>
        )}

        {/* 5. Improved Ambulance Markers (With Before/After Staging Positioning) */}
        {layers.ambulances &&
          displayedMarkers.map((a, idx) => {
            const place = a.name ?? a.candidate_id
            const fleetUnit = fleet?.find((f) => f.call_sign === a.ambulance_id)
            const isDeployed = fleetUnit?.current_assignment?.assignment_status === 'in_position'
            const isSelected = selectedUnitId === a.ambulance_id
            const isHighlighted = highlightedUnitId === a.ambulance_id
            const isAtBase = viewMode === 'before'
            const label = unitLabel(a.ambulance_id)
            const description = `${a.ambulance_id}, ${a.type}, ${isAtBase ? 'Stationed at Base' : place}`

            return (
              <Marker
                key={`${a.ambulance_id}-${viewMode}`}
                position={[a.lat, a.lng]}
                icon={unitIcon(a.type, simulated, label, isDeployed, isSelected, isAtBase, isHighlighted)}
                zIndexOffset={isHighlighted ? 1200 : isSelected ? 600 : 0}
                title={simulated ? `${description} (simulated)` : description}
                alt={description}
                eventHandlers={{
                  click: () => {
                    setSelectedUnitId(a.ambulance_id)
                    onHighlightUnit?.(a.ambulance_id)
                  },
                  mouseover: () => {
                    onHighlightUnit?.(a.ambulance_id)
                  },
                  mouseout: () => {
                    onHighlightUnit?.(null)
                  },
                }}
              >
                <Popup className="map-ambulance-popup">
                  <div className="popup-header">
                    <div className="popup-title-group">
                      <strong>{a.ambulance_id}</strong>
                      <span className={`popup-type-chip type-${a.type.toLowerCase()}`}>{a.type}</span>
                    </div>
                    {isAtBase ? (
                      <span className="popup-badge status-base">At Base</span>
                    ) : isDeployed ? (
                      <span className="popup-badge status-deployed">In Position</span>
                    ) : simulated ? (
                      <span className="popup-badge status-simulated">Simulated</span>
                    ) : (
                      <span className="popup-badge status-recommended">Recommended</span>
                    )}
                  </div>
                  <div className="popup-body">
                    <div className="popup-row">
                      <span className="popup-label">Staging Location:</span>
                      <span className="popup-val">{place}</span>
                    </div>
                    <div className="popup-row">
                      <span className="popup-label">Ward:</span>
                      <span className="popup-val">Ward {a.ward_code ?? '—'}</span>
                    </div>
                    <div className="popup-row">
                      <span className="popup-label">From Base:</span>
                      <span className="popup-val">{isAtBase ? '0.0 km (At Base)' : distanceFromBase(hospital, a.lat, a.lng)}</span>
                    </div>
                  </div>
                </Popup>
                <Tooltip className="map-tooltip">
                  <strong>{a.ambulance_id} ({a.type})</strong>
                  <div className="map-tooltip-muted">
                    {isAtBase ? 'Stationed at Hospital Base' : place}
                  </div>
                </Tooltip>
              </Marker>
            )
          })}

        <PlanViewport hospital={hospital} assignments={displayedMarkers} simulatedRadiusKm={simulatedRadiusKm} />
        <MapFocusController target={focusTarget} />
      </MapContainer>
    </div>
  )
}
