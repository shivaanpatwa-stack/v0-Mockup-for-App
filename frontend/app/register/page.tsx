import Link from 'next/link'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import HospitalRegistrationForm from '@/components/hospital-registration-form'
import { CODE_COOKIE, KEY_COOKIE } from '@/lib/session'

export const metadata: Metadata = { title: 'Register hospital' }

export default async function RegisterPage() {
  // Checked on the server: the session cookies are httpOnly, so the page script can't see them.
  const jar = await cookies()
  const hasSession = Boolean(jar.get(CODE_COOKIE)?.value && jar.get(KEY_COOKIE)?.value)

  return (
    <main className="dashboard-shell reg-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Hospital onboarding</p>
          <h1>Register your hospital</h1>
        </div>
        <Link href={hasSession ? '/' : '/start'} className="reg-link">
          {hasSession ? '← Dashboard' : '← Back'}
        </Link>
      </header>
      <HospitalRegistrationForm hasSession={hasSession} />
    </main>
  )
}
