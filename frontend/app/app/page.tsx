import type { Metadata } from 'next'
import LiveMapPage from './view'

export const metadata: Metadata = { title: 'Live map' }

export default function Page() {
  return <LiveMapPage />
}
