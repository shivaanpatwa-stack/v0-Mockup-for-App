'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApp } from '@/lib/app-state'
import CompletionScreen from './completion-screen'
import { VIDEO_STEPS } from './config'
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
 * It starts by itself the first time a browser reaches the dashboard, and again whenever `startTour` is called.
 */
export default function OnboardingProvider({ children }: { children: ReactNode }) {
  const status = useOnboardingStatus()
  const { hospital, setWhatIfOpen, setMovesOpen } = useApp()
  const router = useRouter()
  const pathname = usePathname()

  const [phase, setPhase] = useState<Phase>('idle')
  const [videoIndex, setVideoIndex] = useState(0)
  // A replay must not rewrite the saved status (someone who skipped stays "skipped").
  const replay = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const autoStarted = useRef(false)

  const begin = useCallback((isReplay: boolean) => {
    replay.current = isReplay
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setVideoIndex(0)
    setPhase('videos')
  }, [])

  // First visit: wait until the dashboard has loaded (hospital known) so the tour never runs on an empty shell.
  useEffect(() => {
    if (status === 'new' && hospital && !autoStarted.current) {
      autoStarted.current = true
      begin(false)
    }
  }, [status, hospital, begin])

  const close = useCallback(
    (outcome: 'completed' | 'skipped') => {
      if (!replay.current) saveOnboardingStatus(outcome)
      setPhase('idle')
      const el = returnFocus.current
      returnFocus.current = null
      if (el?.isConnected) el.focus({ preventScroll: true })
    },
    [],
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
    if (!replay.current) saveOnboardingStatus('completed')
    setPhase('done')
  }, [])

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
      {phase === 'done' && <CompletionScreen onClose={() => close('completed')} />}
    </OnboardingContext.Provider>
  )
}
