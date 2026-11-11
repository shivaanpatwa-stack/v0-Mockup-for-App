import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { getHotspots } from '@/lib/api'
import type { DemandAroundYouResponse } from '@/lib/api'

/**
 * "Demand around you" for the unit's current plan. The last answer is cached per unit and shown straight away
 * (only if it belongs to the same plan), then replaced by a fresh one; a failure just leaves the section out.
 */
export function useHotspots(callSign: string | null, assignmentKey: string | null) {
  const [data, setData] = useState<DemandAroundYouResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!callSign || !assignmentKey) {
      setData(null)
      setFailed(false)
      return
    }

    let live = true
    const cacheKey = `cache.hotspots.${callSign}`

    async function load() {
      try {
        const raw = await AsyncStorage.getItem(cacheKey)
        if (raw && live) {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.key === assignmentKey && parsed.data && parsed.data.own_ward) setData(parsed.data)
        }
      } catch {
        // A bad cache entry is ignored; the fetch below replaces it.
      }

      try {
        const fresh = await getHotspots(callSign as string)
        if (!live) return
        setData(fresh)
        setFailed(false)
        await AsyncStorage.setItem(cacheKey, JSON.stringify({ key: assignmentKey, data: fresh })).catch(() => {})
      } catch {
        if (live) setFailed(true)
      }
    }

    load()
    return () => {
      live = false
    }
  }, [callSign, assignmentKey])

  return { data: failed ? null : data, failed }
}
