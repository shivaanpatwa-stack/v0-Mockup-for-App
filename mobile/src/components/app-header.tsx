import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/constants'
import { displayName } from '@/lib/format'
import { formatIstClock } from '@/lib/time'
import { useFleet } from '@/state/fleet'
import { ProfileMenu } from './profile-menu'

/** Always visible, so how fresh the data is never depends on scrolling to the bottom of a screen. */
function FreshnessLine() {
  const { dataAt, offline, rateLimitUntil } = useFleet()

  let dot: string = colors.green
  let text = 'Updating…'
  if (rateLimitUntil) {
    dot = colors.amberDot
    text = 'Paused: too many attempts'
  } else if (offline) {
    dot = colors.amberDot
    text = dataAt ? `Offline · data from ${formatIstClock(new Date(dataAt))}` : 'Offline'
  } else if (dataAt) {
    text = `Updated ${formatIstClock(new Date(dataAt))}`
  } else {
    dot = colors.faint
  }

  return (
    <View style={styles.freshness} accessibilityLiveRegion="polite">
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={styles.freshnessText}>{text}</Text>
    </View>
  )
}

export function AppHeader() {
  const insets = useSafeAreaInsets()
  const { hospitalName, unit, unitId } = useFleet()
  const unitLabel = unit?.call_sign ?? unitId

  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.row}>
        <View style={styles.titles}>
          <Text style={styles.brand} numberOfLines={1}>
            AmbulanceIQ
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {[displayName(hospitalName), unitLabel ? `Unit ${unitLabel}` : ''].filter(Boolean).join(' · ') || ' '}
          </Text>
        </View>
        <ProfileMenu />
      </View>
      <FreshnessLine />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: colors.bg,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titles: { flex: 1, minWidth: 110 },
  brand: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 1 },
  freshness: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  freshnessText: { fontSize: 12, color: colors.muted },
})
