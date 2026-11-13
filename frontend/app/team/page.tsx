import Link from 'next/link'
import type { Metadata } from 'next'
import Wordmark from '@/components/app/wordmark'
import { APP_NAME } from '@/lib/config'

export const metadata: Metadata = { title: 'Meet the team' }

type Member = { name: string; role: string; note: string; photo?: string; link?: { label: string; href: string } }

// Filled in from the team's own details. Placeholders are marked so they're easy to spot.
const TEAM: Member[] = [
  { name: '[Name]', role: '[Role]', note: '[One line: what you built or own]' },
  { name: '[Name]', role: '[Role]', note: '[One line: what you built or own]' },
  { name: '[Name]', role: '[Role]', note: '[One line: what you built or own]' },
]

const initials = (name: string) =>
  name.startsWith('[') ? '?' : name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

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
          <h1 id="team-title" style={{ fontSize: 32, lineHeight: 1.1 }}>Meet the team</h1>
          <div className="story-text">
            <p className="gap-marker" style={{ display: 'block', padding: 12 }}>
              [Why we built {APP_NAME}: 2 to 3 sentences in your own words]
            </p>
            <ul className="team-grid">
              {TEAM.map((m, i) => (
                <li key={i} className="team-member">
                  {m.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small local photo
                    <img src={m.photo} alt="" width={72} height={72} className="team-photo" />
                  ) : (
                    <span className="team-photo team-initials" aria-hidden="true">{initials(m.name)}</span>
                  )}
                  <div>
                    <strong>{m.name}</strong>
                    <div className="muted">{m.role}</div>
                    <p>{m.note}</p>
                    {m.link && <a href={m.link.href}>{m.link.label}</a>}
                  </div>
                </li>
              ))}
            </ul>
            <p>
              Contact: <span className="gap-marker">[email]</span>
            </p>
          </div>
        </section>
      </main>
      <footer className="landing-foot">{APP_NAME} · Not affiliated with any government ambulance service</footer>
    </div>
  )
}
