import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { colors } from '@/constants'
import { buildMapHtml } from './map-html'
import type { MapPoint } from './map-html'

export type { MapPoint }

export function AssignedMap({ assigned, base, height = 280 }: { assigned: MapPoint | null; base: MapPoint | null; height?: number }) {
  const html = useMemo(() => buildMapHtml(assigned, base), [assigned, base])

  return (
    <View style={[styles.frame, { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://localhost/' }}
        javaScriptEnabled
        nestedScrollEnabled
        style={styles.web}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: '#E7EEF0' },
  web: { flex: 1, backgroundColor: 'transparent' },
})
