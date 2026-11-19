import { useSyncExternalStore } from 'react'

/**
 * Whether this browser has already seen the onboarding. Stored per browser in localStorage under a versioned key:
 * bump `VERSION` to show a redesigned tour to everyone again.
 *
 * 'unknown' is only ever returned while rendering on the server (and the first client render), so nothing
 * flashes before the real value is read.
 */
export type OnboardingStatus = 'unknown' | 'new' | 'completed' | 'skipped'

const VERSION = 1
const KEY = `onboarding:v${VERSION}`

const listeners = new Set<() => void>()
// Used when localStorage is blocked (private mode, disabled storage) so the tour still shows only once per page load.
let memory: OnboardingStatus | null = null

function read(): OnboardingStatus {
  if (memory) return memory
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return 'new'
    const parsed = JSON.parse(raw) as { version?: number; status?: string }
    if (parsed.version === VERSION && (parsed.status === 'completed' || parsed.status === 'skipped')) return parsed.status
  } catch {
    // Unreadable or corrupt value: treat as never seen.
  }
  return 'new'
}

/** Remember that the onboarding was finished or skipped. */
export function saveOnboardingStatus(status: 'completed' | 'skipped') {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ version: VERSION, status, at: new Date().toISOString() }))
    memory = null
  } catch {
    memory = status
  }
  listeners.forEach((l) => l())
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  // Another tab finishing the tour should also stop it here.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useOnboardingStatus(): OnboardingStatus {
  return useSyncExternalStore(subscribe, read, () => 'unknown')
}
