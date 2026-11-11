import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import type { DemandLevel } from '@/lib/api'
import { demandLevel } from '@/lib/geo'

const STYLE: Record<DemandLevel, { color: string; bg: string }> = {
  High: { color: colors.red, bg: colors.redBg },
  Medium: { color: colors.amber, bg: colors.amberBg },
  Low: { color: colors.green, bg: colors.greenBg },
}

const FROM_GEO = { high: 'High', medium: 'Medium', low: 'Low' } as const

/** A demand level from a 0-1 risk score, using the app's single set of thresholds. */
export const levelFromScore = (score: number): DemandLevel => FROM_GEO[demandLevel(score)]

/**
 * The one way demand is shown, on every screen: a coloured dot plus the word, never colour alone.
 * `suffix` adds context where the pill stands alone, e.g. "High demand".
 */
export function DemandPill({ level, suffix }: { level: DemandLevel; suffix?: string }) {
  const { color, bg } = STYLE[level] ?? STYLE.Low
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} accessibilityLabel={`${level} demand`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{suffix ? `${level} ${suffix}` : level}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '700' },
})
