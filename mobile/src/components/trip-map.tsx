import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import type { LatLng } from 'react-native-maps'
import { HospitalMarkerView, UnitMarkerView } from './map-markers'
import type { Coordinate, TripMapProps } from './trip-map-types'

const MUMBAI: Coordinate = { lat: 19.076, lng: 72.8777 }
const SINGLE_POINT_DELTA = 0.03 // about 3 km tall
const TOP_PADDING = 90 // room for the banners
const SIDE_PADDING = 60
const BOTTOM_GAP = 40

const toLatLng = (c: Coordinate): LatLng => ({ latitude: c.lat, longitude: c.lng })

/** A custom-view marker. Native maps snapshot the view, so it tracks changes briefly and then stops (cheaper). */
function CustomMarker({ coordinate, version, children }: { coordinate: LatLng; version: string; children: ReactNode }) {
  const [tracking, setTracking] = useState(true)
  useEffect(() => {
    setTracking(true)
    const timer = setTimeout(() => setTracking(false), 600)
    return () => clearTimeout(timer)
  }, [version])
  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking}>
      {children}
    </Marker>
  )
}

/** MapView with the platform's default provider (Apple Maps on iOS, Google Maps on Android). */
export function TripMap({ hospital, assigned, bottomInset, recenterToken }: TripMapProps) {
  const mapRef = useRef<MapView>(null)
  const [ready, setReady] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const fittedOnce = useRef(false)

  const points = [hospital, assigned].filter((p): p is Coordinate => p !== null)
  const center = points[0] ?? MUMBAI
  const fitKey = `${hospital?.lat},${hospital?.lng}|${assigned?.lat},${assigned?.lng}`

  // Fit on first layout, whenever either marker moves (e.g. a new plan), when the card changes height, and on Recenter.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || size.height === 0) return
    const animated = fittedOnce.current
    fittedOnce.current = true

    if (points.length >= 2) {
      map.fitToCoordinates(points.map(toLatLng), {
        edgePadding: { top: TOP_PADDING, right: SIDE_PADDING, bottom: bottomInset + BOTTOM_GAP, left: SIDE_PADDING },
        animated,
      })
    } else {
      // A single point can't be "fitted" (it would zoom all the way in), so centre it in the part above the card.
      const latitudeDelta = SINGLE_POINT_DELTA
      const longitudeDelta = SINGLE_POINT_DELTA * (size.width / size.height)
      const shift = (latitudeDelta * ((bottomInset - TOP_PADDING) / size.height)) / 2
      map.animateToRegion({ latitude: center.lat - shift, longitude: center.lng, latitudeDelta, longitudeDelta }, animated ? 350 : 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, size.height, size.width, fitKey, bottomInset, recenterToken])

  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: SINGLE_POINT_DELTA,
          longitudeDelta: SINGLE_POINT_DELTA,
        }}
        onMapReady={() => setReady(true)}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}>
        {hospital && (
          <CustomMarker coordinate={toLatLng(hospital)} version="hospital">
            <HospitalMarkerView />
          </CustomMarker>
        )}
        {assigned && (
          <CustomMarker coordinate={toLatLng(assigned)} version={`${assigned.label}|${assigned.type}`}>
            <UnitMarkerView label={assigned.label} type={assigned.type} />
          </CustomMarker>
        )}
      </MapView>
    </View>
  )
}
