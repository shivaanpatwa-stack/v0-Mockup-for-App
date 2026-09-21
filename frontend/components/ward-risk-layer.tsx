'use client'

import { useEffect, useState } from 'react'
import { GeoJSON } from 'react-leaflet'
import type { Feature, FeatureCollection } from 'geojson'
import type { Layer, PathOptions } from 'leaflet'

const GEOJSON_URL = '/data/zones_full_features_final.geojson'
const CSV_URL = '/data/ward_hour_risk_scores.csv'

type RiskLookup = Record<string, number>

export function riskColor(score: number) {
  if (score < 0.33) return '#22C55E'
  if (score <= 0.66) return '#F59E0B'
  return '#EF4444'
}

// Builds ward_code -> risk_score_noisy for a single hour. The CSV has no quoted fields.
function parseRiskCsv(text: string, hour: number): RiskLookup {
  const [header, ...rows] = text.trim().split(/\r?\n/)
  const cols = header.split(',')
  const codeIdx = cols.indexOf('ward_code')
  const hourIdx = cols.indexOf('hour')
  const scoreIdx = cols.indexOf('risk_score_noisy')

  const lookup: RiskLookup = {}
  for (const row of rows) {
    const cells = row.split(',')
    if (Number(cells[hourIdx]) === hour) lookup[cells[codeIdx]] = Number(cells[scoreIdx])
  }
  return lookup
}

// Later, swap the CSV fetch for the live API; `hour` can then come from a slider.
export default function WardRiskLayer({ hour = 21 }: { hour?: number }) {
  const [zones, setZones] = useState<FeatureCollection | null>(null)
  const [scores, setScores] = useState<RiskLookup | null>(null)

  useEffect(() => {
    fetch(GEOJSON_URL)
      .then((res) => res.json())
      .then(setZones)
      .catch((err) => console.error('Failed to load ward boundaries', err))
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(CSV_URL)
      .then((res) => res.text())
      .then((text) => !cancelled && setScores(parseRiskCsv(text, hour)))
      .catch((err) => console.error('Failed to load ward risk scores', err))
    return () => {
      cancelled = true
    }
  }, [hour])

  if (!zones || !scores) return null

  const scoreFor = (feature?: Feature) => scores[feature?.properties?.ward_code]

  const style = (feature?: Feature): PathOptions => {
    const score = scoreFor(feature)
    return {
      color: '#ffffff',
      weight: 1,
      fillColor: score === undefined ? '#94A3B8' : riskColor(score),
      fillOpacity: 0.5,
    }
  }

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const score = scoreFor(feature)
    layer.bindTooltip(
      `<strong>Ward ${feature.properties?.ward_code}</strong><br/>Risk score: ${
        score === undefined ? 'n/a' : score.toFixed(2)
      }`,
      { sticky: true },
    )
  }

  return <GeoJSON key={hour} data={zones} style={style} onEachFeature={onEachFeature} />
}
