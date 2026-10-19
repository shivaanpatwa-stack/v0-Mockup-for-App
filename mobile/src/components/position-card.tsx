import { Clock, Flame, Map, Navigation, Ruler } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import type { CurrentAssignment } from '@/lib/api'
import { demandLevel, formatKm, haversineKm } from '@/lib/geo'
import type { DemandLevel } from '@/lib/geo'
import { openInMaps } from '@/lib/maps'
import { formatWindow } from '@/lib/time'
import { Button, Card } from './ui'

export const DEMAND_STYLE: Record<DemandLevel, { label: string; color: string; bg: string }> = {
  high: { label: 'High demand', color: colors.red, bg: colors.redBg },
  medium: { label: 'Medium demand', color: colors.amber, bg: colors.amberBg },
  low: { label: 'Low demand', color: colors.green, bg: colors.greenBg },
}

type Props = {
  assignment: CurrentAssignment
  /** Risk score for the assignment's ward at its planned hour, if known. */
  risk?: number
  base?: { lat: number; lng: number }
}

export function PositionCard({ assignment, risk, base }: Props) {
  const title = assignment.name ?? assignment.candidate_id
  const { lat, lng } = assignment
  const hasPoint = lat != null && lng != null
  const level = risk === undefined ? null : demandLevel(risk)

  return (
    <Card>
      <View style={styles.eyebrowRow}>
        <Navigation size={16} color={colors.muted} />
        <Text style={styles.eyebrow}>Your recommended position</Text>
      </View>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.chips}>
        {assignment.ward_code && (
          <View style={styles.ward}>
            <Text style={styles.wardText}>Ward {assignment.ward_code}</Text>
          </View>
        )}
        {level && (
          <View style={[styles.demand, { backgroundColor: DEMAND_STYLE[level].bg }]}>
            <Flame size={16} color={DEMAND_STYLE[level].color} />
            <Text style={[styles.demandText, { color: DEMAND_STYLE[level].color }]}>
              {DEMAND_STYLE[level].label} zone
            </Text>
          </View>
        )}
      </View>

      <View style={styles.row}>
        <Clock size={20} color={colors.muted} />
        <Text style={styles.rowText}>Planned for {formatWindow(assignment.valid_from, assignment.valid_to)}</Text>
      </View>
      {hasPoint && base && (
        <View style={[styles.row, { marginTop: 6 }]}>
          <Ruler size={16} color={colors.muted} />
          <Text style={styles.smallText}>{formatKm(haversineKm(base.lat, base.lng, lat, lng))} from base</Text>
        </View>
      )}

      {hasPoint && (
        <View style={{ marginTop: 18 }}>
          <Button
            variant="outline"
            label="Open in Maps"
            icon={<Map size={20} color={colors.primary} />}
            onPress={() => openInMaps(lat, lng, title)}
          />
        </View>
      )}
    </Card>
  )
}


const styles = StyleSheet.create({
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 15, color: colors.muted, fontWeight: '500' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 8, lineHeight: 34 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  ward: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: colors.slateBg, borderWidth: 1, borderColor: colors.border },
  wardText: { fontSize: 15, fontWeight: '600', color: colors.text },
  demand: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 },
  demandText: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  rowText: { fontSize: 18, color: colors.text },
  smallText: { fontSize: 15, color: colors.muted },
})
