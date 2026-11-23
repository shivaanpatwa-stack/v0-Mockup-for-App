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
  const maptilerKey = MAPTILER_API_KEY

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
      cursor: pointer;
    }
    .cross-h { width: 18px; height: 4px; background: #ffffff; border-radius: 1px; }
    .cross-v { width: 4px; height: 18px; background: #ffffff; border-radius: 1px; position: absolute; }
    .unit-pin {
      width: 38px; height: 38px; border-radius: 19px;
      border: 2px solid ${colors.accent};
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      cursor: pointer;
      transition: transform 0.15s ease-out;
    }
    .unit-pin:active { transform: scale(0.92); }
    .unit-pin-als { background: ${colors.primary}; }
    .unit-pin-bls { background: ${colors.card}; }
    .unit-pin-als svg { stroke: #ffffff; }
    .unit-pin-bls svg { stroke: ${colors.accent}; }

    /* Custom Leaflet Dark Popup */
    .leaflet-popup-content-wrapper {
      background: #181c1b !important;
      color: #f0f3f1 !important;
      border: 1px solid rgba(255, 255, 255, 0.18) !important;
      border-radius: 10px !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.7) !important;
      padding: 0 !important;
    }
    .leaflet-popup-tip {
      background: #181c1b !important;
      border: 1px solid rgba(255, 255, 255, 0.18) !important;
      box-shadow: none !important;
    }
    .leaflet-popup-content {
      margin: 10px 14px !important;
      line-height: 1.4 !important;
    }
    .unit-popup {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .unit-popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .unit-popup-title {
      font-size: 14px;
      font-weight: 800;
      color: #ffffff;
      white-space: nowrap;
    }
    .unit-popup-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .badge-als { background: rgba(61,187,133,0.18); color: #3dbb85; }
    .badge-bls { background: rgba(180,196,209,0.18); color: #b4c4d1; }
    .unit-popup-meta {
      font-size: 12px;
      color: #b0b8b5;
      margin-top: 3px;
    }
    .unit-popup-ward {
      font-size: 11px;
      color: #3dbb85;
      font-weight: 600;
      margin-top: 3px;
    }
    .leaflet-container a.leaflet-popup-close-button {
      display: none;
    }
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
        if (data.hospital.name) {
          hospitalMarker.bindPopup('<div class="unit-popup"><div class="unit-popup-header"><span class="unit-popup-title">' + data.hospital.name + '</span><span class="unit-popup-badge badge-als">Base</span></div><div class="unit-popup-meta">Hospital Base / Dispatch Station</div></div>', {
            offset: [0, -17],
            closeButton: false,
            autoClose: true,
            closeOnClick: true
          });
        }
        bounds.push([data.hospital.lat, data.hospital.lng]);
      }

      if (data.assigned) {
        var isAls = data.assigned.type === 'ALS';
        var ambulanceSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M10 10H6"/>' +
          '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>' +
          '<path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14"/>' +
          '<path d="M8 8v4"/>' +
          '<path d="M9 18h6"/>' +
          '<circle cx="17" cy="18" r="2"/>' +
          '<circle cx="7" cy="18" r="2"/>' +
        '</svg>';

        var uIcon = L.divIcon({
          className: '',
          html: '<div class="unit-pin ' + (isAls ? 'unit-pin-als' : 'unit-pin-bls') + '">' + ambulanceSvg + '</div>',
          iconSize: [38, 38],
          iconAnchor: [19, 19]
        });
        unitMarker = L.marker([data.assigned.lat, data.assigned.lng], { icon: uIcon }).addTo(map);

        var callSignText = data.assigned.callSign || data.assigned.label || 'Assigned Unit';
        var popupHtml = '<div class="unit-popup">' +
          '<div class="unit-popup-header">' +
            '<span class="unit-popup-title">Unit ' + callSignText + '</span>' +
            '<span class="unit-popup-badge ' + (isAls ? 'badge-als' : 'badge-bls') + '">' + (data.assigned.type || 'ALS') + '</span>' +
          '</div>' +
          (data.assigned.name ? '<div class="unit-popup-meta">' + data.assigned.name + '</div>' : '') +
          (data.assigned.wardCode ? '<div class="unit-popup-ward">Ward ' + data.assigned.wardCode + '</div>' : '') +
        '</div>';

        unitMarker.bindPopup(popupHtml, {
          offset: [0, -18],
          closeButton: false,
          autoClose: true,
          closeOnClick: true
        });

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
