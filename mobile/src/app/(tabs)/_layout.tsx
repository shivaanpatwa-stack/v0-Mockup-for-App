import { Redirect, Tabs } from 'expo-router'
import { ClipboardList, Map } from 'lucide-react-native'
import { AppHeader } from '@/components/app-header'
import { LoadingState } from '@/components/states'
import { colors } from '@/constants'
import { useFleet } from '@/state/fleet'

export default function TabsLayout() {
  const { ready, hospitalCode, unitId } = useFleet()

  if (!ready) return <LoadingState label="Loading…" />
  if (!hospitalCode) return <Redirect href="/enter-code" />
  if (!unitId) return <Redirect href="/switch-unit" />

  return (
    <Tabs
      screenOptions={{
        header: () => <AppHeader />,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '700' },
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border, height: 84, paddingTop: 8 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Assignment', tabBarIcon: ({ color }) => <ClipboardList size={26} color={color} /> }}
      />
      <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: ({ color }) => <Map size={26} color={color} /> }} />
    </Tabs>
  )
}
