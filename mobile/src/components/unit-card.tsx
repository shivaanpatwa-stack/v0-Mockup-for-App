import { Ambulance } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { colors, STATUS_META } from '@/constants'
import type { FleetUnit } from '@/lib/api'
import { Card, Pill, TypeBadge } from './ui'

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  responding: 'Responding',
  at_hospital: 'At Hospital',
  unavailable: 'Off Service',
}

export function UnitCard({ unit }: { unit: FleetUnit }) {
  const meta = STATUS_META[unit.status]
  const statusLabel = STATUS_LABELS[unit.status] ?? meta.label

  return (
    <Card style={styles.card}>
      <View style={styles.icon}>
        <Ambulance size={24} color={colors.accent} />
      </View>
      <View style={styles.titles}>
        <Text style={styles.id} numberOfLines={2}>
          Unit {unit.call_sign}
        </Text>
        <Text style={styles.sub}>
          {unit.type === 'ALS' ? 'Advanced Life Support' : 'Basic Life Support'}
        </Text>
      </View>
      <View style={styles.badgeWrapper}>
        <TypeBadge type={unit.type} />
        <Pill label={statusLabel} color={meta.color} bg={meta.bg} dot />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.greenBg, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0 },
  id: { fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  badgeWrapper: { alignItems: 'flex-end', justifyContent: 'center', gap: 6, flexShrink: 0 },
})
