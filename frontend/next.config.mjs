const isDev = process.env.NODE_ENV !== 'production'

// Every origin the browser loads from besides this site. Add to this list when adding one.
const MAP_TILES = 'https://*.basemaps.cartocdn.com' // basemap tiles (lib/map-tiles.ts)
const GEOCODER = 'https://nominatim.openstreetmap.org' // address search on /register

const csp = [
  "default-src 'self'",
  // Next.js inlines small bootstrap scripts; dev mode also needs eval for fast refresh.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // Leaflet positions tiles and markers with inline styles.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${MAP_TILES}`,
  `connect-src 'self' ${GEOCODER}${isDev ? ' ws: wss:' : ''}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing in the app uses these.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Only over HTTPS in production; on http://localhost browsers would ignore it anyway.
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-leaflet 5.0.0 creates a second Leaflet map on the same container under
  // StrictMode's double ref callback ("Map container is being reused").
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
