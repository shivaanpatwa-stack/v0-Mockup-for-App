import { Ambulance, ChevronDown } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, STATUS_META } from '@/constants'
import type { FleetUnit } from '@/lib/api'
import { UNIT_TYPE_NAME } from '@/lib/format'
import { Card } from './ui'

type Props = {
  unit: FleetUnit
  /** Opens the availability sheet. The status pill is the control, so there is no separate button for it. */
  onPressStatus: () => void
  /** Off while the server can't be reached: nothing can be saved, so nothing is offered. */
  statusDisabled?: boolean
}

export function UnitCard({ unit, onPressStatus, statusDisabled }: Props) {
  const meta = STATUS_META[unit.status]
  return (
    <Card style={styles.card}>
      <View style={styles.icon}>
        <Ambulance size={26} color={colors.text} />
      </View>
      <View style={styles.titles}>
        <Text style={styles.id}>{unit.call_sign}</Text>
        <Text style={styles.sub}>{UNIT_TYPE_NAME[unit.type]}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Status: ${meta.label}. Change availability`}
        accessibilityHint={statusDisabled ? 'Reconnect to update' : undefined}
        accessibilityState={{ disabled: !!statusDisabled }}
        disabled={statusDisabled}
        hitSlop={6}
        onPress={onPressStatus}
        style={({ pressed }) => [styles.status, { backgroundColor: meta.bg }, (pressed || statusDisabled) && { opacity: 0.6 }]}>
        <View style={[styles.dot, { backgroundColor: meta.color }]} />
        <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        <ChevronDown size={16} color={meta.color} />
      </Pressable>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  icon: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.slateBg, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0 },
  id: { fontSize: 20, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.muted },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingLeft: 12, paddingRight: 8, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 14, fontWeight: '700' },
})
