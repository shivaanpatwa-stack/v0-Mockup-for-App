import { Alert, Linking, Platform } from 'react-native'

export function openInMaps(lat: number, lng: number, label: string) {
  const encoded = encodeURIComponent(label)
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${lat},${lng}&q=${encoded}`
      : `geo:${lat},${lng}?q=${lat},${lng}(${encoded})`
  Linking.openURL(url).catch(() => Alert.alert('Maps unavailable', "Couldn't open a maps app on this device."))
}
