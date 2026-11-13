import { ChevronDown, ChevronUp, Clock, Flame, LocateFixed, Map as MapIcon, Navigation, Ruler } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { MapLegend } from '@/components/map-legend'
import { shortLabel } from '@/components/map-markers'
import { BackOnlineNotice, ErrorNotice, OfflineNotice, RateLimitNotice } from '@/components/notice-banner'
import { LoadingState } from '@/components/states'
import { TripMap } from '@/components/trip-map'
import type { Coordinate } from '@/components/trip-map-types'
import { Button, Pill } from '@/components/ui'
import { colors } from '@/constants'
import { useFocusedPolling } from '@/hooks/use-focused-polling'
import type { DemandAroundYouResponse, DemandLevel } from '@/lib/api'
import { getHotspots } from '@/lib/api'
import { estimateRoadTravel, formatHospitalName } from '@/lib/format'
import { formatKm, haversineKm } from '@/lib/geo'
import { openInMaps } from '@/lib/maps'
import { fetchRoadRoute } from '@/lib/routing'
import { formatHour, formatIstClock, formatWindow } from '@/lib/time'
import { useFleet } from '@/state/fleet'
import wardNamesData from '@/data/ward-names.json'

const WARD_NAMES: Record<string, string> = wardNamesData

const CARD_MARGIN = 14

const DEMAND_CHIP: Record<DemandLevel, { color: string; bg: string }> = {
  High: { color: colors.red, bg: colors.redBg },
  Medium: { color: colors.amber, bg: colors.amberBg },
  Low: { color: colors.green, bg: colors.greenBg },
}

export default function MapScreen() {
  const { unit, hospital, error, offline, backOnline, dataAt, rateLimitUntil, lastUpdated, refresh } = useFleet()
  const [refreshing, setRefreshing] = useState(false)
  const [cardHeight, setCardHeight] = useState(120)
  const [recenterToken, setRecenterToken] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [routePoints, setRoutePoints] = useState<Coordinate[]>([])

  // Same single /fleet poll as the Assignment tab
  const poll = useCallback(() => {
    refresh()
  }, [refresh])
  useFocusedPolling(poll)

  // Re-read every 30 s so a plan that ends stops being drawn
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
  const baseName = formatHospitalName(hospital?.name)

  const distKm = point && base ? haversineKm(base.lat, base.lng, point.lat, point.lng) : null
  const roadTravel = distKm != null ? estimateRoadTravel(distKm) : null

  // Fetch or calculate road route preview polyline
  useEffect(() => {
    let activeEffect = true
    if (!base || !point) {
      setRoutePoints([])
      return
    }

    async function loadRoute() {
      if (!base || !point) return
      const pts = await fetchRoadRoute(base, point)
      if (activeEffect) {
        setRoutePoints(pts)
      }
    }

    loadRoute()
    return () => {
      activeEffect = false
    }
  }, [base?.lat, base?.lng, point?.lat, point?.lng])

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
        routePoints={routePoints}
        bottomInset={cardHeight + CARD_MARGIN}
        recenterToken={recenterToken}
      />

      {/* Floating Map Legend */}
      <MapLegend />

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
        style={({ pressed }) => [styles.recenter, { bottom: cardHeight + CARD_MARGIN + 10 }, pressed && { opacity: 0.8 }]}>
        <LocateFixed size={16} color={colors.accent} />
        <Text style={styles.recenterText}>Recenter</Text>
      </Pressable>

      {/* Collapsible Assignment Panel */}
      <View style={styles.card} onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}>
        {active ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Collapse assignment panel' : 'Expand assignment panel'}
              onPress={() => setExpanded((prev) => !prev)}
              style={styles.cardHeader}>
              <View style={styles.headerTitleCol}>
                <View style={styles.eyebrowRow}>
                  <Navigation size={13} color={colors.accent} />
                  <Text style={styles.eyebrow}>Recommended position</Text>
                </View>
                <Text style={styles.title} numberOfLines={1}>
                  {active.name ?? active.candidate_id}
                </Text>
              </View>

              <View style={styles.togglePill}>
                <Text style={styles.togglePillText}>{expanded ? 'Less' : 'Details'}</Text>
                {expanded ? <ChevronDown size={15} color={colors.accent} /> : <ChevronUp size={15} color={colors.accent} />}
              </View>
            </Pressable>

            {/* Quick summary line (always visible) */}
            <View style={styles.metaRow}>
              {active.ward_code && (
                <View style={styles.ward}>
                  <Text style={styles.wardText}>Ward {active.ward_code}</Text>
                </View>
              )}
              {showDemand && hotspotsData && (
                <Pill
                  label={`${hotspotsData.own_ward.demand_level} Demand`}
                  color={DEMAND_CHIP[hotspotsData.own_ward.demand_level]?.color ?? colors.green}
                  bg={DEMAND_CHIP[hotspotsData.own_ward.demand_level]?.bg ?? colors.greenBg}
                />
              )}
              {distKm != null && roadTravel && (
                <Text style={styles.metaDistance}>
                  {formatKm(distKm)} from {baseName} · <Text style={styles.etaText}>{roadTravel.etaText}</Text>
                </Text>
              )}
            </View>

            {/* Expanded details */}
            {expanded && (
              <View style={styles.expandedSection}>
                <View style={styles.infoRow}>
                  <Clock size={15} color={colors.muted} />
                  <Text style={styles.infoText}>Planned for {formatWindow(active.valid_from, active.valid_to)}</Text>
                </View>
                {distKm != null && roadTravel && (
                  <View style={styles.infoRow}>
                    <Ruler size={15} color={colors.muted} />
                    <Text style={styles.infoText}>
                      Road route: {roadTravel.roadKmText} ({roadTravel.etaText} estimated travel time)
                    </Text>
                  </View>
                )}

                {showDemand && hotspotsData && (
                  <View style={styles.demandSection}>
                    <View style={styles.demandHeader}>
                      <Text style={styles.demandTitle}>Demand around you</Text>
                      <Text style={styles.demandSubtitle}>
                        Modelled predictive demand by ward for {formatHour(hotspotsData.hour)}. Not based on live emergency calls.
                      </Text>
                    </View>
                    <View style={styles.demandList}>
                      {(() => {
                        const ownChip = DEMAND_CHIP[hotspotsData.own_ward.demand_level] ?? DEMAND_CHIP.Low
                        return (
                          <View style={styles.demandRow}>
                            <Text style={styles.demandRowLabel}>Your ward ({hotspotsData.own_ward.ward_code})</Text>
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
                        <Text style={styles.emptyText}>No additional wards are reachable within 15 minutes from this position.</Text>
                      )}
                    </View>
                    {hotspotsData.nearest_high && (
                      <Text style={styles.nearestHighText}>
                        Nearest high-demand ward: Ward {hotspotsData.nearest_high.ward_code}, about {hotspotsData.nearest_high.minutes} min
                      </Text>
                    )}
                  </View>
                )}

                {point && (
                  <View style={{ marginTop: 10 }}>
                    <Button
                      label="Open in Maps"
                      icon={<MapIcon size={18} color={colors.white} />}
                      onPress={() => openInMaps(point.lat, point.lng)}
                    />
                  </View>
                )}

                {lastUpdated && (
                  <Text style={styles.lastUpdatedText}>Data updated {formatIstClock(lastUpdated)}</Text>
                )}
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
  banners: { position: 'absolute', top: 12, left: 12, right: 100, gap: 8 },
  recenter: {
    position: 'absolute',
    right: CARD_MARGIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  recenterText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  card: {
    position: 'absolute',
    left: CARD_MARGIN,
    right: CARD_MARGIN,
    bottom: CARD_MARGIN,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  eyebrow: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(232,235,233,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  togglePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  ward: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.slateBg,
  },
  wardText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  metaDistance: {
    fontSize: 13,
    color: colors.muted,
    flexShrink: 1,
  },
  etaText: {
    color: colors.accent,
    fontWeight: '700',
  },
  meta: {
    fontSize: 14,
    color: colors.muted,
  },
  expandedSection: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  demandSection: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  demandHeader: {
    gap: 2,
  },
  demandTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  demandSubtitle: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  demandList: {
    gap: 4,
  },
  demandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 1,
  },
  demandRowLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  emptyText: {
    fontSize: 12,
    color: colors.muted,
    paddingVertical: 2,
    fontStyle: 'italic',
  },
  nearestHighText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  lastUpdatedText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
  },
})
