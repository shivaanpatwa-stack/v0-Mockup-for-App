'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Film, Loader2, X } from 'lucide-react'
import { APP_NAME } from '@/lib/config'
import { VIDEO_STEPS, type VideoStep } from './config'
import { useDialogKeys } from './use-dialog-keys'

type MediaState = 'loading' | 'ready' | 'error'

/** One demo video with a loading state and a graceful fallback when the file is missing or can't play. */
function Demo({ step }: { step: VideoStep }) {
  const [state, setState] = useState<MediaState>('loading')
  // Use the recording's own shape so a 16:10 screen capture isn't letterboxed in a 16:9 frame.
  const [ratio, setRatio] = useState<number | null>(null)
  const [reduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  return (
    <div className="onb-media" data-state={state} style={ratio ? { aspectRatio: ratio } : undefined}>
      {state !== 'error' && (
        <video
          // A fresh element per step so the previous video's state never leaks into the next one.
          key={step.id}
          className="onb-video"
          src={step.src}
          poster={step.poster}
          muted
          loop
          playsInline
          controls
          autoPlay={!reduceMotion}
          preload="metadata"
          aria-label={`${step.title} demo video`}
          onLoadedMetadata={(e) => {
            const { videoWidth: w, videoHeight: h } = e.currentTarget
            if (w && h) setRatio(w / h)
          }}
          onLoadedData={() => setState('ready')}
          onError={() => setState('error')}
        />
      )}
      {state === 'loading' && (
        <div className="onb-media-status" role="status">
          <Loader2 className="spin" aria-hidden="true" /> Loading video…
        </div>
      )}
      {state === 'error' && (
        <div className="onb-media-status onb-media-missing" role="status">
          <Film aria-hidden="true" />
          <strong>Demo video coming soon</strong>
          <span>The written summary below covers the same steps.</span>
        </div>
      )}
    </div>
  )
}

export default function VideoModal({
  index,
  onIndex,
  onSkip,
  onDone,
}: {
  index: number
  onIndex: (i: number) => void
  onSkip: () => void
  onDone: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const step = VIDEO_STEPS[index]
  const last = index === VIDEO_STEPS.length - 1
  const next = () => (last ? onDone() : onIndex(index + 1))
  const prev = () => index > 0 && onIndex(index - 1)

  useDialogKeys(ref, { onEscape: onSkip, onNext: next, onPrev: prev })
  // Keep keyboard focus on the primary action as the steps change.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [index])

  return (
    <div className="onb-backdrop">
      <div ref={ref} className="onb-modal" role="dialog" aria-modal="true" aria-labelledby="onb-video-title" tabIndex={-1}>
        <div className="onb-head">
          <span className="onb-eyebrow">Welcome to {APP_NAME}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onSkip}>
            Skip <X aria-hidden="true" />
          </button>
        </div>

        <Demo key={step.id} step={step} />

        <h2 id="onb-video-title" className="onb-title">{step.title}</h2>
        <p className="onb-body">{step.description}</p>

        <div className="onb-foot">
          <span className="onb-count" aria-live="polite">
            {index + 1} of {VIDEO_STEPS.length}
          </span>
          <div className="onb-dots" aria-hidden="true">
            {VIDEO_STEPS.map((s, i) => (
              <span key={s.id} className={i === index ? 'is-current' : undefined} />
            ))}
          </div>
          <div className="onb-actions">
            <button type="button" className="btn" onClick={prev} disabled={index === 0}>
              <ArrowLeft aria-hidden="true" /> Back
            </button>
            <button type="button" className="btn btn-primary" onClick={next} data-autofocus>
              {last ? 'Start Dashboard Tour' : 'Next'} <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
