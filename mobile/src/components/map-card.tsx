import { ChevronDown, ChevronUp, Map as MapIcon } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import wardNamesData from '@/data/ward-names.json'
import type { CurrentAssignment, DemandAroundYouResponse } from '@/lib/api'
import { openInMaps } from '@/lib/maps'
import { formatHour, formatWindow } from '@/lib/time'
import { DemandPill } from './demand-pill'
import { Button } from './ui'

const WARD_NAMES: Record<string, string> = wardNamesData
// The ward list names several neighbourhoods; the first is the one people know the ward by.
const areaOf = (code: string) => WARD_NAMES[code]?.split(',')[0]?.trim()

export type MapCardState =
  | { kind: 'active'; plan: CurrentAssignment; kmFromBase: string | null; point: { lat: number; lng: number } | null; demand: DemandAroundYouResponse | null }
  | { kind: 'ended'; plan: CurrentAssignment }
  | { kind: 'none'; outOfService: boolean }

function DemandSection({ demand }: { demand: DemandAroundYouResponse }) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronUp : ChevronDown

  return (
    <View style={styles.demand}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Demand around you"
        onPress={() => setOpen((v) => !v)}
        style={styles.demandHeader}>
        <Text style={styles.demandTitle}>Demand in your ward</Text>
        <DemandPill level={demand.own_ward.demand_level} />
        <Chevron size={18} color={colors.muted} />
      </Pressable>

      {open && (
        <View style={styles.demandBody}>
          <Text style={styles.caption}>Modelled demand by ward for {formatHour(demand.hour)}. Not live calls.</Text>
          {demand.nearby.length > 0 ? (
            demand.nearby.slice(0, 3).map((ward) => (
              <View key={ward.ward_code} style={styles.wardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.wardTitle}>Ward {ward.ward_code}</Text>
                  <Text style={styles.caption}>
                    {areaOf(ward.ward_code) ? `${areaOf(ward.ward_code)} · ` : ''}about {ward.minutes} min away
                  </Text>
                </View>
                <DemandPill level={ward.demand_level} />
              </View>
            ))
          ) : (
            <Text style={styles.caption}>No nearby wards to compare.</Text>
          )}
          {demand.nearest_high && (
            <Text style={styles.caption}>
              Nearest high-demand ward: {demand.nearest_high.ward_code}, about {demand.nearest_high.minutes} min away.
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

/** The flat card over the map. Compact by default: demand detail stays folded away until asked for. */
export function MapCard({ state, onHeight }: { state: MapCardState; onHeight: (height: number) => void }) {
  return (
    <View style={styles.card} onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      {state.kind === 'active' && (
        <>
          <Text style={styles.title}>{state.plan.name ?? state.plan.candidate_id}</Text>
          <View style={styles.metaRow}>
            {state.plan.ward_code && (
              <View style={styles.ward}>
                <Text style={styles.wardText}>Ward {state.plan.ward_code}</Text>
              </View>
            )}
            {state.kmFromBase && <Text style={styles.meta}>{state.kmFromBase} from base</Text>}
          </View>
          <Text style={styles.meta}>Planned for {formatWindow(state.plan.valid_from, state.plan.valid_to)}</Text>
          {state.demand && <DemandSection demand={state.demand} />}
          {state.point && (
            <View style={{ marginTop: 6 }}>
              <Button
                label="Open in Maps"
                icon={<MapIcon size={20} color={colors.white} />}
                onPress={() => openInMaps(state.point!.lat, state.point!.lng)}
              />
            </View>
          )}
        </>
      )}
      {state.kind === 'ended' && (
        <>
          <Text style={styles.title}>{`Your ${formatWindow(state.plan.valid_from, state.plan.valid_to)} plan has ended`}</Text>
          <Text style={styles.meta}>Waiting for the next position plan from dispatch.</Text>
        </>
      )}
      {state.kind === 'none' && (
        <>
          <Text style={styles.title}>No position assigned yet.</Text>
          <Text style={styles.meta}>
            {state.outOfService
              ? "You're out of service, so you're left out of the next position plan."
              : 'Waiting for the next position plan from dispatch.'}
          </Text>
        </>
      )}
    </View>
  )
}

export const MAP_CARD_MARGIN = 16

const styles = StyleSheet.create({
  // Flat: a 1px border and no shadow.
  card: {
    position: 'absolute',
    left: MAP_CARD_MARGIN,
    right: MAP_CARD_MARGIN,
    bottom: MAP_CARD_MARGIN,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  meta: { fontSize: 14, color: colors.muted },
  ward: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.slateBg, borderWidth: 1, borderColor: colors.border },
  wardText: { fontSize: 14, fontWeight: '600', color: colors.text },
  demand: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 4 },
  demandHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  demandTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  demandBody: { gap: 10, paddingBottom: 6 },
  caption: { fontSize: 12, color: colors.muted },
  wardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wardTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
})
