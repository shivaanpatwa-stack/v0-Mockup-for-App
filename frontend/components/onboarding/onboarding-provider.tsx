'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApp } from '@/lib/app-state'
import { saveOnboarding } from '@/lib/api'
import CompletionScreen from './completion-screen'
import { ONBOARDING_VERSION, VIDEO_STEPS } from './config'
import { saveOnboardingStatus, useOnboardingStatus } from './store'
import TourOverlay from './tour-overlay'
import VideoModal from './video-modal'

type Phase = 'idle' | 'videos' | 'tour' | 'done'

type OnboardingContextValue = {
  /** True while any onboarding surface is on screen; the rest of the app should be inert and ignore shortcuts. */
  active: boolean
  /** Replay the onboarding. Never changes the saved first-run status. */
  startTour: () => void
}

const OnboardingContext = createContext<OnboardingContextValue>({ active: false, startTour: () => {} })

export const useOnboarding = () => useContext(OnboardingContext)

/**
 * Runs the first-run onboarding: demo videos, then a spotlight tour of the dashboard, then a completion screen.
 * It starts by itself the first time a hospital reaches the dashboard, and again whenever `startTour` is called.
 *
 * "Has seen it" is saved on the hospital in the database, so it is the same on every device and for every person
 * signed in to that hospital; each hospital has its own. A copy in this browser (store.ts) covers a backend that
 * isn't updated yet or a failed save, and is pushed to the database on the next load.
 */
export default function OnboardingProvider({ children }: { children: ReactNode }) {
  const { hospital, refreshHospital, setWhatIfOpen, setMovesOpen } = useApp()
  const hospitalId = hospital?.hospital_id
  const status = useOnboardingStatus(hospitalId)
  const router = useRouter()
  const pathname = usePathname()

  // The database's answer. `serverKnown` is false against an older backend, where the browser copy decides alone.
  const serverKnown = hospital?.onboarding !== undefined
  const serverSeen = Boolean(hospital?.onboarding?.status) && (hospital?.onboarding?.version ?? 0) >= ONBOARDING_VERSION

  const [phase, setPhase] = useState<Phase>('idle')
  const [videoIndex, setVideoIndex] = useState(0)
  // A replay must not rewrite the saved status (someone who skipped stays "skipped").
  const replay = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  // The hospital the tour was auto-started for, so re-renders and refreshes of the same hospital never start it twice.
  const autoStartedFor = useRef<number | null>(null)
  const syncedFor = useRef<number | null>(null)

  const begin = useCallback((isReplay: boolean) => {
    replay.current = isReplay
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setVideoIndex(0)
    setPhase('videos')
  }, [])

  // First visit: wait until the hospital has loaded (so we are signed in and the saved status is known) so the tour
  // never runs on an empty shell, and never before the database has been asked.
  useEffect(() => {
    if (hospitalId === undefined || status === 'unknown' || autoStartedFor.current === hospitalId) return
    if (!serverSeen && status === 'new') {
      autoStartedFor.current = hospitalId
      begin(false)
    }
  }, [hospitalId, status, serverSeen, begin])

  // This browser has a record the database doesn't (an earlier save failed): send it again, once per page load.
  useEffect(() => {
    if (hospitalId === undefined || !serverKnown || serverSeen || syncedFor.current === hospitalId) return
    if (status !== 'completed' && status !== 'skipped') return
    syncedFor.current = hospitalId
    saveOnboarding(status, ONBOARDING_VERSION).then(refreshHospital, () => undefined)
  }, [hospitalId, serverKnown, serverSeen, status, refreshHospital])

  /** Save the outcome: in this browser at once, and in the database (failures are retried on the next load). */
  const persist = useCallback(
    (outcome: 'completed' | 'skipped') => {
      if (replay.current || hospitalId === undefined) return
      // This save is already on its way: stop the "re-send a failed save" effect from sending a duplicate.
      syncedFor.current = hospitalId
      saveOnboardingStatus(hospitalId, outcome)
      saveOnboarding(outcome, ONBOARDING_VERSION).then(refreshHospital, (err) => console.warn('Could not save the tour status', err))
    },
    [hospitalId, refreshHospital],
  )

  const close = useCallback(
    // `null`: just close (the completion screen, where the outcome was already saved when the tour finished).
    (outcome: 'completed' | 'skipped' | null) => {
      if (outcome) persist(outcome)
      setPhase('idle')
      const el = returnFocus.current
      returnFocus.current = null
      if (el?.isConnected) el.focus({ preventScroll: true })
    },
    [persist],
  )

  const startDashboardTour = useCallback(() => {
    // The tour points at the live map, so make sure that is the page, with panels in their default state.
    if (pathname !== '/app') router.push('/app')
    setWhatIfOpen(false)
    setMovesOpen(true)
    setPhase('tour')
  }, [pathname, router, setWhatIfOpen, setMovesOpen])

  const finishTour = useCallback(() => {
    // Saved now rather than on "Get Started", so closing the tab on the last screen doesn't repeat the tour.
    persist('completed')
    setPhase('done')
  }, [persist])

  const value = useMemo<OnboardingContextValue>(() => ({ active: phase !== 'idle', startTour: () => begin(true) }), [phase, begin])

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {phase === 'videos' && (
        <VideoModal
          index={Math.min(videoIndex, VIDEO_STEPS.length - 1)}
          onIndex={setVideoIndex}
          onSkip={() => close('skipped')}
          onDone={startDashboardTour}
        />
      )}
      {phase === 'tour' && (
        <TourOverlay
          onFinish={finishTour}
          onSkip={() => close('skipped')}
          onBackToVideos={() => {
            setVideoIndex(VIDEO_STEPS.length - 1)
            setPhase('videos')
          }}
        />
      )}
      {phase === 'done' && <CompletionScreen onClose={() => close(null)} />}
    </OnboardingContext.Provider>
  )
}
