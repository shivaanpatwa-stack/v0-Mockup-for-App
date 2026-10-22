import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '@/constants'
import { buildMapHtml } from './map-html'
import type { MapPoint } from './map-html'

export type { MapPoint }

// react-native-webview has no web implementation, so the web build shows the same Leaflet page in an iframe.
export function AssignedMap({ assigned, base, height = 280 }: { assigned: MapPoint | null; base: MapPoint | null; height?: number }) {
  const html = useMemo(() => buildMapHtml(assigned, base), [assigned, base])

  return (
    <View style={[styles.frame, { height }]}>
      <iframe title="Assigned position map" srcDoc={html} style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: '#E7EEF0' },
})
