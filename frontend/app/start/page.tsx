import Link from 'next/link'
import type { Metadata } from 'next'
import SignInCard from '@/components/sign-in-card'
import Wordmark from '@/components/app/wordmark'

export const metadata: Metadata = { title: 'Sign in' }

export default function StartPage() {
  return (
    <main className="auth">
      <div className="auth-head">
        <Wordmark href="/" />
      </div>
      <div className="start-grid">
        <section className="start-intro" aria-labelledby="new-hospital">
          <h1 id="new-hospital">Plan where your ambulances wait between calls</h1>
          <p className="start-hint">
            Register your hospital once. The planner then recommends a staging position for each unit, hour by
            hour, across Mumbai&apos;s 24 wards.
          </p>
          <ol>
            <li>Name the hospital, set how far your units can go and list them by call sign.</li>
            <li>Drop a pin on the hospital&apos;s location.</li>
            <li>Save the hospital code for drivers and the dashboard key for this site.</li>
          </ol>
          <Link href="/register" className="reg-submit start-link">
            Register a hospital
          </Link>
        </section>
        <SignInCard />
      </div>
    </main>
  )
}
