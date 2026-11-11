'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { GeoJSON, MapContainer, Marker, Pane, Polyline, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import { divIcon, latLngBounds } from 'leaflet'
import type { FeatureCollection } from 'geojson'
import 'leaflet/dist/leaflet.css'
import WardRiskLayer from '@/components/ward-risk-layer'
import { getIsochroneWards, loadTravelTimeMatrix, type TravelTimeMatrix } from '@/lib/isochrone'
import { MUMBAI_CENTER, TILE_ATTRIBUTION, TILE_URL_DARK_LABELS, TILE_URL_DARK_NO_LABELS } from '@/lib/map-tiles'
import { WARD_CENTROIDS, WARD_NAMES } from '@/lib/ward-names'
import type { AmbulanceAssignment, Hospital } from '@/lib/api'

const WARDS_URL = '/data/wards_simplified.geojson'
const REACH_MINUTES = 20
const MUMBAI_BOUNDS: [[number, number], [number, number]] = [
  [18.85, 72.7],
  [19.35, 73.1],
]

export type Ghost = { callSign: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } }

export type LiveMapProps = {
  hour: number
  hospital?: Hospital
  units: AmbulanceAssignment[]
  /** Dashed outline pins: the units are a scenario or an unapplied preview. */
  unitsAreScenario?: boolean
  ghosts?: Ghost[]
  /** Candidate ids whose reach is outlined. */
  reachFrom?: string[]
  reachMinutes?: number
  uncoveredWards?: string[]
  layers?: { demand: boolean; reach: boolean; units: boolean }
  focusWard?: string | null
  hotUnit?: string | null
  onHoverUnit?: (callSign: string | null) => void
  /** Small static map (run drawer): no wheel zoom, no labels pane, fits to units. */
  mini?: boolean
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

const baseIcon = divIcon({
  className: 'plain-icon',
  html: '<span class="base-pin" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg></span>',
  iconSize: [0, 0],
})
const ghostIcon = divIcon({ className: 'plain-icon', html: '<span class="ghost-pin" aria-hidden="true"></span>', iconSize: [0, 0] })

function unitIcon(a: AmbulanceAssignment, scenario: boolean, hot: boolean) {
  const cls = ['unit-pin', a.type === 'BLS' ? 'is-bls' : '', scenario ? 'is-scenario' : '', hot ? 'is-hot' : ''].join(' ')
  return divIcon({ className: 'plain-icon', html: `<span class="${cls}">${esc(a.ambulance_id)}</span>`, iconSize: [0, 0] })
}

function arrowIcon(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  // Screen-space bearing (good enough at city scale): east = 0deg, north = -90deg.
  const angle = (Math.atan2(-(to.lat - from.lat), (to.lng - from.lng) * Math.cos((to.lat * Math.PI) / 180)) * 180) / Math.PI
  return divIcon({
    className: 'plain-icon',
    html: `<svg width="12" height="12" viewBox="0 0 12 12" style="transform:translate(-50%,-50%) rotate(${angle.toFixed(1)}deg)" aria-hidden="true"><path d="M1 1 L11 6 L1 11 Z" fill="#9aa3a0"/></svg>`,
    iconSize: [0, 0],
  })
}

/** A point 80% of the way along a move, where the arrowhead sits (before the unit pin). */
const along = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, t = 0.8) => ({
  lat: a.lat + (b.lat - a.lat) * t,
  lng: a.lng + (b.lng - a.lng) * t,
})

function FocusWard({ ward }: { ward?: string | null }) {
  const map = useMap()
  useEffect(() => {
    const c = ward ? WARD_CENTROIDS[ward] : null
    if (c) map.flyTo([c.lat, c.lng], 13, { duration: 0.8, easeLinearity: 0.3 })
  }, [ward, map])
  return null
}

function FitUnits({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap()
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  useEffect(() => {
    if (points.length === 0) return
    map.fitBounds(latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])).pad(0.3), { maxZoom: 13, animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

export default function LiveMap({
  hour,
  hospital,
  units,
  unitsAreScenario = false,
  ghosts = [],
  reachFrom = [],
  reachMinutes,
  uncoveredWards = [],
  layers = { demand: true, reach: true, units: true },
  focusWard,
  hotUnit,
  onHoverUnit,
  mini = false,
}: LiveMapProps) {
  const [wards, setWards] = useState<FeatureCollection | null>(null)
  const [matrix, setMatrix] = useState<TravelTimeMatrix | null>(null)

  useEffect(() => {
    let live = true
    fetch(WARDS_URL)
      .then((r) => r.json())
      .then((g) => live && setWards(g))
      .catch((err) => console.error('Loading ward boundaries failed', err))
    loadTravelTimeMatrix().then((m) => live && setMatrix(m))
    return () => {
      live = false
    }
  }, [])

  const reach = useMemo(() => getIsochroneWards(matrix, reachFrom, reachMinutes ?? REACH_MINUTES), [matrix, reachFrom, reachMinutes])
  const reachGeo = useMemo<FeatureCollection | null>(
    () => (wards && reach.size ? { ...wards, features: wards.features.filter((f) => reach.has(f.properties?.ward_code)) } : null),
    [wards, reach],
  )
  const uncoveredGeo = useMemo<FeatureCollection | null>(() => {
    if (!wards || uncoveredWards.length === 0) return null
    const set = new Set(uncoveredWards)
    return { ...wards, features: wards.features.filter((f) => set.has(f.properties?.ward_code)) }
  }, [wards, uncoveredWards])

  const fitPoints = useMemo(
    () => (mini ? [...units.map((u) => ({ lat: u.lat, lng: u.lng })), ...(hospital ? [{ lat: hospital.lat, lng: hospital.lng }] : [])] : []),
    [mini, units, hospital],
  )

  return (
    <MapContainer
      center={hospital ? [hospital.lat, hospital.lng] : MUMBAI_CENTER}
      zoom={mini ? 12 : 11}
      minZoom={10}
      maxBounds={MUMBAI_BOUNDS}
      maxBoundsViscosity={0.8}
      scrollWheelZoom={true}
      zoomControl={false}
      attributionControl
      style={{ width: '100%', height: '100%' }}
      aria-label={mini ? 'Map of this plan' : `Map of Mumbai wards at ${String(hour).padStart(2, '0')}:00`}
    >
      <TileLayer url={TILE_URL_DARK_NO_LABELS} attribution={TILE_ATTRIBUTION} subdomains="abcd" />
      {!mini && (
        <Pane name="labels" style={{ zIndex: 450, pointerEvents: 'none' }}>
          <TileLayer url={TILE_URL_DARK_LABELS} subdomains="abcd" />
        </Pane>
      )}
      <Pane name="ward-risk-pane" style={{ zIndex: 400 }}>
        <WardRiskLayer hour={hour} showDemand={layers.demand} showRisk={!mini} pane="ward-risk-pane" focusWard={focusWard} />
      </Pane>
      <Pane name="reach-pane" style={{ zIndex: 420, pointerEvents: 'none' }}>
        {layers.reach && reachGeo && (
          <GeoJSON
            key={`reach-${[...reach].sort().join(',')}`}
            data={reachGeo}
            interactive={false}
            pane="reach-pane"
            style={{ color: '#D6D1C8', weight: 1.5, opacity: 0.8, fillColor: '#D6D1C8', fillOpacity: 0.08 }}
          />
        )}
        {uncoveredGeo && (
          <GeoJSON
            key={`unc-${uncoveredWards.join(',')}`}
            data={uncoveredGeo}
            interactive={false}
            pane="reach-pane"
            style={{ color: '#d93025', weight: 2, opacity: 1, dashArray: '5 4', fill: false }}
          />
        )}
      </Pane>
      {hospital && (
        <Marker position={[hospital.lat, hospital.lng]} icon={baseIcon} keyboard={false} zIndexOffset={-100}>
          <Tooltip className="map-tooltip" direction="top" offset={[0, -14]}>
            <strong>{hospital.name}</strong>
            <div className="map-tooltip-muted">Hospital base</div>
          </Tooltip>
        </Marker>
      )}
      {layers.units &&
        ghosts.map((g) => (
          <Fragment key={`ghost-${g.callSign}`}>
            <Marker position={[g.from.lat, g.from.lng]} icon={ghostIcon} interactive={false} keyboard={false} />
            <Polyline positions={[[g.from.lat, g.from.lng], [g.to.lat, g.to.lng]]} interactive={false} pathOptions={{ color: '#9aa3a0', weight: 1.5, dashArray: '4 4' }} />
            <Marker position={[along(g.from, g.to).lat, along(g.from, g.to).lng]} icon={arrowIcon(g.from, g.to)} interactive={false} keyboard={false} />
          </Fragment>
        ))}
      {layers.units &&
        units.map((a) => (
          <Marker
            key={`${a.ambulance_id}-${a.candidate_id}-${unitsAreScenario}`}
            position={[a.lat, a.lng]}
            icon={unitIcon(a, unitsAreScenario, hotUnit === a.ambulance_id)}
            title={`${a.ambulance_id}, ${a.type}, ${a.name ?? a.candidate_id}`}
            zIndexOffset={hotUnit === a.ambulance_id ? 1000 : 0}
            eventHandlers={onHoverUnit ? { mouseover: () => onHoverUnit(a.ambulance_id), mouseout: () => onHoverUnit(null) } : undefined}
          >
            <Tooltip className="map-tooltip" direction="top" offset={[0, -14]}>
              <strong className="mono">{a.ambulance_id}</strong> · {a.type}
              {unitsAreScenario ? ' · scenario' : ''}
              <div>{a.name ?? a.candidate_id}</div>
              {a.ward_code && (
                <div className="map-tooltip-muted">
                  Ward {a.ward_code}
                  {WARD_NAMES[a.ward_code] ? `, ${WARD_NAMES[a.ward_code]}` : ''}
                </div>
              )}
            </Tooltip>
          </Marker>
        ))}
      <ZoomControl position={mini ? 'topright' : 'bottomright'} />
      {!mini && <FocusWard ward={focusWard} />}
      {mini && <FitUnits points={fitPoints} />}
    </MapContainer>
  )
}
