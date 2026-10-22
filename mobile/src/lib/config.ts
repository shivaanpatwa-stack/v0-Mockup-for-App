import Constants from 'expo-constants'

// EXPO_PUBLIC_API_URL wins. Otherwise assume the backend runs on the same machine as the Expo dev
// server (hostUri is e.g. "192.168.1.5:8081"), which is what a phone on the same Wi-Fi needs.
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  return `http://${host ?? 'localhost'}:8000`
}

export const API_URL = resolveApiUrl()
export const CARTO_API_KEY = process.env.EXPO_PUBLIC_CARTO_API_KEY?.trim() || undefined
