import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants'
import { HospitalMarkerView, UnitMarkerView } from './map-markers'
import type { TripMapProps } from './trip-map-types'

// react-native-maps has no web implementation. This stand-in keeps the screen usable in a browser preview and shows the
// two marker styles; the real map only exists in the iOS/Android app.
export function TripMap({ hospital, assigned }: TripMapProps) {
  return (
    <View style={styles.fill}>
      <Text style={styles.note}>The map isn't available in the web preview. Open the app on a phone.</Text>
      <View style={styles.row}>
        {hospital && <HospitalMarkerView />}
        {assigned && <UnitMarkerView label={assigned.label} type={assigned.type} />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#DCE6EA', alignItems: 'center', justifyContent: 'center', gap: 16 },
  note: { color: colors.muted, fontSize: 14, paddingHorizontal: 32, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 40, alignItems: 'center' },
})
