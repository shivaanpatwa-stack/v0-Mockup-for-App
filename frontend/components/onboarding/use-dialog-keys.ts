import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), video[controls], [tabindex]:not([tabindex="-1"])'

type Handlers = { onEscape?: () => void; onNext?: () => void; onPrev?: () => void }

/**
 * Keyboard behaviour shared by the onboarding surfaces: Tab stays inside the dialog, Escape and the arrow keys are
 * routed to the handlers. Listens on `window` in the capture phase so the dashboard's own shortcuts never see these keys.
 */
export function useDialogKeys(ref: RefObject<HTMLElement | null>, handlers: Handlers) {
  const { onEscape, onNext, onPrev } = handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current
      if (!root) return
      if (e.key === 'Tab') {
        const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (items.length === 0) {
          e.preventDefault()
          root.focus()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (!root.contains(active)) {
          e.preventDefault()
          first.focus()
        } else if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
        return
      }
      // Let the video's own controls keep the arrow keys (seeking).
      const onVideo = (e.target as HTMLElement | null)?.tagName === 'VIDEO'
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault()
        e.stopPropagation()
        onEscape()
      } else if (e.key === 'ArrowRight' && onNext && !onVideo) {
        e.preventDefault()
        onNext()
      } else if (e.key === 'ArrowLeft' && onPrev && !onVideo) {
        e.preventDefault()
        onPrev()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ref, onEscape, onNext, onPrev])
}
