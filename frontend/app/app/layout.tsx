import AppShell from '@/components/app/shell'
import { AppProvider } from '@/lib/app-state'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  )
}
