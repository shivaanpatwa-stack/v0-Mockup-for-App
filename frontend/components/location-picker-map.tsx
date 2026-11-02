'use client'

import { useEffect, useMemo } from 'react'
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { divIcon, type LeafletEvent, type Marker as LeafletMarker } from 'leaflet'
import { MUMBAI_CENTER, TILE_ATTRIBUTION, TILE_URL } from '@/lib/map-tiles'
import 'leaflet/dist/leaflet.css'

export type LatLng = { lat: number; lng: number }

// Pass a new object each time to re-trigger the fly-to, even for the same point.
export type ViewTarget = { center: LatLng; zoom: number }

const PIN_SIZE = 22

// A round pin that's easy to grab and drag; colours come from CSS (.reg-pin).
const pinIcon = divIcon({
  className: 'reg-pin',
  iconSize: [PIN_SIZE, PIN_SIZE],
  iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2],
})

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
    if (target) map.flyTo([target.center.lat, target.center.lng], target.zoom)
  }, [map, target])
  return null
}

type Props = {
  position: LatLng | null
  radiusKm: number | null
  viewTarget: ViewTarget | null
  /** A click on the map or the end of a pin drag: the user placing the pin by hand. */
  onPick: (pos: LatLng) => void
}

export default function LocationPickerMap({ position, radiusKm, viewTarget, onPick }: Props) {
  const markerEvents = useMemo(
    () => ({
      dragend: (e: LeafletEvent) => {
        const { lat, lng } = (e.target as LeafletMarker).getLatLng().wrap()
        onPick({ lat, lng })
      },
    }),
    [onPick],
  )

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
          <Marker
            position={position}
            icon={pinIcon}
            draggable
            autoPan
            keyboard
            title="Hospital location (drag to adjust)"
            alt="Hospital location"
            eventHandlers={markerEvents}
          />
        </>
      )}
    </MapContainer>
  )
}
