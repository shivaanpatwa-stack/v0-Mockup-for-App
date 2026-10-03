import Link from 'next/link'
import type { Metadata } from 'next'
import HospitalRegistrationForm from '@/components/hospital-registration-form'

export const metadata: Metadata = { title: 'Register hospital' }

export default function RegisterPage() {
  return (
    <main className="dashboard-shell reg-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Hospital onboarding</p>
          <h1>Register your hospital</h1>
        </div>
        <Link href="/" className="reg-link">
          ← Dashboard
        </Link>
      </header>
      <HospitalRegistrationForm />
    </main>
  )
}
