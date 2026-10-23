import { Redirect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ProfileButton } from '@/components/app-header'
import { ErrorNotice, RateLimitNotice } from '@/components/notice-banner'
import { EmptyState, LoadingState } from '@/components/states'
import { Button, StatusBadge, TypeBadge } from '@/components/ui'
import { colors } from '@/constants'
import { useFocusedPolling } from '@/hooks/use-focused-polling'
import { useFleet } from '@/state/fleet'

export default function SelectUnitScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { ready, hospitalCode, hospitalName, fleet, fleetLoaded, error, rateLimitUntil, refresh, selectUnit, changeHospital } = useFleet()
  const [picked, setPicked] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const poll = useCallback(() => {
    refresh()
  }, [refresh])
  useFocusedPolling(poll)

  if (!ready) return <LoadingState label="Loading…" />
  if (!hospitalCode) return <Redirect href="/enter-code" />

  const active = fleet.filter((u) => u.status !== 'unavailable').length

  async function onRetry() {
    setRetrying(true)
    await refresh({ force: true })
    setRetrying(false)
  }

  async function onContinue() {
    if (!picked) return
    await selectUnit(picked)
    router.replace('/')
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.barTitles}>
          <Text style={styles.barTitle}>Select unit</Text>
          <Text style={styles.barHospital} numberOfLines={1}>
            {hospitalName ?? ' '}
          </Text>
        </View>
        <ProfileButton />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Select your unit</Text>
          {fleetLoaded && fleet.length > 0 && (
            <View style={styles.count}>
              <Text style={styles.countText}>{active} active</Text>
            </View>
          )}
        </View>
        <Text style={styles.subtitle}>Choose the ambulance you're driving today</Text>

        <RateLimitNotice until={rateLimitUntil} />
        {error && <ErrorNotice error={error} stale={fleetLoaded} onRetry={onRetry} retrying={retrying} />}

        {!fleetLoaded && !error ? (
          <LoadingState label="Loading fleet…" />
        ) : fleetLoaded && fleet.length === 0 ? (
          <View style={{ gap: 12 }}>
            <EmptyState title="No ambulances yet" message={`${hospitalName ?? 'This hospital'} has no ambulances registered. Ask your dispatcher to add one.`} />
            <Button variant="outline" label="Check again" busy={retrying} onPress={onRetry} />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {fleet.map((u) => {
              const selected = u.call_sign === picked
              return (
                <Pressable
                  key={u.call_sign}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => setPicked(u.call_sign)}>
                  <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
                  <Text style={styles.callSign} numberOfLines={1}>
                    {u.call_sign}
                  </Text>
                  <TypeBadge type={u.type} />
                  <View style={{ flex: 1 }} />
                  <StatusBadge status={u.status} />
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button label="Continue" disabled={!picked} onPress={onContinue} />
        <Pressable accessibilityRole="link" hitSlop={8} onPress={changeHospital} style={styles.link}>
          <Text style={styles.linkText}>Not your hospital? Change hospital</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 12, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  barTitles: { flex: 1, minWidth: 0 },
  barTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  barHospital: { fontSize: 14, color: colors.muted, marginTop: 1 },
  content: { padding: 20, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  count: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.slateBg },
  countText: { fontSize: 13, fontWeight: '700', color: colors.slate },
  subtitle: { fontSize: 16, color: colors.muted, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  rowSelected: { borderColor: colors.primary, borderWidth: 2 },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.white },
  callSign: { fontSize: 18, fontWeight: '800', color: colors.text, flexShrink: 0 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  link: { alignSelf: 'center' },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.muted, textDecorationLine: 'underline' },
})
