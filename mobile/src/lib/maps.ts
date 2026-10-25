import { Alert, Linking } from 'react-native'

// A plain https link: it opens the Google Maps app if installed, otherwise the browser. No native config needed.
export async function openInMaps(lat: number, lng: number): Promise<void> {
  try {
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`)
  } catch {
    Alert.alert("Couldn't open Maps")
  }
}
