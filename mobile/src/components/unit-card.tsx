import { Ambulance } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import type { FleetUnit } from '@/lib/api'
import { Card, StatusBadge, TypeBadge } from './ui'

export function UnitCard({ unit }: { unit: FleetUnit }) {
  return (
    <Card style={styles.card}>
      <View style={styles.icon}>
        <Ambulance size={26} color={colors.text} />
      </View>
      <View style={styles.titles}>
        <Text style={styles.id}>{unit.call_sign}</Text>
        <Text style={styles.sub}>Ambulance unit</Text>
      </View>
      <View style={styles.badges}>
        <TypeBadge type={unit.type} />
        <StatusBadge status={unit.status} />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  icon: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.slateBg, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0 },
  id: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { fontSize: 14, color: colors.muted },
  badges: { alignItems: 'flex-end', gap: 6 },
})
