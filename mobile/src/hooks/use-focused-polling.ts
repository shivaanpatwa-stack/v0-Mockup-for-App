import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { AppState } from 'react-native'

/**
 * Runs `task` now and then every `intervalMs`, but only while the app is in the foreground AND the
 * calling screen is focused. Leaving the screen or backgrounding the app stops the timer; coming back
 * runs `task` once immediately and restarts it. `task` must be stable (wrap it in useCallback).
 */
export function useFocusedPolling(task: () => void, intervalMs = 10_000) {
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | null = null
      const stop = () => {
        if (timer) clearInterval(timer)
        timer = null
      }
      const start = () => {
        stop()
        task()
        timer = setInterval(task, intervalMs)
      }

      if (AppState.currentState === 'active') start()
      const subscription = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()))
      return () => {
        stop()
        subscription.remove()
      }
    }, [task, intervalMs]),
  )
}
