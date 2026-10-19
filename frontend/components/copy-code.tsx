'use client'

import { useEffect, useState } from 'react'

const FEEDBACK_MS = 1500

/** "Driver code: PAREL-4821 [Copy]", with brief Copied / Copy failed feedback. */
export default function CopyCode({ code, label = 'Driver code', className }: { code: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [state])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setState('copied')
    } catch {
      // Clipboard access can be blocked (e.g. outside a secure context); the code stays visible to copy by hand.
      setState('failed')
    }
  }

  return (
    <span className={className ? `copy-code ${className}` : 'copy-code'}>
      {label}: <strong>{code}</strong>
      <button type="button" className="copy-code-button" onClick={copy} aria-label={`Copy ${label.toLowerCase()} ${code}`}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
      </button>
    </span>
  )
}
