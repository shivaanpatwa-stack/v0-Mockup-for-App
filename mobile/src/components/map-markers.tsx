import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import type { UnitType } from '@/lib/api'

/** "AMB-01" -> "01", "123" -> "123", "ALPHA" -> "AL": short enough to sit inside the circle. */
export function shortLabel(callSign: string): string {
  const digits = callSign.match(/\d+$/)?.[0]
  return digits ? digits.slice(-3) : callSign.trim().slice(0, 2).toUpperCase()
}

/** The base: a navy rounded square with a white cross. */
export function HospitalMarkerView() {
  return (
    <View style={styles.hospital}>
      <View style={[styles.bar, { width: 18, height: 4 }]} />
      <View style={[styles.bar, { width: 4, height: 18, position: 'absolute' }]} />
    </View>
  )
}

/** The unit's staging position: ALS is solid navy, BLS is white with a navy border. */
export function UnitMarkerView({ label, type }: { label: string; type: UnitType }) {
  const solid = type === 'ALS'
  return (
    <View style={[styles.unit, { backgroundColor: solid ? colors.primary : colors.white }]}>
      <Text style={[styles.unitText, { color: solid ? colors.white : colors.primary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hospital: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  bar: { backgroundColor: colors.white, borderRadius: 1 },
  unit: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  unitText: { fontSize: 14, fontWeight: '800' },
})
