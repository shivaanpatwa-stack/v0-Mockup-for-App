import { Ambulance } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { colors, STATUS_META } from '@/constants'
import type { FleetUnit } from '@/lib/api'
import { Card, Pill, TypeBadge } from './ui'

const DUTY_LABELS: Record<string, string> = {
  available: 'Duty: Available',
  responding: 'Duty: Responding',
  at_hospital: 'Duty: At Hospital',
  unavailable: 'Duty: Off Service',
}

export function UnitCard({ unit }: { unit: FleetUnit }) {
  const meta = STATUS_META[unit.status]
  const dutyLabel = DUTY_LABELS[unit.status] ?? `Duty: ${meta.label}`

  return (
    <Card style={styles.card}>
      <View style={styles.icon}>
        <Ambulance size={24} color={colors.accent} />
      </View>
      <View style={styles.titles}>
        <View style={styles.idRow}>
          <Text style={styles.id}>Unit {unit.call_sign}</Text>
          <TypeBadge type={unit.type} />
        </View>
        <Text style={styles.sub}>
          {unit.type === 'ALS' ? 'Advanced Life Support' : 'Basic Life Support'}
        </Text>
      </View>
      <View style={styles.badgeWrapper}>
        <Pill label={dutyLabel} color={meta.color} bg={meta.bg} dot />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.greenBg, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0 },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  id: { fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  badgeWrapper: { alignItems: 'flex-end' },
})
