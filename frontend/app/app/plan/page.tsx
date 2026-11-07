import type { Metadata } from 'next'
import StagingPlanPage from './view'

export const metadata: Metadata = { title: 'Staging plan' }

export default function Page() {
  return <StagingPlanPage />
}
