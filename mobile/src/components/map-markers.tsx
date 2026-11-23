import { StyleSheet, View } from 'react-native'
import { Ambulance } from 'lucide-react-native'
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

/** The unit's staging position: round pin with ambulance icon. */
export function UnitMarkerView({ type = 'ALS' }: { label?: string; type?: UnitType }) {
  const solid = type === 'ALS'
  return (
    <View style={[styles.unit, { backgroundColor: solid ? colors.primary : colors.card }]}>
      <Ambulance size={18} color={solid ? colors.white : colors.accent} />
    </View>
  )
}

const styles = StyleSheet.create({
  hospital: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  bar: { backgroundColor: colors.white, borderRadius: 1 },
  unit: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
