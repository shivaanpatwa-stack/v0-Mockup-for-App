import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import { Button, Card } from './ui'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  )
}

export function ErrorState({ title = "Can't load your data", message, onRetry }: { title?: string; message: string; onRetry: () => void }) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted}>{message}</Text>
      <Button label="Try again" onPress={onRetry} />
    </Card>
  )
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted}>{message}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 10, paddingVertical: 48 },
  card: { gap: 10 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  muted: { fontSize: 15, color: colors.muted, lineHeight: 21 },
})
