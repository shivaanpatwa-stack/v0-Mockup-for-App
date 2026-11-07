import Link from 'next/link'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { ArrowLeft } from 'lucide-react'
import HospitalRegistrationForm from '@/components/hospital-registration-form'
import Wordmark from '@/components/app/wordmark'
import { CODE_COOKIE, KEY_COOKIE } from '@/lib/session'

export const metadata: Metadata = { title: 'Register a hospital' }

export default async function RegisterPage() {
  // Checked on the server: the session cookies are httpOnly, so the page script can't see them.
  const jar = await cookies()
  const hasSession = Boolean(jar.get(CODE_COOKIE)?.value && jar.get(KEY_COOKIE)?.value)

  return (
    <main className="auth">
      <div className="auth-head">
        <div>
          <Wordmark href="/" />
          <h1>Register a hospital</h1>
        </div>
        <Link href={hasSession ? '/app' : '/start'} className="reg-link">
          <ArrowLeft size={15} aria-hidden="true" />
          {hasSession ? 'Live map' : 'Sign in instead'}
        </Link>
      </div>
      <HospitalRegistrationForm hasSession={hasSession} />
    </main>
  )
}
