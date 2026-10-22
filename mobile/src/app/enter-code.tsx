import { Redirect } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ErrorNotice, NoticeBanner } from '@/components/notice-banner'
import { LoadingState } from '@/components/states'
import { Button, Card } from '@/components/ui'
import { colors } from '@/constants'
import { getHospital, isCodeNotFound, isNetworkError, describeError } from '@/lib/api'
import type { AppError, Hospital } from '@/lib/api'
import { useFleet } from '@/state/fleet'

// Codes look like PAREL-4821. Checking the shape first also keeps odd characters out of the HTTP header.
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,39}$/

export default function EnterCodeScreen() {
  const insets = useSafeAreaInsets()
  const { ready, hospitalCode, unitId, notice, clearNotice, connect } = useFleet()
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [found, setFound] = useState<Hospital | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [networkError, setNetworkError] = useState<AppError | null>(null)
  const [saving, setSaving] = useState(false)

  if (!ready) return <LoadingState label="Loading…" />
  // Connected (just now, or on a previous launch): carry on to the next step.
  if (hospitalCode) return <Redirect href={unitId ? '/' : '/switch-unit'} />

  const trimmed = code.trim().toUpperCase()

  async function onConnect() {
    if (checking) return
    clearNotice()
    setInlineError(null)
    setNetworkError(null)
    if (!CODE_PATTERN.test(trimmed)) {
      setInlineError('Enter a code like PAREL-4821.')
      return
    }
    setChecking(true)
    try {
      setFound(await getHospital(trimmed))
    } catch (err) {
      if (isCodeNotFound(err)) setInlineError('Code not found. Check with your dispatcher.')
      else if (isNetworkError(err)) setNetworkError(describeError(err))
      else setInlineError(describeError(err).message)
    } finally {
      setChecking(false)
    }
  }

  async function onConfirm() {
    if (!found || saving) return
    setSaving(true)
    await connect(found.code, found.name)
    // connect() stores the code, which makes this screen redirect to Select unit.
    setSaving(false)
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>AmbulanceIQ</Text>

        {found ? (
          <>
            <Text style={styles.title}>Confirm your hospital</Text>
            <Card style={{ gap: 6 }}>
              <Text style={styles.confirmTitle}>Connect to {found.name}?</Text>
              <Text style={styles.muted}>
                Code {found.code} · {found.fleet_size} {found.fleet_size === 1 ? 'ambulance' : 'ambulances'}
              </Text>
            </Card>
            <View style={{ gap: 10 }}>
              <Button label="Confirm" busy={saving} onPress={onConfirm} />
              <Button variant="outline" label="Back" disabled={saving} onPress={() => setFound(null)} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>Enter hospital code</Text>
            <Text style={styles.muted}>Your dispatcher can give you the code for your hospital.</Text>

            {notice && <NoticeBanner tone="error" message={notice} onDismiss={clearNotice} />}
            {networkError && <ErrorNotice error={networkError} onRetry={onConnect} retrying={checking} />}

            <View style={{ gap: 8 }}>
              <TextInput
                value={code}
                onChangeText={(text) => {
                  setCode(text.toUpperCase())
                  setInlineError(null)
                  if (notice) clearNotice()
                }}
                placeholder="e.g. PAREL-4821"
                placeholderTextColor={colors.faint}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                returnKeyType="go"
                onSubmitEditing={onConnect}
                editable={!checking}
                accessibilityLabel="Hospital code"
                style={[styles.input, inlineError && styles.inputError]}
              />
              {inlineError && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {inlineError}
                </Text>
              )}
            </View>
            <Button label="Connect" busy={checking} disabled={!trimmed} onPress={onConnect} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 18 },
  brand: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 8 },
  muted: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  confirmTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  input: {
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.text,
  },
  inputError: { borderColor: colors.red },
  error: { fontSize: 14, fontWeight: '600', color: colors.red },
})
