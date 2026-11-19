'use client'

import { useEffect, useRef, useState } from 'react'
import type { FeatureCollection, Position } from 'geojson'
import { WARD_HOUR_RISK_SCORES } from '@/lib/ward-risk-data'
import { WARD_CENTROIDS } from '@/lib/ward-names'

// Plain canvas, no map library: 24 real ward outlines (27 KB) coloured by the simulated demand for
// each hour, and three units easing toward the busiest wards. Static frame under reduced motion and
// on small screens; paused while off-screen.
const RAMP = ['#3b5266', '#4f6f8f', '#6b90b4', '#93b3d3']
const level = (s: number) => (s < 0.2 ? 0 : s <= 0.46 ? 1 : s <= 0.7 ? 2 : 3)
const BASE = { lat: 19.0176, lng: 72.8562 } // example hospital, Parel
const HOUR_MS = 1500

export type HeroKpis = {
  avg_response_min: { before: number | null; after: number | null }
  demand_within_20_min_pct: { before: number | null; after: number | null }
  wards_covered_20_min: { before: number; after: number; total: number }
}

// Citywide predicted demand per hour (sum of the ward scores): the bars on the right of the hero.
const HOURLY_DEMAND = Array.from({ length: 24 }, (_, h) => Object.values(WARD_HOUR_RISK_SCORES[h] ?? {}).reduce((s, v) => s + v, 0))
const MAX_DEMAND = Math.max(...HOURLY_DEMAND, 1)

function topWards(hour: number, n: number) {
  return Object.entries(WARD_HOUR_RISK_SCORES[hour] ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => WARD_CENTROIDS[w])
    .filter(Boolean)
}

export default function CityBand({ kpis, hospitalLabel }: { kpis: HeroKpis; hospitalLabel: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hour, setHour] = useState(18)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let wards: FeatureCollection | null = null
    let raf = 0
    let visible = true
    let stopped = false
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches || innerWidth < 760
    const units = topWards(18, 3).map((c) => ({ lat: c.lat, lng: c.lng }))
    let shownHour = -1

    const bounds = { minLat: 18.89, maxLat: 19.28, minLng: 72.77, maxLng: 72.99 }
    const project = (lng: number, lat: number, w: number, h: number) => {
      // The canvas is the middle column of the hero: fit the city inside it and centre it.
      const spanLng = bounds.maxLng - bounds.minLng
      const spanLat = bounds.maxLat - bounds.minLat
      const scale = Math.min((w * 0.92) / spanLng, (h * 0.92) / spanLat)
      const x = (w - spanLng * scale) / 2 + (lng - bounds.minLng) * scale
      const y = (h - spanLat * scale) / 2 + (bounds.maxLat - lat) * scale
      return [x, y] as const
    }

    const draw = (t: number) => {
      const dpr = Math.min(devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const hr = still ? 18 : Math.floor(t / HOUR_MS) % 24
      if (hr !== shownHour) {
        shownHour = hr
        setHour(hr)
      }
      const scores = WARD_HOUR_RISK_SCORES[hr] ?? {}
      if (wards) {
        for (const f of wards.features) {
          const code = f.properties?.ward_code as string
          const g = f.geometry
          if (g.type !== 'MultiPolygon') continue
          ctx.beginPath()
          for (const poly of g.coordinates) {
            const ring = poly[0] as Position[]
            ring.forEach(([lng, lat], i) => {
              const [x, y] = project(lng, lat, w, h)
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.closePath()
          }
          ctx.fillStyle = RAMP[level(scores[code] ?? 0)]
          ctx.globalAlpha = 0.85
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.strokeStyle = '#111413'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
      const targets = topWards(hr, 3)
      const [bx, by] = project(BASE.lng, BASE.lat, w, h)
      units.forEach((u, i) => {
        const target = targets[i]
        if (target && !still) {
          u.lat += (target.lat - u.lat) * 0.03
          u.lng += (target.lng - u.lng) * 0.03
        }
        const [x, y] = project(u.lng, u.lat, w, h)
        ctx.strokeStyle = 'rgba(232,235,233,0.35)'
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(x, y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#e8ebe9'
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#111413'
        ctx.lineWidth = 2
        ctx.stroke()
      })
      ctx.fillStyle = '#007a51'
      ctx.fillRect(bx - 6, by - 6, 12, 12)
      if (!still && visible && !stopped) raf = requestAnimationFrame(draw)
    }

    fetch('/data/wards_simplified.geojson')
      .then((r) => r.json())
      .then((g) => {
        wards = g
        raf = requestAnimationFrame(draw)
      })
      .catch(() => undefined)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible && !still && wards) raf = requestAnimationFrame(draw)
    })
    io.observe(canvas)
    const onResize = () => wards && requestAnimationFrame(draw)
    addEventListener('resize', onResize)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      io.disconnect()
      removeEventListener('resize', onResize)
    }
  }, [])

  const avg = kpis.avg_response_min
  const reach = kpis.demand_within_20_min_pct
  const wardsCovered = kpis.wards_covered_20_min
  const saved = avg.before != null && avg.after != null ? avg.before - avg.after : null

  return (
    <>
      <div className="band-map">
        <canvas ref={ref} aria-hidden="true" />
      </div>
      <div className="band-stats">
        <p className="band-stats-label">Simulated · {hospitalLabel}</p>
        <div className="band-card">
          <span className="band-card-label">Avg response</span>
          <span className="band-card-row">
            {avg.before != null && <s className="band-card-was">{avg.before.toFixed(1)}</s>}
            <span aria-hidden="true" className="band-card-arrow">→</span>
            <span className="band-card-big">{avg.after?.toFixed(1)}</span>
            <span className="band-card-unit">min</span>
            {saved != null && saved > 0 && <span className="band-card-gain">−{saved.toFixed(1)}</span>}
          </span>
        </div>
        <div className="band-card-pair">
          <div className="band-card">
            <span className="band-card-label">Reachable in 20 min</span>
            <span><span className="band-card-mid">{Math.round(reach.after ?? 0)}</span><span className="band-card-unit"> %</span></span>
            <span className="band-card-gain">from {Math.round(reach.before ?? 0)}%</span>
          </div>
          <div className="band-card">
            <span className="band-card-label">Wards covered</span>
            <span><span className="band-card-mid">{wardsCovered.after}</span><span className="band-card-unit"> of {wardsCovered.total}</span></span>
            <span className="band-card-gain">from {wardsCovered.before}</span>
          </div>
        </div>
        <div className="band-card" aria-hidden="true">
          <span className="band-card-label band-card-head">
            Demand by hour <span className="hour">{String(hour).padStart(2, '0')}:00</span>
          </span>
          <span className="band-bars">
            {HOURLY_DEMAND.map((v, h) => (
              <span key={h} className={h === hour ? 'is-now' : undefined} style={{ height: `${Math.max(8, Math.round((v / MAX_DEMAND) * 100))}%` }} />
            ))}
          </span>
          <span className="band-bars-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></span>
        </div>
      </div>
      <p className="band-caption" aria-hidden="true">
        <span className="hour">{String(hour).padStart(2, '0')}:00</span>
        <span>Simulated demand by ward · units move toward the busiest wards (illustration)</span>
      </p>
    </>
  )
}
