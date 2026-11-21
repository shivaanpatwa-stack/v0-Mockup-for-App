import Link from 'next/link'
import type { Metadata } from 'next'
import Wordmark from '@/components/app/wordmark'
import { APP_NAME } from '@/lib/config'

export const metadata: Metadata = { title: 'Meet the team' }

type Member = {
  name: string
  role: string
  bio: string[]
  email: string
  photo: string
  /** CSS object-position so the face stays in frame when the photo is cropped to the card. */
  focus: string
}

const TEAM: Member[] = [
  {
    name: 'Shivaan Patwa',
    role: 'Frontend and backend',
    bio: [
      'Alongside Aayan, I co-built Standby, and we split the frontend and backend work roughly half and half.',
      'On the backend, I built the planner API and the database that store each hospital, its fleet and every plan, the response-time and coverage numbers the dashboard shows, and the place search hospitals use to find themselves on the map. I also led security: hospital codes are stored encrypted, sign-ins are rate-limited and key actions are logged.',
      'On the web, I redesigned the dashboard, including the live map, the staging plan, What-if scenarios, run history and the Data & assumptions page, and built this website, along with the Standby name and logo.',
    ],
    email: 'shivaanpatwa@gmail.com',
    photo: '/team/shivaan.jpg',
    focus: '40% 30%',
  },
  {
    name: 'Aayan Nanavaty',
    role: 'Frontend and backend',
    bio: [
      "Alongside Shivaan, I co-built Standby. I got interested in the problem when I realised that response times aren't just about how fast an ambulance can drive, but where it's waiting before the call comes in.",
      "My work included the interactive map of Mumbai that shades every ward by predicted demand, and the hospital sign-up flow where hospitals place themselves on the map and add their fleet. I also built the planning features that assign each ambulance to a waiting spot, the mobile app crews use to see where to go and update their status, and the guided tour with demo videos that walks new users through the dashboard.",
    ],
    email: 'aayan.nanavaty@gmail.com',
    photo: '/team/aayan.jpg',
    focus: '50% 20%',
  },
]

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
            <p>
              In Mumbai, ambulances usually wait at a hospital or depot between calls, while emergencies move across the city through
              the day. {APP_NAME} estimates where demand is likely to be highest in each of the city&apos;s 24 wards, hour by hour, and
              recommends where each ambulance should wait. In our simulation of an evening at Parel, that cut the average response
              time from 29 to about 20 minutes. Our goal is simple: the right ambulance in the right place at the right time.
            </p>
            <p className="team-note">Built by two students in Mumbai, with guidance from our supervisor.</p>
            <ul className="team-grid">
              {TEAM.map((m) => (
                <li key={m.name} className="team-member">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local team photo */}
                  <img
                    src={m.photo}
                    alt={`Photo of ${m.name}`}
                    className="team-photo"
                    style={{ objectPosition: m.focus }}
                    loading="lazy"
                  />
                  <div>
                    <strong>{m.name}</strong>
                    <div className="team-role">{m.role}</div>
                    {m.bio.map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                    <p>
                      <a href={`mailto:${m.email}`}>{m.email}</a>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <footer className="landing-foot">{APP_NAME} · Not affiliated with any government ambulance service</footer>
    </div>
  )
}
