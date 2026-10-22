import { Bell, X } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import { formatLocalClock, relativeTime } from '@/lib/time'
import type { PositionUpdate } from '@/state/fleet'

export function PositionUpdateBanner({ update, onDismiss }: { update: PositionUpdate; onDismiss: () => void }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.icon}>
        <Bell size={22} color={colors.white} />
      </View>
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.title}>Position updated</Text>
          <View style={styles.when}>
            <Text style={styles.whenText}>{relativeTime(update.revisedAt)}</Text>
          </View>
        </View>
        <Text style={styles.line}>
          New staging: <Text style={styles.strong}>{update.name}</Text>
        </Text>
        <Text style={styles.small}>Plan revised at {formatLocalClock(update.revisedAt)}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} onPress={onDismiss}>
        <X size={22} color={colors.text} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 14, backgroundColor: colors.blueBg, borderWidth: 1, borderColor: '#BFD4F5' },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  when: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  whenText: { fontSize: 13, fontWeight: '600', color: colors.text },
  line: { fontSize: 17, color: colors.text, marginTop: 4 },
  strong: { fontWeight: '800', color: colors.primary },
  small: { fontSize: 14, color: colors.muted, marginTop: 4 },
})
