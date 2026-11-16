'use client'

import { useEffect, useRef } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { COMPLETION } from './config'
import { useDialogKeys } from './use-dialog-keys'

export default function CompletionScreen({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogKeys(ref, { onEscape: onClose })
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [])

  return (
    <div className="onb-backdrop">
      <div ref={ref} className="onb-modal onb-done" role="dialog" aria-modal="true" aria-labelledby="onb-done-title" tabIndex={-1}>
        <CheckCircle2 className="onb-done-icon" aria-hidden="true" />
        <h2 id="onb-done-title" className="onb-title">{COMPLETION.title}</h2>
        <p className="onb-body">{COMPLETION.body}</p>
        <p className="onb-hint">{COMPLETION.hint}</p>
        <button type="button" className="btn btn-primary" onClick={onClose} data-autofocus>
          {COMPLETION.action}
        </button>
      </div>
    </div>
  )
}
