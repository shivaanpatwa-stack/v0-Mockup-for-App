'use client'

import { useEffect, useRef, useState } from 'react'
import { GeoJSON } from 'react-leaflet'
import type { Feature, FeatureCollection } from 'geojson'
import type { GeoJSON as LeafletGeoJSON, Layer, Path, PathOptions } from 'leaflet'
import { getDemandScores } from '@/lib/api'

const GEOJSON_URL = '/data/zones_full_features_final.geojson'

// risk_score bands: below LOW_MAX is low, LOW_MAX..HIGH_MIN is medium, above HIGH_MIN is high.
const LOW_MAX = 0.2
const HIGH_MIN = 0.46
const LOW_COLOR = '#22C55E'
const MEDIUM_COLOR = '#F59E0B'
const HIGH_COLOR = '#EF4444'
const NO_SCORE_COLOR = '#94A3B8'

const FETCH_DEBOUNCE_MS = 300

type RiskLookup = Record<string, number>

export function riskColor(score: number) {
  if (score < LOW_MAX) return LOW_COLOR
  if (score <= HIGH_MIN) return MEDIUM_COLOR
  return HIGH_COLOR
}

const wardCode = (feature?: Feature): string | undefined => feature?.properties?.ward_code

function wardStyle(feature: Feature | undefined, scores: RiskLookup | null): PathOptions {
  const code = wardCode(feature)
  const score = code && scores ? scores[code] : undefined
  return {
    color: '#ffffff',
    weight: 1,
    fillColor: score === undefined ? NO_SCORE_COLOR : riskColor(score),
    fillOpacity: 0.5,
  }
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
        const score = code ? scoresRef.current?.[code] : undefined
        return `<strong>Ward ${code ?? '?'}</strong><br/>Risk score: ${score === undefined ? 'n/a' : score.toFixed(2)}`
      },
      { sticky: true },
    )
  }

  return (
    <>
      <GeoJSON ref={layerRef} data={zones} style={initialStyle} onEachFeature={onEachFeature} />
      {loadFailed && (
        <div className="ward-scores-note" role="status">
          Couldn&apos;t load ward scores
        </div>
      )}
    </>
  )
}
