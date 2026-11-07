import Link from 'next/link'
import { APP_NAME } from '@/lib/config'

// Temporary until the landing page (step 6) lands. The old single-page dashboard now lives at /app.
export default function Home() {
  return (
    <main className="auth">
      <h1>{APP_NAME}</h1>
      <p className="start-hint">
        <Link href="/app">Open the live map</Link>
      </p>
    </main>
  )
}
