import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { colors } from '@/constants'
import { MAPTILER_API_KEY } from '@/lib/config'
import type { Coordinate, TripMapProps } from './trip-map-types'

const MUMBAI: Coordinate = { lat: 19.076, lng: 72.8777 }

export function TripMap({ hospital, assigned, routePoints, bottomInset, recenterToken }: TripMapProps) {
  const webViewRef = useRef<any>(null)
  const isLoaded = useRef(false)

  const center = hospital ?? assigned ?? MUMBAI
  const maptilerKey = MAPTILER_API_KEY || 'MdQagm10D4jYnvqiImfB'

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #111413; }
    .hospital-pin {
      width: 34px; height: 34px; border-radius: 8px;
      background: ${colors.primary};
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      position: relative;
    }
    .cross-h { width: 18px; height: 4px; background: #ffffff; border-radius: 1px; }
    .cross-v { width: 4px; height: 18px; background: #ffffff; border-radius: 1px; position: absolute; }
    .unit-pin {
      min-width: 44px; height: 38px; padding: 0 10px; border-radius: 19px;
      border: 2px solid ${colors.primary};
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px; font-weight: 800;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      white-space: nowrap;
    }
    .unit-pin-als { background: ${colors.primary}; color: #ffffff; }
    .unit-pin-bls { background: ${colors.card}; color: ${colors.accent}; }
    .leaflet-control-attribution { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([${center.lat}, ${center.lng}], 13);

    // MapTiler Dataviz Dark Basemap
    var tileUrl = 'https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}.png?key=${maptilerKey}';
    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: ''
    }).addTo(map);

    setTimeout(function() {
      map.invalidateSize();
    }, 250);

    var hospitalMarker = null;
    var unitMarker = null;
    var routePolyline = null;

    function updateMap(data) {
      if (!map) return;
      map.invalidateSize();
      if (hospitalMarker) { map.removeLayer(hospitalMarker); hospitalMarker = null; }
      if (unitMarker) { map.removeLayer(unitMarker); unitMarker = null; }
      if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }

      var bounds = [];

      if (data.hospital) {
        var hIcon = L.divIcon({
          className: '',
          html: '<div class="hospital-pin"><div class="cross-h"></div><div class="cross-v"></div></div>',
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });
        hospitalMarker = L.marker([data.hospital.lat, data.hospital.lng], { icon: hIcon }).addTo(map);
        bounds.push([data.hospital.lat, data.hospital.lng]);
      }

      if (data.assigned) {
        var isAls = data.assigned.type === 'ALS';
        var uIcon = L.divIcon({
          className: '',
          html: '<div class="unit-pin ' + (isAls ? 'unit-pin-als' : 'unit-pin-bls') + '">' + data.assigned.label + '</div>',
          iconSize: [44, 38],
          iconAnchor: [22, 19]
        });
        unitMarker = L.marker([data.assigned.lat, data.assigned.lng], { icon: uIcon }).addTo(map);
        bounds.push([data.assigned.lat, data.assigned.lng]);
      }

      if (data.routePoints && data.routePoints.length >= 2) {
        var latlngs = data.routePoints.map(function(p) { return [p.lat, p.lng]; });
        routePolyline = L.polyline(latlngs, {
          color: '${colors.accent}',
          weight: 4,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
      }

      if (bounds.length >= 2) {
        map.fitBounds(bounds, {
          paddingTopLeft: [60, 90],
          paddingBottomRight: [60, (data.bottomInset || 120) + 40],
          animate: true
        });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 14, { animate: true });
      }
    }

    window.updateMap = updateMap;
  </script>
</body>
</html>
`

  const payload = JSON.stringify({
    hospital,
    assigned,
    routePoints,
    bottomInset,
  })

  useEffect(() => {
    if (!isLoaded.current) return
    const js = `window.updateMap && window.updateMap(${payload}); true;`
    webViewRef.current?.injectJavaScript(js)
  }, [payload, recenterToken])

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.webView}
        containerStyle={styles.container}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onLoadEnd={() => {
          isLoaded.current = true
          const js = `window.updateMap && window.updateMap(${payload}); true;`
          webViewRef.current?.injectJavaScript(js)
        }}
        scrollEnabled={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  webView: { flex: 1, backgroundColor: colors.bg },
})
