import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { colors } from '@/constants'
import { FleetProvider } from '@/state/fleet'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <FleetProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </FleetProvider>
    </SafeAreaProvider>
  )
}
