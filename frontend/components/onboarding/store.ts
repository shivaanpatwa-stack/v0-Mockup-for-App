import { useCallback, useSyncExternalStore } from 'react'
import { ONBOARDING_VERSION } from './config'

/**
 * Per-browser copy of "this hospital has seen the onboarding". The database (hospitals.onboarding_*) is the source
 * of truth and is what keeps the answer the same on every device; this copy covers the gaps: the backend not
 * updated yet, or a save that failed (it is retried on the next load). Keyed by hospital so one browser used for
 * several hospitals never mixes them up.
 *
 * 'unknown' is only returned on the server, on the first client render, and until the hospital is known, so
 * nothing flashes before the real value is read.
 */
export type OnboardingStatus = 'unknown' | 'new' | 'completed' | 'skipped'

const keyFor = (hospitalId: number) => `onboarding:v${ONBOARDING_VERSION}:${hospitalId}`

const listeners = new Set<() => void>()
// Used when localStorage is blocked (private mode, disabled storage) so the tour still shows only once per page load.
const memory = new Map<number, 'completed' | 'skipped'>()

function read(hospitalId: number): OnboardingStatus {
  const remembered = memory.get(hospitalId)
  if (remembered) return remembered
  try {
    const raw = window.localStorage.getItem(keyFor(hospitalId))
    if (!raw) return 'new'
    const parsed = JSON.parse(raw) as { version?: number; status?: string }
    if (parsed.version === ONBOARDING_VERSION && (parsed.status === 'completed' || parsed.status === 'skipped')) return parsed.status
  } catch {
    // Unreadable or corrupt value: treat as never seen.
  }
  return 'new'
}

/** Remember in this browser that the onboarding was finished or skipped. */
export function saveOnboardingStatus(hospitalId: number, status: 'completed' | 'skipped') {
  try {
    window.localStorage.setItem(keyFor(hospitalId), JSON.stringify({ version: ONBOARDING_VERSION, status, at: new Date().toISOString() }))
    memory.delete(hospitalId)
  } catch {
    memory.set(hospitalId, status)
  }
  listeners.forEach((l) => l())
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  // Another tab finishing the tour should also stop it here.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith('onboarding:')) onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useOnboardingStatus(hospitalId: number | undefined): OnboardingStatus {
  const getSnapshot = useCallback((): OnboardingStatus => (hospitalId === undefined ? 'unknown' : read(hospitalId)), [hospitalId])
  return useSyncExternalStore(subscribe, getSnapshot, () => 'unknown')
}
