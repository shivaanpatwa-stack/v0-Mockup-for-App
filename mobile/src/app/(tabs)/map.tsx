import { LocateFixed, Map as MapIcon } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BackOnlineNotice, ErrorNotice, OfflineNotice, RateLimitNotice } from '@/components/notice-banner'
import { shortLabel } from '@/components/map-markers'
import { LoadingState } from '@/components/states'
import { TripMap } from '@/components/trip-map'
import { Button, Pill } from '@/components/ui'
import { colors } from '@/constants'
import { useFocusedPolling } from '@/hooks/use-focused-polling'
import { formatKm, haversineKm } from '@/lib/geo'
import { openInMaps } from '@/lib/maps'
import { formatHour, formatWindow } from '@/lib/time'
import type { DemandLevel, DemandAroundYouResponse } from '@/lib/api'
import { getHotspots } from '@/lib/api'
import { useFleet } from '@/state/fleet'
import wardNamesData from '@/data/ward-names.json'

const WARD_NAMES: Record<string, string> = wardNamesData

const CARD_MARGIN = 16

const DEMAND_CHIP: Record<DemandLevel, { color: string; bg: string }> = {
  High: { color: colors.red, bg: colors.redBg },
  Medium: { color: colors.amber, bg: colors.amberBg },
  Low: { color: colors.green, bg: colors.greenBg },
}

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
  const isPlanned = plan !== null && plan.assignment_status === 'planned'
  const ended = plan !== null && now > new Date(plan.valid_to).getTime()
  const active = plan && !ended && !isPlanned ? plan : null
  const point = active && active.lat !== null && active.lng !== null ? { lat: active.lat, lng: active.lng } : null
  const base = hospital ? { lat: hospital.lat, lng: hospital.lng } : null
  const kmFromBase = point && base ? formatKm(haversineKm(base.lat, base.lng, point.lat, point.lng)) : null

  const callSign = unit.call_sign
  const assignmentKey = plan ? `${plan.candidate_id}-${plan.valid_from}` : null
  const [hotspotsData, setHotspotsData] = useState<DemandAroundYouResponse | null>(null)
  const [hotspotsFailed, setHotspotsFailed] = useState(false)

  useEffect(() => {
    if (!callSign || !assignmentKey) {
      setHotspotsData(null)
      setHotspotsFailed(false)
      return
    }

    let activeEffect = true
    const cacheKey = `cache.hotspots.${callSign}`

    async function loadHotspots() {
      try {
        const raw = await AsyncStorage.getItem(cacheKey)
        if (raw && activeEffect) {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.key === assignmentKey && parsed.data && parsed.data.own_ward) {
            setHotspotsData(parsed.data)
          }
        }
      } catch {
        // Cache read error ignored
      }

      try {
        const res = await getHotspots(callSign)
        if (!activeEffect) return
        setHotspotsData(res)
        setHotspotsFailed(false)
        await AsyncStorage.setItem(cacheKey, JSON.stringify({ key: assignmentKey, data: res })).catch(() => {})
      } catch {
        if (!activeEffect) return
        setHotspotsFailed(true)
      }
    }

    loadHotspots()
    return () => {
      activeEffect = false
    }
  }, [callSign, assignmentKey])

  const showDemand = Boolean(active && !hotspotsFailed && hotspotsData && hotspotsData.own_ward)

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
        <LocateFixed size={18} color={colors.accent} />
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
            {showDemand && hotspotsData && (
              <View style={styles.demandSection}>
                <View style={styles.demandHeader}>
                  <Text style={styles.demandTitle}>Demand around you</Text>
                  <Text style={styles.demandSubtitle}>
                    Modelled demand by ward for {formatHour(hotspotsData.hour)}. Not live calls.
                  </Text>
                </View>
                <View style={styles.demandList}>
                  {(() => {
                    const ownChip = DEMAND_CHIP[hotspotsData.own_ward.demand_level] ?? DEMAND_CHIP.Low
                    return (
                      <View style={styles.demandRow}>
                        <Text style={styles.demandRowLabel}>Your ward</Text>
                        <Pill label={hotspotsData.own_ward.demand_level} color={ownChip.color} bg={ownChip.bg} />
                      </View>
                    )
                  })()}
                  {hotspotsData.nearby.length > 0 ? (
                    hotspotsData.nearby.slice(0, 3).map((h) => {
                      const chip = DEMAND_CHIP[h.demand_level] ?? DEMAND_CHIP.Low
                      const area = WARD_NAMES[h.ward_code]
                      const label = area
                        ? `Ward ${h.ward_code} · ${area} · about ${h.minutes} min`
                        : `Ward ${h.ward_code} · about ${h.minutes} min`
                      return (
                        <View key={h.ward_code} style={styles.demandRow}>
                          <Text style={styles.demandRowLabel}>{label}</Text>
                          <Pill label={h.demand_level} color={chip.color} bg={chip.bg} />
                        </View>
                      )
                    })
                  ) : (
                    <Text style={styles.emptyText}>No other wards within 12 minutes.</Text>
                  )}
                </View>
                {hotspotsData.nearest_high && (
                  <Text style={styles.nearestHighText}>
                    Nearest high-demand ward: {hotspotsData.nearest_high.ward_code}, about {hotspotsData.nearest_high.minutes} min
                  </Text>
                )}
              </View>
            )}
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
        ) : isPlanned ? (
          <>
            <Text style={styles.title}>Waiting for dispatch order</Text>
            <Text style={styles.meta}>Your staging position is planned. Stand by for dispatch instructions.</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Stand by for instructions</Text>
            <Text style={styles.meta}>
              {unit.status === 'unavailable'
                ? "You're out of service, so you're left out of the next position plan."
                : 'No active staging position. Hold position and wait for instructions from dispatch.'}
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
  recenterText: { fontSize: 14, fontWeight: '700', color: colors.accent },
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
  demandSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  demandHeader: {
    gap: 2,
  },
  demandTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  demandSubtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  demandList: {
    gap: 6,
  },
  demandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 2,
  },
  demandRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    paddingVertical: 2,
  },
  nearestHighText: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
})
