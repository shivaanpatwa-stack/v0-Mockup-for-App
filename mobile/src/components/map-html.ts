import { colors } from '@/constants'
import { CARTO_API_KEY } from '@/lib/config'

export type MapPoint = { lat: number; lng: number; label: string }

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4'

// Same CARTO Positron tiles as the web dashboard when a key is configured; plain OSM tiles otherwise
// (CARTO serves a watermark without a key).
const TILES = CARTO_API_KEY
  ? {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }
  : {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      attribution: '&copy; OpenStreetMap contributors',
    }

// JSON inside an inline <script>: "<" must not be able to close the tag.
const embed = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

export function buildMapHtml(assigned: MapPoint | null, base: MapPoint | null) {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css">
<style>
  html,body,#map{height:100%;margin:0;background:#E7EEF0}
  .leaflet-tooltip{font:600 12px -apple-system,Roboto,sans-serif;color:${colors.primary};border:1px solid ${colors.border};border-radius:8px;box-shadow:none;white-space:normal;max-width:150px;width:max-content}
  .pin{width:18px;height:18px;border-radius:50%;background:${colors.blue};border:3px solid #fff;box-shadow:0 0 0 7px rgba(37,99,235,.22)}
  .base{width:26px;height:26px;border-radius:7px;background:#fff;border:1px solid ${colors.border};color:${colors.red};font:900 22px/24px sans-serif;text-align:center}
</style></head><body><div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>
  var assigned = ${embed(assigned)};
  var base = ${embed(base)};
  var map = L.map('map', { zoomControl: false });
  L.tileLayer(${embed(TILES.url)}, { subdomains: ${embed(TILES.subdomains)}, maxZoom: 19, attribution: ${embed(TILES.attribution)} }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
  var points = [];
  function add(point, className, html, direction) {
    if (!point) return;
    var el = document.createElement('span');
    el.textContent = point.label;
    L.marker([point.lat, point.lng], { icon: L.divIcon({ className: '', html: '<div class="' + className + '">' + html + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .addTo(map).bindTooltip(el, { permanent: true, direction: direction, offset: [0, direction === 'top' ? -4 : 4] });
    points.push([point.lat, point.lng]);
  }
  add(base, 'base', '+', 'top');
  add(assigned, 'pin', '', 'bottom');
  if (points.length > 1) map.fitBounds(points, { padding: [80, 50], maxZoom: 16 });
  else if (points.length === 1) map.setView(points[0], 15);
  else map.setView([19.076, 72.8777], 11);
</script></body></html>`
}
