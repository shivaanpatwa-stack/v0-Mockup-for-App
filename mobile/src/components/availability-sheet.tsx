import { Check } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, STATUS_OPTIONS } from '@/constants'
import type { AmbulanceStatus, AppError } from '@/lib/api'
import type { ActionResult } from '@/state/fleet'
import { ErrorNotice } from './notice-banner'

type Props = {
  visible: boolean
  /** The unit's status as currently shown; the provider changes it immediately and rolls it back on failure. */
  current: AmbulanceStatus
  onChange: (status: AmbulanceStatus) => Promise<ActionResult>
  onClose: () => void
}

export function AvailabilitySheet({ visible, current, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState<AmbulanceStatus | null>(null)
  const [confirming, setConfirming] = useState<AmbulanceStatus | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const lastAttempt = useRef<AmbulanceStatus | null>(null)

  // Start every opening from a clean slate.
  useEffect(() => {
    if (visible) {
      setBusy(null)
      setConfirming(null)
      setError(null)
    }
  }, [visible])

  async function send(status: AmbulanceStatus) {
    lastAttempt.current = status
    setConfirming(null)
    setError(null)
    setBusy(status)
    const result = await onChange(status)
    setBusy(null)
    if (result.ok) onClose()
    else setError(result.error)
  }

  function onSelect(status: AmbulanceStatus) {
    if (busy) return // ignore taps while a request is running
    if (status === current) return onClose()
    // "Out of service" removes the unit from the next plan, so it takes a second tap.
    if (status === 'unavailable' && confirming !== 'unavailable') {
      setError(null)
      setConfirming('unavailable')
      return
    }
    send(status)
  }

  function onRequestClose() {
    if (!busy) onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRequestClose}>
      <Pressable style={styles.backdrop} onPress={onRequestClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Change availability</Text>
        <Text style={styles.subtitle}>Update status visible to central dispatch</Text>

        {error && (
          <View style={{ marginBottom: 12 }}>
            <ErrorNotice
              error={error}
              onRetry={() => lastAttempt.current && send(lastAttempt.current)}
              onDismiss={() => setError(null)}
            />
          </View>
        )}

        <View style={styles.options}>
          {STATUS_OPTIONS.map(({ value, meta }) => {
            const selected = value === current
            const isBusy = busy === value
            const isConfirming = confirming === value
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected, busy: isBusy, disabled: !!busy && !isBusy }}
                style={[
                  styles.option,
                  selected && { borderColor: meta.color, borderWidth: 2 },
                  isConfirming && { borderColor: meta.color, borderWidth: 2, backgroundColor: meta.bg },
                  !!busy && !isBusy && { opacity: 0.55 },
                ]}
                onPress={() => onSelect(value)}>
                <View style={[styles.dot, { backgroundColor: meta.color }]} />
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{meta.label}</Text>
                  <Text style={styles.optionDesc}>{meta.description}</Text>
                  {meta.note && <Text style={styles.optionNote}>{meta.note}</Text>}
                  {isConfirming && <Text style={[styles.confirm, { color: meta.color }]}>Tap again to confirm</Text>}
                </View>
                <View style={[styles.radio, selected && { borderColor: meta.color }]}>
                  {isBusy ? <ActivityIndicator size="small" color={meta.color} /> : selected ? <Check size={18} color={meta.color} /> : null}
                </View>
              </Pressable>
            )
          })}
        </View>

        <Pressable accessibilityRole="button" disabled={!!busy} style={[styles.cancel, !!busy && { opacity: 0.55 }]} onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 52, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 18 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 4, marginBottom: 16 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  dot: { width: 14, height: 14, borderRadius: 7, alignSelf: 'flex-start', marginTop: 5 },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  optionDesc: { fontSize: 14, color: colors.muted, marginTop: 2 },
  optionNote: { fontSize: 13, color: colors.muted, marginTop: 6, fontWeight: '600' },
  confirm: { fontSize: 14, fontWeight: '800', marginTop: 6 },
  radio: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancel: { marginTop: 16, height: 52, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 17, fontWeight: '700', color: colors.text },
})
