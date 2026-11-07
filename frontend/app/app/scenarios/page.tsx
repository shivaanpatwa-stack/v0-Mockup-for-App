import type { Metadata } from 'next'
import ScenariosPage from './view'

export const metadata: Metadata = { title: 'Scenarios' }

export default function Page() {
  return <ScenariosPage />
}
