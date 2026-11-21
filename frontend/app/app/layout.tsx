import AppShell from '@/components/app/shell'
import OnboardingProvider from '@/components/onboarding/onboarding-provider'
import { AppProvider } from '@/lib/app-state'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <OnboardingProvider>
        <AppShell>{children}</AppShell>
      </OnboardingProvider>
    </AppProvider>
  )
}
