import type { Metadata } from 'next'
import AppShell from '@/components/app/shell'
import { AppProvider } from '@/lib/app-state'

export const metadata: Metadata = { title: 'Live map' }

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  )
}
