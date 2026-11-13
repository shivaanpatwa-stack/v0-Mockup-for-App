import { Clock, Flame, Map, Navigation, Ruler } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import type { CurrentAssignment } from '@/lib/api'
import { demandLevel, formatKm, haversineKm } from '@/lib/geo'
import type { DemandLevel } from '@/lib/geo'
import { estimateRoadTravel, formatHospitalName } from '@/lib/format'
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
  base?: { name?: string | null; lat: number; lng: number }
}

export function PositionCard({ assignment, risk, base }: Props) {
  const title = assignment.name ?? assignment.candidate_id
  const { lat, lng } = assignment
  const hasPoint = lat != null && lng != null
  const level = risk === undefined ? null : demandLevel(risk)

  const distKm = hasPoint && base ? haversineKm(base.lat, base.lng, lat, lng) : null
  const roadTravel = distKm != null ? estimateRoadTravel(distKm) : null
  const baseName = formatHospitalName(base?.name)

  return (
    <Card>
      <View style={styles.eyebrowRow}>
        <Navigation size={14} color={colors.accent} />
        <Text style={styles.eyebrow}>Recommended staging position</Text>
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
            <Flame size={14} color={DEMAND_STYLE[level].color} />
            <Text style={[styles.demandText, { color: DEMAND_STYLE[level].color }]}>
              {DEMAND_STYLE[level].label} zone
            </Text>
          </View>
        )}
      </View>

      <View style={styles.row}>
        <Clock size={16} color={colors.muted} />
        <Text style={styles.rowText}>Planned for {formatWindow(assignment.valid_from, assignment.valid_to)}</Text>
      </View>
      {hasPoint && base && distKm != null && roadTravel && (
        <View style={[styles.row, { marginTop: 6 }]}>
          <Ruler size={16} color={colors.muted} />
          <Text style={styles.smallText}>
            {formatKm(distKm)} from {baseName} base · <Text style={styles.etaHighlight}>{roadTravel.etaText} drive</Text> ({roadTravel.roadKmText})
          </Text>
        </View>
      )}

      {hasPoint && (
        <View style={{ marginTop: 12 }}>
          <Button
            variant="outline"
            label="Open in Maps"
            icon={<Map size={18} color={colors.text} />}
            onPress={() => openInMaps(lat, lng)}
          />
        </View>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { fontSize: 13, color: colors.accent, fontWeight: '600', letterSpacing: 0.2 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 4, lineHeight: 28 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  ward: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.slateBg },
  wardText: { fontSize: 13, fontWeight: '600', color: colors.text },
  demand: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  demandText: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  rowText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  smallText: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  etaHighlight: { color: colors.accent, fontWeight: '700' },
})
