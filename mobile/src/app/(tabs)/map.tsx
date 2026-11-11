import { LocateFixed } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { MAP_CARD_MARGIN, MapCard } from '@/components/map-card'
import type { MapCardState } from '@/components/map-card'
import { shortLabel } from '@/components/map-markers'
import { BackOnlineNotice, ErrorNotice, OfflineNotice, RateLimitNotice } from '@/components/notice-banner'
import { LoadingState } from '@/components/states'
import { TripMap } from '@/components/trip-map'
import { colors } from '@/constants'
import { useFocusedPolling } from '@/hooks/use-focused-polling'
import { useHotspots } from '@/hooks/use-hotspots'
import { formatKm, haversineKm } from '@/lib/geo'
import { displayName } from '@/lib/format'
import { useFleet } from '@/state/fleet'

export default function MapScreen() {
  const { unit, hospital, error, offline, backOnline, dataAt, rateLimitUntil, refresh } = useFleet()
  const [refreshing, setRefreshing] = useState(false)
  const [cardHeight, setCardHeight] = useState(0)
  const [recenterToken, setRecenterToken] = useState(0)

  // Same single /fleet poll as the Assignment tab (only the focused tab polls); the map adds no requests of its own.
  const poll = useCallback(() => {
    refresh()
  }, [refresh])
  useFocusedPolling(poll)

  // "Now", re-read every 30 s, so a plan that ends (including a cached one) stops being drawn.
  const [now, setNow] = useState(() => Date.now())
  const tick = useCallback(() => setNow(Date.now()), [])
  useFocusedPolling(tick, 30_000)

  // Every hook runs before the early return below, so the hook order is the same on every render.
  const plan = unit?.current_assignment ?? null
  const hotspots = useHotspots(unit?.call_sign ?? null, plan ? `${plan.candidate_id}-${plan.valid_from}` : null)

  async function onRetry() {
    setRefreshing(true)
    await refresh({ force: true })
    setRefreshing(false)
  }

  if (!unit) {
    return (
      <View style={styles.centered}>
        {error ? <ErrorNotice error={error} onRetry={onRetry} retrying={refreshing} /> : <LoadingState label="Loading your unit…" />}
      </View>
    )
  }

  const ended = plan !== null && now > new Date(plan.valid_to).getTime()
  const active = plan && !ended ? plan : null
  const point = active && active.lat !== null && active.lng !== null ? { lat: active.lat, lng: active.lng } : null
  const base = hospital ? { lat: hospital.lat, lng: hospital.lng } : null
  const kmFromBase = point && base ? formatKm(haversineKm(base.lat, base.lng, point.lat, point.lng)) : null

  const card: MapCardState = active
    ? { kind: 'active', plan: active, kmFromBase, point, demand: hotspots.data?.own_ward ? hotspots.data : null }
    : plan
      ? { kind: 'ended', plan }
      : { kind: 'none', outOfService: unit.status === 'unavailable' }

  return (
    <View style={styles.screen}>
      <TripMap
        hospital={base ? { ...base, name: displayName(hospital?.name) } : null}
        assigned={point ? { ...point, label: shortLabel(unit.call_sign), type: unit.type, name: active?.name ?? undefined } : null}
        bottomInset={cardHeight + MAP_CARD_MARGIN}
        recenterToken={recenterToken}
      />

      <View style={styles.banners} pointerEvents="box-none">
        <RateLimitNotice until={rateLimitUntil} />
        {offline ? (
          <OfflineNotice cachedAt={dataAt} onRetry={onRetry} retrying={refreshing} />
        ) : (
          error && <ErrorNotice error={error} stale onRetry={onRetry} retrying={refreshing} />
        )}
        <BackOnlineNotice show={backOnline} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Recenter map"
        onPress={() => setRecenterToken((n) => n + 1)}
        style={({ pressed }) => [styles.recenter, { bottom: cardHeight + MAP_CARD_MARGIN + 12 }, pressed && { opacity: 0.8 }]}>
        <LocateFixed size={20} color={colors.primary} />
      </Pressable>

      <MapCard state={card} onHeight={setCardHeight} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, padding: 20 },
  banners: { position: 'absolute', top: 12, left: 12, right: 12, gap: 8 },
  // Round, icon-only, solid white so it stays readable over any map tile.
  recenter: {
    position: 'absolute',
    right: MAP_CARD_MARGIN,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
})
