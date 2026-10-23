'use client'

import { useEffect, useRef, useState } from 'react'
import { GeoJSON, useMap } from 'react-leaflet'
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { layerGroup, tooltip, type GeoJSON as LeafletGeoJSON, type Layer, type LeafletMouseEvent, type Path, type PathOptions } from 'leaflet'
import { getDemandScores } from '@/lib/api'
import { DEMAND_LABEL, demandLevel, mapColor } from '@/lib/map-theme'

const GEOJSON_URL = '/data/zones_full_features_final.geojson'

const FETCH_DEBOUNCE_MS = 300
const WARD_FILL_OPACITY = 0.4
const WARD_LABEL_MIN_ZOOM = 11
// Ward codes sit above street labels (450) but below radius circles (460) and markers (600).
const WARD_LABEL_PANE = 'ward-labels'
const WARD_LABEL_PANE_Z = '455'

type RiskLookup = Record<string, number>

export function riskColor(score: number) {
  return mapColor(demandLevel(score))
}

const wardCode = (feature?: Feature): string | undefined => feature?.properties?.ward_code

function wardStyle(feature: Feature | undefined, scores: RiskLookup | null): PathOptions {
  const code = wardCode(feature)
  const score = code && scores ? scores[code] : undefined
  return {
    color: '#ffffff',
    opacity: 0.9,
    weight: 1,
    fillColor: score === undefined ? mapColor('no-data') : riskColor(score),
    fillOpacity: WARD_FILL_OPACITY,
  }
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)

function wardTooltipHtml(code: string | undefined, score: number | undefined) {
  const title = `<strong>Ward ${escapeHtml(code ?? '?')}</strong>`
  if (score === undefined) return `${title}<div class="map-tooltip-muted">Risk score n/a</div>`
  const level = demandLevel(score)
  return `<div class="map-tooltip-row">${title}<span class="demand-chip demand-${level}">${DEMAND_LABEL[level]}</span></div><div class="map-tooltip-muted">Risk score ${score.toFixed(2)}</div>`
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
 * Where to put a ward's code: the area-weighted centroid of its largest polygon's outer ring. Using
 * the largest part (not all parts) keeps the label on land for wards with small islands.
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
        return [tooltip({ permanent: true, direction: 'center', interactive: false, className: 'ward-code-label', pane: WARD_LABEL_PANE }).setLatLng(at).setContent(text)]
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

// Stable identity on purpose: react-leaflet re-applies `style` whenever the prop changes, and
// the restyle effect below already handles new scores. Wards start grey until scores arrive.
const initialStyle = (feature?: Feature) => wardStyle(feature, null)

export default function WardRiskLayer({ hour }: { hour: number }) {
  const [zones, setZones] = useState<FeatureCollection | null>(null)
  const [scores, setScores] = useState<RiskLookup | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const layerRef = useRef<LeafletGeoJSON | null>(null)
  // Read by the tooltip callback, which Leaflet calls outside React renders.
  const scoresRef = useRef<RiskLookup | null>(null)

  useEffect(() => {
    fetch(GEOJSON_URL)
      .then((res) => res.json())
      .then(setZones)
      .catch((err) => console.error('Failed to load ward boundaries', err))
  }, [])

  // Previous scores stay on the map until the new hour's scores arrive, or if they fail.
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      getDemandScores(hour, controller.signal)
        .then((rows) => {
          setScores(Object.fromEntries(rows.map((r) => [r.ward_code, r.risk_score])))
          setLoadFailed(false)
        })
        .catch((err) => {
          if ((err as Error).name === 'AbortError') return
          console.error('Failed to load ward scores', err)
          setLoadFailed(true)
        })
    }, FETCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [hour])

  // Restyle the existing layer in place: remounting <GeoJSON> would make the wards flicker.
  useEffect(() => {
    scoresRef.current = scores
    layerRef.current?.eachLayer((layer) => {
      const path = layer as Path & { feature?: Feature }
      path.setStyle(wardStyle(path.feature, scores))
    })
  }, [scores, zones])

  if (!zones) return null

  const onEachFeature = (feature: Feature, layer: Layer) => {
    // A function, so the tooltip shows the current score each time it opens.
    layer.bindTooltip(
      () => {
        const code = wardCode(feature)
        return wardTooltipHtml(code, code ? scoresRef.current?.[code] : undefined)
      },
      { sticky: true, className: 'map-tooltip' },
    )
    // Hover outline. mouseout restores the style from the current scores, matching the restyle effect.
    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        const path = e.target as Path
        path.setStyle({ weight: 2, color: mapColor('navy'), opacity: 1 })
        path.bringToFront()
      },
      mouseout: (e: LeafletMouseEvent) => {
        ;(e.target as Path).setStyle(wardStyle(feature, scoresRef.current))
      },
    })
  }

  return (
    <>
      <GeoJSON ref={layerRef} data={zones} style={initialStyle} onEachFeature={onEachFeature} />
      <WardCodeLabels zones={zones} />
      {loadFailed && (
        <div className="ward-scores-note" role="status">
          Couldn&apos;t load ward scores
        </div>
      )}
    </>
  )
}
