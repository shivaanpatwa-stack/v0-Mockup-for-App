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

function topWards(hour: number, n: number) {
  return Object.entries(WARD_HOUR_RISK_SCORES[hour] ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => WARD_CENTROIDS[w])
    .filter(Boolean)
}

export default function CityBand() {
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
      // The city sits in the right ~55% of the band on wide screens, centred on narrow ones.
      const areaW = w > 900 ? w * 0.5 : w * 0.9
      const left = w > 900 ? w * 0.46 : w * 0.05
      const scale = Math.min(areaW / (bounds.maxLng - bounds.minLng), (h * 0.9) / (bounds.maxLat - bounds.minLat))
      const x = left + (lng - bounds.minLng) * scale
      const y = h * 0.05 + (bounds.maxLat - lat) * scale
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

  return (
    <>
      <canvas ref={ref} aria-hidden="true" />
      <p className="band-caption" aria-hidden="true">
        <span className="hour">{String(hour).padStart(2, '0')}:00</span>
        <span>Simulated demand by ward · units move toward the busiest wards (illustration)</span>
      </p>
    </>
  )
}
