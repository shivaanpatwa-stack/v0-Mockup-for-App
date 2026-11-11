import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import type { UnitType } from '@/lib/api'

/** The full call sign, never shortened: dispatchers radio units by this ID. */
export function shortLabel(callSign: string): string {
  return callSign.trim()
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
    <View style={[styles.unit, { backgroundColor: solid ? colors.primary : colors.card }]}>
      <Text style={[styles.unitText, { color: solid ? colors.white : colors.accent }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hospital: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  bar: { backgroundColor: colors.white, borderRadius: 1 },
  unit: { minWidth: 40, height: 40, paddingHorizontal: 10, borderRadius: 20, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  unitText: { fontSize: 13, fontWeight: '800' },
})
