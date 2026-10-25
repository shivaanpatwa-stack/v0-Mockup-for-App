import { Info, TriangleAlert, X } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import { NETWORK_MESSAGE, RATE_LIMIT_MESSAGE } from '@/lib/api'
import type { AppError } from '@/lib/api'
import { formatIstClock } from '@/lib/time'

type Tone = 'warning' | 'error' | 'info'

const TONES: Record<Tone, { bg: string; border: string; color: string }> = {
  warning: { bg: colors.amberBg, border: '#F0D08A', color: colors.amber },
  error: { bg: colors.redBg, border: '#F7BDBD', color: colors.red },
  info: { bg: colors.blueBg, border: '#BFD4F5', color: colors.primary },
}

type Props = {
  tone?: Tone
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
  disabled?: boolean
}

export function NoticeBanner({ tone = 'warning', message, actionLabel, onAction, onDismiss, disabled }: Props) {
  const palette = TONES[tone]
  const Icon = tone === 'info' ? Info : TriangleAlert

  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Icon size={20} color={palette.color} />
      <View style={styles.body}>
        <Text style={[styles.message, { color: tone === 'info' ? colors.text : palette.color }]}>{message}</Text>
        {actionLabel && onAction && (
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            hitSlop={8}
            onPress={onAction}
            style={({ pressed }) => [styles.action, { borderColor: palette.color }, (pressed || disabled) && { opacity: 0.6 }]}>
            <Text style={[styles.actionText, { color: palette.color }]}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
      {onDismiss && (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} onPress={onDismiss}>
          <X size={18} color={palette.color} />
        </Pressable>
      )}
    </View>
  )
}

/** Network failures are a warning with Retry; HTTP errors show the backend's own text. */
export function ErrorNotice({
  error,
  stale,
  onRetry,
  onDismiss,
  retrying,
}: {
  error: AppError
  /** Older data is still on screen. */
  stale?: boolean
  onRetry?: () => void
  onDismiss?: () => void
  retrying?: boolean
}) {
  if (error.kind === 'rate-limit') return <NoticeBanner tone="warning" message={error.message} onDismiss={onDismiss} />

  return error.kind === 'network' ? (
    <NoticeBanner
      tone="warning"
      message={stale ? `${error.message} Showing the last known data.` : error.message}
      actionLabel={retrying ? 'Retrying…' : 'Retry'}
      onAction={onRetry}
      disabled={retrying}
      onDismiss={onDismiss}
    />
  ) : (
    <NoticeBanner tone="error" message={error.message} onDismiss={onDismiss} />
  )
}

const STALE_AFTER_MS = 30 * 60_000

/** The server can't be reached and the screen is showing the cache. */
export function OfflineNotice({ cachedAt, onRetry, retrying }: { cachedAt: number | null; onRetry?: () => void; retrying?: boolean }) {
  const stale = cachedAt !== null && Date.now() - cachedAt > STALE_AFTER_MS
  const message =
    cachedAt === null
      ? NETWORK_MESSAGE
      : `${NETWORK_MESSAGE} Showing last known position. Cached at ${formatIstClock(new Date(cachedAt))}${stale ? '\nData may be out of date' : ''}`
  return (
    <NoticeBanner
      tone="warning"
      message={message}
      actionLabel={retrying ? 'Retrying…' : 'Retry'}
      onAction={onRetry}
      disabled={retrying}
    />
  )
}

/** Briefly shown when a poll succeeds again after being offline. */
export function BackOnlineNotice({ show }: { show: boolean }) {
  return show ? <NoticeBanner tone="info" message="Back online." /> : null
}

/** Shown while the server has told this device to stop (429). Polling is paused until it ends. */
export function RateLimitNotice({ until }: { until: number | null }) {
  return until ? <NoticeBanner tone="warning" message={RATE_LIMIT_MESSAGE} /> : null
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  body: { flex: 1, gap: 10 },
  message: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  action: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.6)' },
  actionText: { fontSize: 14, fontWeight: '800' },
})
