import Link from 'next/link'
import type { Metadata } from 'next'
import Wordmark from '@/components/app/wordmark'
import { APP_NAME } from '@/lib/config'

export const metadata: Metadata = { title: 'Meet the team' }

type Member = { name: string; role: string; note: string; photo?: string; link?: { label: string; href: string } }

const TEAM: Member[] = [
  {
    name: 'Shivaan Patwa',
    role: 'Backend, security and web design',
    note: 'Built the planner API and database, the security work, and the web dashboard and site.',
  },
  {
    name: 'Aayan Nanavaty',
    role: 'Driver app and dispatch',
    note: 'Built the driver mobile app, hospital registration and the algorithm that matches units to positions.',
  },
]

// Add 2 to 3 sentences on why you built it, and a contact email, then set these (they stay hidden while empty).
const WHY = ''
const CONTACT_EMAIL = ''

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

export default function TeamPage() {
  return (
    <div className="landing theme-light">
      <header className="landing-nav">
        <Wordmark href="/" />
        <nav className="links" aria-label="Page">
          <Link href="/">Home</Link>
          <Link href="/start">Sign in</Link>
        </nav>
      </header>
      <main className="story">
        <section className="story-block" aria-labelledby="team-title">
          <h1 id="team-title" className="team-title">
            Meet the team
          </h1>
          <div className="story-text">
            <p>{WHY || `${APP_NAME} is built by two students in Mumbai, with guidance from our supervisor.`}</p>
            <ul className="team-grid">
              {TEAM.map((m) => (
                <li key={m.name} className="team-member">
                  {m.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small local photo
                    <img src={m.photo} alt="" width={72} height={72} className="team-photo" />
                  ) : (
                    <span className="team-photo team-initials" aria-hidden="true">
                      {initials(m.name)}
                    </span>
                  )}
                  <div>
                    <strong>{m.name}</strong>
                    <div className="team-role">{m.role}</div>
                    <p>{m.note}</p>
                    {m.link && <a href={m.link.href}>{m.link.label}</a>}
                  </div>
                </li>
              ))}
            </ul>
            {CONTACT_EMAIL && (
              <p>
                Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </p>
            )}
          </div>
        </section>
      </main>
      <footer className="landing-foot">{APP_NAME} · Not affiliated with any government ambulance service</footer>
    </div>
  )
}
