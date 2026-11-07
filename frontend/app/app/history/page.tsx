import type { Metadata } from 'next'
import RunHistoryPage from './view'

export const metadata: Metadata = { title: 'Run history' }

export default function Page() {
  return <RunHistoryPage />
}
