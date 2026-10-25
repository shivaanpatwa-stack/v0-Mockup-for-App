import { LocateFixed, Map as MapIcon } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BackOnlineNotice, ErrorNotice, OfflineNotice, RateLimitNotice } from '@/components/notice-banner'
import { shortLabel } from '@/components/map-markers'
import { LoadingState } from '@/components/states'
import { TripMap } from '@/components/trip-map'
import { Button } from '@/components/ui'
import { colors } from '@/constants'
import { useFocusedPolling } from '@/hooks/use-focused-polling'
import { formatKm, haversineKm } from '@/lib/geo'
import { openInMaps } from '@/lib/maps'
import { formatWindow } from '@/lib/time'
import { useFleet } from '@/state/fleet'

const CARD_MARGIN = 16

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

  const plan = unit.current_assignment
  const ended = plan !== null && now > new Date(plan.valid_to).getTime()
  const active = plan && !ended ? plan : null
  const point = active && active.lat !== null && active.lng !== null ? { lat: active.lat, lng: active.lng } : null
  const base = hospital ? { lat: hospital.lat, lng: hospital.lng } : null
  const kmFromBase = point && base ? formatKm(haversineKm(base.lat, base.lng, point.lat, point.lng)) : null

  return (
    <View style={styles.screen}>
      <TripMap
        hospital={base}
        assigned={point ? { ...point, label: shortLabel(unit.call_sign), type: unit.type } : null}
        bottomInset={cardHeight + CARD_MARGIN}
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
        accessibilityLabel="Recenter"
        onPress={() => setRecenterToken((n) => n + 1)}
        style={({ pressed }) => [styles.recenter, { bottom: cardHeight + CARD_MARGIN + 12 }, pressed && { opacity: 0.8 }]}>
        <LocateFixed size={18} color={colors.primary} />
        <Text style={styles.recenterText}>Recenter</Text>
      </Pressable>

      <View style={styles.card} onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}>
        {active ? (
          <>
            <Text style={styles.title}>{active.name ?? active.candidate_id}</Text>
            <View style={styles.metaRow}>
              {active.ward_code && (
                <View style={styles.ward}>
                  <Text style={styles.wardText}>Ward {active.ward_code}</Text>
                </View>
              )}
              {kmFromBase && <Text style={styles.meta}>{kmFromBase} from base</Text>}
            </View>
            <Text style={styles.meta}>Planned for {formatWindow(active.valid_from, active.valid_to)}</Text>
            {point && (
              <View style={{ marginTop: 14 }}>
                <Button
                  label="Open in Maps"
                  icon={<MapIcon size={20} color={colors.white} />}
                  onPress={() => openInMaps(point.lat, point.lng)}
                />
              </View>
            )}
          </>
        ) : plan ? (
          <>
            <Text style={styles.title}>{`Your ${formatWindow(plan.valid_from, plan.valid_to)} plan has ended`}</Text>
            <Text style={styles.meta}>Waiting for the next position plan from dispatch.</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>No position assigned yet.</Text>
            <Text style={styles.meta}>
              {unit.status === 'unavailable'
                ? "You're out of service, so you're left out of the next position plan."
                : 'Waiting for the next position plan from dispatch.'}
            </Text>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, padding: 20 },
  banners: { position: 'absolute', top: 12, left: 12, right: 12, gap: 8 },
  recenter: {
    position: 'absolute',
    right: CARD_MARGIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  recenterText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  // Flat: a 1px border and no shadow.
  card: {
    position: 'absolute',
    left: CARD_MARGIN,
    right: CARD_MARGIN,
    bottom: CARD_MARGIN,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  meta: { fontSize: 15, color: colors.muted },
  ward: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.slateBg, borderWidth: 1, borderColor: colors.border },
  wardText: { fontSize: 14, fontWeight: '600', color: colors.text },
})
