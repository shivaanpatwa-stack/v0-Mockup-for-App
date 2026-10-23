import Link from 'next/link'
import type { Metadata } from 'next'
import SignInCard from '@/components/sign-in-card'

export const metadata: Metadata = { title: 'Get started' }

export default function StartPage() {
  return (
    <main className="dashboard-shell start-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Fleet intelligence</p>
          <h1>Ambulance Response Optimization Platform</h1>
        </div>
      </header>
      <div className="start-grid">
        <section className="start-card">
          <h2>Register a hospital</h2>
          <p className="start-hint">
            Set up your hospital, its location and its ambulances. You&apos;ll get a driver code for the app and a
            dashboard key for this site.
          </p>
          <Link href="/register" className="reg-submit start-link">
            Register a hospital
          </Link>
        </section>
        <SignInCard />
      </div>
    </main>
  )
}
