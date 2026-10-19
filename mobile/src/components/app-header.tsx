import { ArrowLeftRight, User } from 'lucide-react-native'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/constants'
import { API_URL } from '@/lib/config'
import { useFleet } from '@/state/fleet'

export function ProfileButton() {
  const { unit, hospitalName, hospitalCode } = useFleet()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Profile"
      style={styles.profile}
      onPress={() =>
        Alert.alert(
          unit ? `Unit ${unit.call_sign}` : 'Not signed in to a unit',
          `${hospitalName ?? 'No hospital'}${hospitalCode ? ` (${hospitalCode})` : ''}\nServer: ${API_URL}`,
        )
      }>
      <User size={20} color={colors.white} />
    </Pressable>
  )
}

export function AppHeader() {
  const insets = useSafeAreaInsets()
  const { hospitalName, clearUnit } = useFleet()

  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.titles}>
        <Text style={styles.brand} numberOfLines={1}>
          AmbulanceIQ
        </Text>
        <Text style={styles.hospital} numberOfLines={1}>
          {hospitalName ?? ' '}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.switch, pressed && { opacity: 0.8 }]}
        onPress={clearUnit}>
        <ArrowLeftRight size={18} color={colors.primary} />
        <Text style={styles.switchText}>Switch unit</Text>
      </Pressable>
      <ProfileButton />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.bg,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titles: { flex: 1, minWidth: 110 },
  brand: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  hospital: { fontSize: 14, color: colors.muted, marginTop: 1 },
  switch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  switchText: { fontSize: 14, fontWeight: '600', color: colors.text },
  profile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
