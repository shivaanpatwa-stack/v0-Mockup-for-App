import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { PressableProps, StyleProp, ViewStyle } from 'react-native'
import { colors, STATUS_META } from '@/constants'
import type { AmbulanceStatus, UnitType } from '@/lib/api'

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Pill({ label, color, bg, dot }: { label: string; color: string; bg: string; dot?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {dot && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  )
}

export function TypeBadge({ type }: { type: UnitType }) {
  return type === 'ALS' ? (
    <Pill label="ALS" color={colors.blueText} bg={colors.blueBg} />
  ) : (
    <Pill label="BLS" color={colors.indigo} bg={colors.indigoBg} />
  )
}

export function StatusBadge({ status }: { status: AmbulanceStatus }) {
  const meta = STATUS_META[status]
  return <Pill label={meta.label} color={meta.color} bg={meta.bg} dot />
}

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string
  icon?: ReactNode
  variant?: 'primary' | 'outline'
  busy?: boolean
}

export function Button({ label, icon, variant = 'primary', busy, disabled, ...props }: ButtonProps) {
  const isPrimary = variant === 'primary'
  const inactive = disabled || busy
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonOutline,
        inactive && styles.buttonDisabled,
        pressed && { opacity: 0.85 },
      ]}
      {...props}>
      {icon}
      <Text style={[styles.buttonText, { color: isPrimary ? colors.white : colors.primary }]}>
        {busy ? 'Working…' : label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: {
    minHeight: 50,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonOutline: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { fontSize: 16, fontWeight: '700' },
})
