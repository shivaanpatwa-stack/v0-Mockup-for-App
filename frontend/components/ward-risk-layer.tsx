'use client'

import { useEffect, useRef, useState } from 'react'
import { GeoJSON, useMap } from 'react-leaflet'
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { layerGroup, tooltip, type GeoJSON as LeafletGeoJSON, type Layer, type LeafletMouseEvent, type Path, type PathOptions } from 'leaflet'
import { getDemandScores } from '@/lib/api'
import { DEMAND_COLORS, DEMAND_DESCRIPTION, DEMAND_LABEL, demandLevel, mapColor } from '@/lib/map-theme'
import { getBundledScoresForHour } from '@/lib/ward-risk-data'
import { WARD_NAMES } from '@/lib/ward-names'

// Display copy simplified to ~40 m (27 KB instead of 924 KB); the original stays for reference.
const GEOJSON_URL = '/data/wards_simplified.geojson'

const FETCH_DEBOUNCE_MS = 250
const WARD_FILL_OPACITY = 0.55
const WARD_LABEL_MIN_ZOOM = 11
const WARD_LABEL_PANE = 'ward-labels'
const WARD_LABEL_PANE_Z = '455'

type RiskLookup = Record<string, number>

export function riskColor(score: number): string {
  const level = demandLevel(score)
  return DEMAND_COLORS[level] || mapColor('no-data')
}

const wardCode = (feature?: Feature): string | undefined => feature?.properties?.ward_code

function wardStyle(feature: Feature | undefined, scores: RiskLookup | null, showDemand = true): PathOptions {
  const code = wardCode(feature)
  const score = code && scores ? scores[code] : undefined
  const fill = score !== undefined ? riskColor(score) : mapColor('no-data')

  return {
    color: '#111413', // thin canvas-coloured ward borders
    opacity: 0.9,
    weight: 1,
    fillColor: fill,
    fillOpacity: showDemand ? WARD_FILL_OPACITY : 0.05,
  }
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)

function wardTooltipHtml(code: string | undefined, score: number | undefined, showRisk = true) {
  const title = `<strong>Ward ${escapeHtml(code ?? '?')}</strong>`
  if (score === undefined) return `${title}<div class="map-tooltip-muted">Risk score n/a</div>`
  if (!showRisk) return `${title}`
  const level = demandLevel(score)
  const desc = DEMAND_DESCRIPTION[level]
  const area = WARD_NAMES[code ?? ''] ? `<div class="map-tooltip-muted">${escapeHtml(WARD_NAMES[code ?? ''])}</div>` : ''
  return `${title}${area}<div class="map-tooltip-row"><span>Predicted demand</span><span class="mono">${score.toFixed(2)} · ${DEMAND_LABEL[level]}</span></div><div class="map-tooltip-muted">${desc.range} band · simulated</div>`
}

/** Shoelace area (signed) and centroid of one ring of [lng, lat] points. */
function ringCentroid(ring: Position[]): { area: number; lng: number; lat: number } {
  let twiceArea = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j]
    const [x1, y1] = ring[i]
    const cross = x0 * y1 - x1 * y0
    twiceArea += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  if (twiceArea === 0) return { area: 0, lng: ring[0]?.[0] ?? 0, lat: ring[0]?.[1] ?? 0 }
  return { area: Math.abs(twiceArea / 2), lng: cx / (3 * twiceArea), lat: cy / (3 * twiceArea) }
}

/**
 * Where to put a ward's code: the area-weighted centroid of its largest polygon's outer ring.
 */
function labelPoint(geometry: Geometry | null): [number, number] | null {
  const polygons =
    geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : []
  let best: { area: number; lng: number; lat: number } | null = null
  for (const polygon of polygons) {
    const c = ringCentroid(polygon[0] ?? [])
    if (!best || c.area > best.area) best = c
  }
  return best ? [best.lat, best.lng] : null
}

/** Permanent ward-code labels, shown only when zoomed in far enough to read them. */
function WardCodeLabels({ zones }: { zones: FeatureCollection }) {
  const map = useMap()
  useEffect(() => {
    if (!map.getPane(WARD_LABEL_PANE)) {
      const pane = map.createPane(WARD_LABEL_PANE)
      pane.style.zIndex = WARD_LABEL_PANE_Z
      pane.style.pointerEvents = 'none'
    }
    const labels = layerGroup(
      zones.features.flatMap((feature) => {
        const code = wardCode(feature)
        const at = labelPoint(feature.geometry)
        if (!code || !at) return []
        const text = document.createElement('span')
        text.textContent = code
        return [
          tooltip({
            permanent: true,
            direction: 'center',
            interactive: false,
            className: 'ward-code-label',
            pane: WARD_LABEL_PANE,
          })
            .setLatLng(at)
            .setContent(text),
        ]
      }),
    )
    const sync = () => {
      const show = map.getZoom() >= WARD_LABEL_MIN_ZOOM
      if (show && !map.hasLayer(labels)) labels.addTo(map)
      else if (!show && map.hasLayer(labels)) map.removeLayer(labels)
    }
    sync()
    map.on('zoomend', sync)
    return () => {
      map.off('zoomend', sync)
      map.removeLayer(labels)
    }
  }, [map, zones])
  return null
}

export default function WardRiskLayer({
  hour,
  showDemand = true,
  showRisk = true,
}: {
  hour: number
  showDemand?: boolean
  showRisk?: boolean
}) {
  const [zones, setZones] = useState<FeatureCollection | null>(null)

  // 1. Initialize immediately with bundled risk scores so the map NEVER mounts without colors!
  const [scores, setScores] = useState<RiskLookup>(() => getBundledScoresForHour(hour))
  const [loadFailed, setLoadFailed] = useState(false)
  const layerRef = useRef<LeafletGeoJSON | null>(null)
  const scoresRef = useRef<RiskLookup>(scores)

  // Load GeoJSON polygons
  useEffect(() => {
    fetch(GEOJSON_URL)
      .then((res) => res.json())
      .then(setZones)
      .catch((err) => console.error('Failed to load ward boundaries', err))
  }, [])

  // Keep scores updated whenever hour changes
  useEffect(() => {
    // Immediate fallback update
    const bundled = getBundledScoresForHour(hour)
    setScores(bundled)
    scoresRef.current = bundled

    // Optional background refresh from backend API
    const controller = new AbortController()
    const timer = setTimeout(() => {
      getDemandScores(hour, controller.signal)
        .then((rows) => {
          if (rows && rows.length > 0) {
            const fresh = Object.fromEntries(rows.map((r) => [r.ward_code, r.risk_score]))
            setScores(fresh)
            scoresRef.current = fresh
            setLoadFailed(false)
          }
        })
        .catch((err) => {
          if ((err as Error).name === 'AbortError') return
          // Non-fatal because we already have bundled scores
          setLoadFailed(false)
        })
    }, FETCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [hour])

  // Restyle the existing layer whenever scores, showDemand change
  useEffect(() => {
    scoresRef.current = scores
    layerRef.current?.eachLayer((layer) => {
      const path = layer as Path & { feature?: Feature }
      path.setStyle(wardStyle(path.feature, scores, showDemand))
    })
  }, [scores, showDemand])

  if (!zones) return null

  const onEachFeature = (feature: Feature, layer: Layer) => {
    layer.bindTooltip(
      () => {
        const code = wardCode(feature)
        return wardTooltipHtml(code, code ? scoresRef.current[code] : undefined, showRisk)
      },
      { sticky: true, className: 'map-tooltip' },
    )
    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        const path = e.target as Path
        // Highlight active ward with dark navy outline
        path.setStyle({ weight: 2, color: '#e8ebe9', opacity: 1 })
        path.bringToFront()
      },
      mouseout: (e: LeafletMouseEvent) => {
        ;(e.target as Path).setStyle(wardStyle(feature, scoresRef.current, showDemand))
      },
    })
  }

  return (
    <>
      <GeoJSON
        key={`ward-layer-${hour}-${showDemand}`}
        ref={layerRef}
        data={zones}
        style={(feature) => wardStyle(feature, scores, showDemand)}
        onEachFeature={onEachFeature}
      />
      {showRisk && <WardCodeLabels zones={zones} />}
      {loadFailed && (
        <div className="ward-scores-note" role="status">
          Couldn&apos;t load live ward scores
        </div>
      )}
    </>
  )
}
