/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-leaflet 5.0.0 creates a second Leaflet map on the same container under
  // StrictMode's double ref callback ("Map container is being reused").
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
