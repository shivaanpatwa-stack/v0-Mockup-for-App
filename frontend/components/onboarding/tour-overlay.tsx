'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { TOUR_STEPS, type Placement, type TourStep } from './config'
import { useDialogKeys } from './use-dialog-keys'

type Box = { top: number; left: number; width: number; height: number }

/** How long to wait for a step's element to appear (the map loads late) before skipping that step. */
const FIND_TIMEOUT_MS = 2000
const MARGIN = 12
const GAP = 14
const DEFAULT_PLACEMENT: Placement[] = ['bottom', 'top', 'right', 'left']

/** The first matching element that is actually visible: the desktop and mobile navs share one `data-tour` name. */
function findTarget(name: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)
  for (const el of candidates) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el
  }
  return null
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (a !== null && b !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))

/** Pick a side of the target where the tooltip fits; null means none does (huge target or tiny screen). */
function placeTip(box: Box, tip: { w: number; h: number }, order: Placement[]): { top: number; left: number } | null {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const centredLeft = clamp(cx - tip.w / 2, MARGIN, vw - tip.w - MARGIN)
  const centredTop = clamp(cy - tip.h / 2, MARGIN, vh - tip.h - MARGIN)
  for (const p of [...order, ...DEFAULT_PLACEMENT.filter((d) => !order.includes(d))]) {
    if (p === 'bottom' && box.top + box.height + GAP + tip.h <= vh - MARGIN) return { top: box.top + box.height + GAP, left: centredLeft }
    if (p === 'top' && box.top - GAP - tip.h >= MARGIN) return { top: box.top - GAP - tip.h, left: centredLeft }
    if (p === 'right' && box.left + box.width + GAP + tip.w <= vw - MARGIN) return { top: centredTop, left: box.left + box.width + GAP }
    if (p === 'left' && box.left - GAP - tip.w >= MARGIN) return { top: centredTop, left: box.left - GAP - tip.w }
  }
  return null
}

export default function TourOverlay({
  onFinish,
  onSkip,
  onBackToVideos,
}: {
  onFinish: () => void
  onSkip: () => void
  onBackToVideos: () => void
}) {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [tipSize, setTipSize] = useState({ w: 360, h: 180 })
  const direction = useRef<1 | -1>(1)
  const tipRef = useRef<HTMLDivElement>(null)
  const step: TourStep = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1

  const go = useCallback(
    (delta: 1 | -1) => {
      direction.current = delta
      const n = index + delta
      if (n >= TOUR_STEPS.length) onFinish()
      else if (n < 0) onBackToVideos()
      else {
        setBox(null)
        setIndex(n)
      }
    },
    [index, onFinish, onBackToVideos],
  )
  const next = useCallback(() => go(1), [go])
  const prev = useCallback(() => go(-1), [go])

  useDialogKeys(tipRef, { onEscape: onSkip, onNext: next, onPrev: prev })

  // Find the target, scroll it into view, then keep the spotlight glued to it (scrolling, resizing, animations).
  useEffect(() => {
    let frame = 0
    let el: HTMLElement | null = null
    let found = false
    const started = performance.now()
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const tick = () => {
      if (!el || !el.isConnected) {
        el = findTarget(step.target)
        if (el && !found) {
          found = true
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: smooth ? 'smooth' : 'auto' })
        }
      }
      if (!el && !found && performance.now() - started > FIND_TIMEOUT_MS) {
        // Not on this screen (hidden at this width, or never rendered): skip the step in the direction of travel.
        if (direction.current === 1) next()
        else if (index > 0) prev()
        else next()
        return
      }
      let measured: Box | null = null
      if (el) {
        const r = el.getBoundingClientRect()
        const pad = step.padding ?? 6
        measured = { top: Math.round(r.top - pad), left: Math.round(r.left - pad), width: Math.round(r.width + pad * 2), height: Math.round(r.height + pad * 2) }
      }
      setBox((prevBox) => (sameBox(prevBox, measured) ? prevBox : measured))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // `next`/`prev` change identity with `index`, which is already a dependency through `step`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Measure the tooltip so it can be placed without overflowing, and move focus to its primary action per step.
  useLayoutEffect(() => {
    const t = tipRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    setTipSize((s) => (Math.round(r.width) === s.w && Math.round(r.height) === s.h ? s : { w: Math.round(r.width), h: Math.round(r.height) }))
  }, [step, box])
  useEffect(() => {
    tipRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
  }, [step])

  const pos = box ? placeTip(box, tipSize, step.placement ?? []) : null
  const centred = pos === null
  const style = centred
    ? { top: Math.max(MARGIN, (window.innerHeight - tipSize.h) / 2), left: Math.max(MARGIN, (window.innerWidth - tipSize.w) / 2) }
    : pos

  return (
    <div className="onb-tour">
      {/* Swallows clicks so the dashboard underneath can't be used mid-tour. */}
      <div className="onb-block" aria-hidden="true" />
      {box ? <div className="onb-spot" style={box} aria-hidden="true" /> : <div className="onb-dim" aria-hidden="true" />}
      <div
        ref={tipRef}
        className="onb-tip"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onb-tip-title"
        tabIndex={-1}
        style={style}
      >
        <div className="onb-head">
          <span className="onb-count" aria-live="polite">
            Step {index + 1} of {TOUR_STEPS.length}
          </span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onSkip}>
            Skip tour
          </button>
        </div>
        <h2 id="onb-tip-title" className="onb-title">{step.title}</h2>
        <p className="onb-body">{step.body}</p>
        <div className="onb-actions onb-actions-end">
          <button type="button" className="btn" onClick={prev}>
            <ArrowLeft aria-hidden="true" /> Back
          </button>
          <button type="button" className="btn btn-primary" onClick={next} data-autofocus>
            {last ? 'Finish' : 'Next'} <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
