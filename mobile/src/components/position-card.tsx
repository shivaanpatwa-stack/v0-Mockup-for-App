import { Clock, Navigation, Route } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import type { CurrentAssignment } from '@/lib/api'
import { formatKm, haversineKm } from '@/lib/geo'
import { openInMaps } from '@/lib/maps'
import { formatWindow } from '@/lib/time'
import { DemandPill, levelFromScore } from './demand-pill'
import { Card } from './ui'

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
        {risk !== undefined && <DemandPill level={levelFromScore(risk)} suffix="demand" />}
      </View>

      <View style={styles.row}>
        <Clock size={18} color={colors.muted} />
        <Text style={styles.rowText}>Planned for {formatWindow(assignment.valid_from, assignment.valid_to)}</Text>
      </View>
      {hasPoint && base && (
        <View style={styles.row}>
          <Route size={18} color={colors.muted} />
          <Text style={styles.rowText}>{formatKm(haversineKm(base.lat, base.lng, lat, lng))} from base</Text>
        </View>
      )}

      {hasPoint && (
        // The primary "Open in Maps" lives on the Map tab; here it is a quiet link.
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => openInMaps(lat, lng)}
          style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
          <Text style={styles.linkText}>Open in Maps</Text>
        </Pressable>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 8, lineHeight: 30 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  ward: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.slateBg, borderWidth: 1, borderColor: colors.border },
  wardText: { fontSize: 14, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  rowText: { fontSize: 16, color: colors.text },
  link: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', marginTop: 8 },
  linkText: { fontSize: 14, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
})
