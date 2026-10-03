'use client'

import { useEffect } from 'react'
import { Circle, CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { MUMBAI_CENTER, TILE_ATTRIBUTION, TILE_URL } from '@/lib/map-tiles'
import 'leaflet/dist/leaflet.css'

export type LatLng = { lat: number; lng: number }

// Pass a new object each time to re-trigger the pan/zoom, even for the same bounds.
export type ViewTarget = { bounds: LatLngBoundsExpression }

function ClickToPlace({ onPick }: { onPick: (pos: LatLng) => void }) {
  useMapEvents({
    click: (e) => {
      // wrap() keeps lng within [-180, 180] if the user has panned across a world copy.
      const { lat, lng } = e.latlng.wrap()
      onPick({ lat, lng })
    },
  })
  return null
}

function FlyToTarget({ target }: { target: ViewTarget | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyToBounds(target.bounds, { maxZoom: 16 })
  }, [map, target])
  return null
}

type Props = {
  position: LatLng | null
  radiusKm: number | null
  viewTarget: ViewTarget | null
  onPick: (pos: LatLng) => void
}

export default function LocationPickerMap({ position, radiusKm, viewTarget, onPick }: Props) {
  return (
    <MapContainer center={MUMBAI_CENTER} zoom={11} style={{ height: '100%', width: '100%' }}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains="abcd" />
      <ClickToPlace onPick={onPick} />
      <FlyToTarget target={viewTarget} />
      {position && (
        <>
          {radiusKm !== null && (
            <Circle
              center={position}
              radius={radiusKm * 1000}
              interactive={false}
              pathOptions={{ color: '#0c4a6e', weight: 1, fillColor: '#0c4a6e', fillOpacity: 0.08 }}
            />
          )}
          <CircleMarker
            center={position}
            radius={9}
            interactive={false}
            pathOptions={{ color: '#fff', weight: 2, fillColor: '#7c3aed', fillOpacity: 1 }}
          />
        </>
      )}
    </MapContainer>
  )
}
