import { ArrowLeftRight, User } from 'lucide-react-native'
import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/constants'
import { confirm } from '@/lib/confirm'
import { API_URL } from '@/lib/config'
import { displayName, UNIT_TYPE_NAME } from '@/lib/format'
import { useFleet } from '@/state/fleet'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

/** The profile button and the menu behind it: who and where you are signed in, and Switch unit (with a confirmation). */
export function ProfileMenu() {
  const insets = useSafeAreaInsets()
  const { unit, hospitalName, hospitalCode, clearUnit } = useFleet()
  const [open, setOpen] = useState(false)

  async function onSwitchUnit() {
    setOpen(false)
    const ok = await confirm(
      'Switch unit?',
      "You'll be asked to pick a unit again, and this unit's saved offline data on this phone is cleared.",
      'Switch unit',
    )
    if (ok) await clearUnit()
  }

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Account menu" style={styles.button} onPress={() => setOpen(true)}>
        <User size={20} color={colors.white} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
        <View style={[styles.menu, { top: insets.top + 64 }]}>
          <Row label="Hospital" value={`${displayName(hospitalName) || 'Not set'}${hospitalCode ? ` (${hospitalCode})` : ''}`} />
          {unit && <Row label="Unit" value={`${unit.call_sign} · ${UNIT_TYPE_NAME[unit.type]}`} />}
          <Row label="Server" value={API_URL} />
          {unit && (
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]} onPress={onSwitchUnit}>
              <ArrowLeftRight size={18} color={colors.primary} />
              <Text style={styles.actionText}>Switch unit</Text>
            </Pressable>
          )}
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.25)' },
  // Flat card, anchored under the button: a 1px border and no shadow.
  menu: {
    position: 'absolute',
    right: 16,
    width: 300,
    maxWidth: '90%',
    padding: 16,
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  row: { gap: 2 },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted },
  value: { fontSize: 14, color: colors.text },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionText: { fontSize: 16, fontWeight: '600', color: colors.primary },
})
