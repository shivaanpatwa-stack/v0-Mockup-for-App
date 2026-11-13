import { ChevronDown, ChevronUp, HelpCircle, Layers, X } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import { HospitalMarkerView, UnitMarkerView } from './map-markers'

export function MapLegend() {
  const [open, setOpen] = useState(false)

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Map legend"
        onPress={() => setOpen((prev) => !prev)}
        style={({ pressed }) => [styles.trigger, open && styles.triggerActive, pressed && { opacity: 0.85 }]}>
        <Layers size={15} color={open ? colors.white : colors.accent} />
        <Text style={[styles.triggerText, open && { color: colors.white }]}>Legend</Text>
        {open ? <ChevronUp size={14} color={colors.white} /> : <ChevronDown size={14} color={colors.muted} />}
      </Pressable>

      {open && (
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Map symbols & demand</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <X size={16} color={colors.muted} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Markers</Text>
            <View style={styles.row}>
              <View style={styles.markerMini}>
                <HospitalMarkerView />
              </View>
              <Text style={styles.desc}>Hospital Base / Dispatch Station</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.markerMini}>
                <UnitMarkerView label="124" type="ALS" />
              </View>
              <Text style={styles.desc}>Recommended Unit Staging Position</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Modelled demand zones</Text>
            <View style={styles.demandGrid}>
              <View style={styles.demandItem}>
                <View style={[styles.dot, { backgroundColor: colors.red }]} />
                <Text style={styles.demandText}>High Risk</Text>
              </View>
              <View style={styles.demandItem}>
                <View style={[styles.dot, { backgroundColor: colors.amber }]} />
                <Text style={styles.demandText}>Medium</Text>
              </View>
              <View style={styles.demandItem}>
                <View style={[styles.dot, { backgroundColor: colors.green }]} />
                <Text style={styles.demandText}>Low</Text>
              </View>
            </View>
          </View>

          <View style={styles.routeRow}>
            <View style={styles.routeLine} />
            <Text style={styles.desc}>Optimal Road Travel Route (with ETA)</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 14,
    right: 14,
    alignItems: 'flex-end',
    zIndex: 10,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  triggerActive: {
    backgroundColor: colors.primary,
    borderColor: colors.accent,
  },
  triggerText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  card: {
    marginTop: 8,
    width: 250,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  markerMini: {
    transform: [{ scale: 0.75 }],
    width: 32,
    alignItems: 'center',
  },
  desc: {
    fontSize: 12,
    color: colors.text,
    flex: 1,
  },
  demandGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(232,235,233,0.03)',
    padding: 6,
    borderRadius: 6,
  },
  demandItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  demandText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  routeLine: {
    width: 26,
    height: 3,
    backgroundColor: colors.accent,
    borderRadius: 1.5,
  },
})

