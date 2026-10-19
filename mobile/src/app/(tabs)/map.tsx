import { CornerUpRight, Clock } from 'lucide-react-native'
import { useCallback, useMemo } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { AssignedMap } from '@/components/assigned-map'
import { DEMAND_STYLE } from '@/components/position-card'
import { ErrorNotice } from '@/components/notice-banner'
import { EmptyState } from '@/components/states'
import { Button, Card, Pill } from '@/components/ui'
import { colors } from '@/constants'
import { WARDS } from '@/data/wards'
import { useFocusedPolling } from '@/hooks/use-focused-polling'
import { demandLevel, formatKm, haversineKm } from '@/lib/geo'
import { openInMaps } from '@/lib/maps'
import { formatWindow } from '@/lib/time'
import { useFleet } from '@/state/fleet'
import { useState } from 'react'

const HOTSPOT_COUNT = 3

export default function MapScreen() {
  const { unit, hospital, demand, error, refresh } = useFleet()
  const [refreshing, setRefreshing] = useState(false)

  // Same 10 s foreground poll as the Assignment tab, but only while this tab is focused.
  const poll = useCallback(() => {
    refresh()
  }, [refresh])
  useFocusedPolling(poll)
  const assignment = unit?.current_assignment ?? null
  const point = assignment && assignment.lat != null && assignment.lng != null ? { lat: assignment.lat, lng: assignment.lng } : null

  const assigned = useMemo(
    () => (point && assignment ? { ...point, label: `Assigned staging: ${assignment.name ?? assignment.candidate_id}` } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [point?.lat, point?.lng, assignment?.name, assignment?.candidate_id],
  )
  const base = useMemo(() => (hospital ? { lat: hospital.lat, lng: hospital.lng, label: hospital.name } : null), [hospital])

  const hotspots = useMemo(() => {
    if (!point) return []
    return WARDS.filter((w) => w.code !== assignment?.ward_code)
      .map((w) => ({ ward: w, km: haversineKm(point.lat, point.lng, w.lat, w.lng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, HOTSPOT_COUNT)
  }, [point, assignment?.ward_code])

  async function onRefresh() {
    setRefreshing(true)
    await refresh({ force: true })
    setRefreshing(false)
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      {error && <ErrorNotice error={error} stale onRetry={onRefresh} retrying={refreshing} />}
      <AssignedMap assigned={assigned} base={base} />

      {assignment ? (
        <Card style={{ gap: 6 }}>
          <View style={styles.cardHead}>
            <Text style={styles.eyebrow}>ASSIGNED POSITION</Text>
            {assignment.ward_code && (
              <View style={styles.ward}>
                <Text style={styles.wardText}>Ward {assignment.ward_code}</Text>
              </View>
            )}
          </View>
          <Text style={styles.title}>{assignment.name ?? assignment.candidate_id}</Text>
          <View style={styles.row}>
            <Clock size={20} color={colors.muted} />
            <Text style={styles.rowText}>Planned for {formatWindow(assignment.valid_from, assignment.valid_to)}</Text>
          </View>
          {point && (
            <View style={{ marginTop: 12 }}>
              <Button
                label="Open in Maps"
                icon={<CornerUpRight size={20} color={colors.white} />}
                onPress={() => openInMaps(point.lat, point.lng, assignment.name ?? assignment.candidate_id)}
              />
            </View>
          )}
        </Card>
      ) : (
        <EmptyState title="No position assigned" message="The map will show your staging position once dispatch plans one." />
      )}

      {hotspots.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={styles.section}>Nearby hotspots</Text>
          <Card style={{ padding: 0 }}>
            {hotspots.map(({ ward, km }, index) => {
              const score = demand[ward.code]
              const level = score === undefined ? null : demandLevel(score)
              return (
                <View key={ward.code} style={[styles.hotspot, index > 0 && styles.hotspotDivider]}>
                  <View style={[styles.dot, { backgroundColor: level ? DEMAND_STYLE[level].color : colors.faint }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hotspotTitle}>
                      Ward {ward.code} ({ward.name})
                    </Text>
                    <Text style={styles.hotspotSub}>{formatKm(km)} away</Text>
                  </View>
                  {level && <Pill label={DEMAND_STYLE[level].label} color={DEMAND_STYLE[level].color} bg={DEMAND_STYLE[level].bg} />}
                </View>
              )
            })}
          </Card>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 1, color: colors.muted },
  ward: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.slateBg, borderWidth: 1, borderColor: colors.border },
  wardText: { fontSize: 14, fontWeight: '600', color: colors.text },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  rowText: { fontSize: 17, color: colors.text },
  section: { fontSize: 22, fontWeight: '800', color: colors.text },
  hotspot: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  hotspotDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dot: { width: 10, height: 10, borderRadius: 5 },
  hotspotTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  hotspotSub: { fontSize: 14, color: colors.muted, marginTop: 2 },
})
