import Link from 'next/link'
import type { Metadata } from 'next'
import CityBand from '@/components/landing/city-band'
import Wordmark from '@/components/app/wordmark'
import { APP_NAME } from '@/lib/config'
import impact from '@/lib/landing-impact.json'

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME}: ambulances staged where Mumbai will need them` },
  description: 'Predicts ambulance demand by Mumbai ward and hour, and recommends where each unit should wait between calls.',
}

type Ward = { ward: string; weight: number; before: number; after: number }

/** Share of demand reached within each minute bucket, before vs after (simulated example). */
function ImpactChart() {
  const wards = impact.wards as Ward[]
  const total = wards.reduce((s, w) => s + w.weight, 0)
  const buckets = [5, 10, 15, 20, 25, 30, 40, 60]
  const share = (key: 'before' | 'after', limit: number) => (100 * wards.filter((w) => w[key] <= limit).reduce((s, w) => s + w.weight, 0)) / total
  const W = 640
  const H = 240
  const pad = { l: 44, r: 16, t: 16, b: 36 }
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (buckets.length - 1)
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b)
  const line = (key: 'before' | 'after') => buckets.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(share(key, b)).toFixed(1)}`).join(' ')
  const targetI = buckets.indexOf(impact.target_min)
  return (
    <figure className="chart-box" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="impact-title impact-desc">
        <title id="impact-title">Share of predicted demand an ambulance can reach, by minutes</title>
        <desc id="impact-desc">
          With all units at the hospital, {share('before', 20).toFixed(0)}% of predicted demand is reachable within 20 minutes. With staged
          units, {share('after', 20).toFixed(0)}%. Simulated example.
        </desc>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(22,25,26,.08)" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#5b6460">{v}%</text>
          </g>
        ))}
        {buckets.map((b, i) => (
          <text key={b} x={x(i)} y={H - 14} textAnchor="middle" fontSize="12" fill="#5b6460">{b} min</text>
        ))}
        {targetI >= 0 && (
          <g>
            <line x1={x(targetI)} x2={x(targetI)} y1={pad.t} y2={H - pad.b} stroke="#c22a1f" strokeDasharray="4 4" />
            <text x={x(targetI) + 6} y={pad.t + 12} fontSize="12" fill="#c22a1f">20-min urban benchmark</text>
          </g>
        )}
        <path d={line('before')} fill="none" stroke="#7d8682" strokeWidth="2" strokeDasharray="5 4" />
        <path d={line('after')} fill="none" stroke="#00714b" strokeWidth="2" />
        <text x={x(buckets.length - 1) - 4} y={y(share('after', 60)) + 16} textAnchor="end" fontSize="12" fill="#00714b">Staged units</text>
        <text x={x(3) + 6} y={y(share('before', 20)) + 16} fontSize="12" fill="#5b6460">All units at the hospital</text>
      </svg>
      <figcaption className="src">
        {impact.label}. &quot;Reachable&quot; uses the planner&apos;s travel-time table. Not a forecast of real response times.
      </figcaption>
    </figure>
  )
}

export default function Landing() {
  const k = impact.kpis
  return (
    <div className="landing theme-light">
      <header className="landing-nav">
        <Wordmark href="/" />
        <nav className="links" aria-label="Page">
          <a href="#problem">Problem</a>
          <a href="#how">How it works</a>
          <a href="#today">What works today</a>
          <Link href="/start">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="band" aria-labelledby="lead">
          <CityBand />
          <div className="band-text">
            <h1 id="lead" className="lead-title">Ambulances in the right place before the call comes in</h1>
            <p className="lead-sub">
              In a simulated evening at Parel, staging 3 units by ward demand cut the average response from {k.avg_response_min.before.toFixed(1)} to{' '}
              {k.avg_response_min.after.toFixed(1)} minutes.
            </p>
            <div className="band-actions">
              <Link href="/app" className="btn btn-primary">Open the live map</Link>
              <a href="#impact" className="btn">See the Parel simulation</a>
            </div>
          </div>
        </section>

        <div className="story">
          <section id="problem" className="story-block" aria-labelledby="problem-h">
            <h2 id="problem-h">The wait is mostly the drive</h2>
            <div className="story-text">
              <p>
                Across Maharashtra&apos;s 108 ambulance service, an emergency trip in November 2022 took on average 23 minutes just to get
                from the ambulance&apos;s base to the patient, and another 39 minutes to reach a hospital{' '}
                <span className="src">(Jana et al., Scientific Reports, 2023, 16,197 emergency trips)</span>. The National Health Mission
                benchmark the same study cites is 20 minutes for urban areas.
              </p>
              <p>
                In Mumbai specifically, the call-to-arrival time is <span className="gap-marker">[STAT NEEDED: average 108 ambulance response time in Mumbai, call to arrival, with year and source]</span>.
              </p>
              <p>
                Most ambulances wait at a hospital or depot between calls. Demand doesn&apos;t: it moves across the city through the day. Where a
                unit waits decides most of how long the next patient waits.
              </p>
            </div>
          </section>

          <section id="how" className="story-block" aria-labelledby="how-h">
            <h2 id="how-h">How it works</h2>
            <div className="story-text">
              <div className="shot">
                <img src="/landing/live-map.jpg" alt="The live map: Mumbai wards shaded by predicted demand, unit positions, the summary strip and the list of moves." width={800} height={500} />
                <span className="callout-num" style={{ left: '14%', bottom: '8%' }} aria-hidden="true">1</span>
                <span className="callout-num" style={{ right: '20%', top: '22%' }} aria-hidden="true">2</span>
                <span className="callout-num" style={{ left: '22%', top: '6%' }} aria-hidden="true">3</span>
              </div>
              <ol className="callout-list">
                <li><span className="callout-num" aria-hidden="true">1</span><span><strong>Forecast.</strong> Each of the 24 wards gets a demand score for every hour. Drag the time bar to see where the city will need ambulances at 08:00, 18:00 or 03:00.</span></li>
                <li><span className="callout-num" aria-hidden="true">2</span><span><strong>Recommendation.</strong> Recalculate staging picks one waiting position per unit, a minimum distance apart, and lists each move with the ward it covers and why.</span></li>
                <li><span className="callout-num" aria-hidden="true">3</span><span><strong>Result.</strong> Before anything changes, you see the difference: units moved, share of demand reachable in 20 minutes, and average response. Apply it, or discard it.</span></li>
              </ol>
            </div>
          </section>

          <section id="impact" className="story-block" aria-labelledby="impact-h">
            <h2 id="impact-h">One evening at Parel, simulated</h2>
            <div className="story-text">
              <ImpactChart />
              <p>
                With three units all waiting at the hospital, {Math.round(k.demand_within_20_min_pct.before ?? 0)}% of the city&apos;s predicted
                demand at 18:00 is within 20 minutes. Staged across three wards, {Math.round(k.demand_within_20_min_pct.after ?? 0)}% is, and{' '}
                {k.wards_covered_20_min.after} of {k.wards_covered_20_min.total} wards are within 20 minutes instead of{' '}
                {k.wards_covered_20_min.before}. These numbers come from simulated demand, not recorded calls.
              </p>
            </div>
          </section>

          <section id="today" className="story-block" aria-labelledby="today-h">
            <h2 id="today-h">What works today, and what doesn&apos;t yet</h2>
            <div className="story-text">
              <ul className="status-list">
                <li><span className="tag">Works</span><span>Ward-by-hour demand map, staging recommendations with a preview before saving, undo, run history with restore, and what-if scenarios for fewer units, slower roads, demand surges and closed positions.</span></li>
                <li><span className="tag">Works</span><span>A driver app that shows each crew its assigned position.</span></li>
                <li><span className="tag">Basic</span><span>Demand is simulated from ward features and an assumed daily pattern. Travel times come from a fixed table, with no live traffic.</span></li>
                <li><span className="tag">Basic</span><span>Positions are planned one hour at a time and ignore units already busy on a call.</span></li>
                <li><span className="tag">Next</span><span>Real incident data to train and test the demand model, live traffic, and hospital capacity.</span></li>
              </ul>
            </div>
          </section>

          <section className="story-block" aria-labelledby="who-h">
            <h2 id="who-h">Who it&apos;s for</h2>
            <div className="story-text">
              <p><strong>Dispatch centres</strong> deciding where idle units should wait during the evening peak.</p>
              <p><strong>Hospital networks</strong> with their own fleet, planning cover around one or more sites.</p>
              <p><strong>Private ambulance operators</strong> testing what losing two units, or a monsoon evening, does to coverage before it happens.</p>
            </div>
          </section>

          <section className="story-block" aria-labelledby="limits-h">
            <h2 id="limits-h">Assumptions and limits</h2>
            <div className="story-text">
              <p>
                Demand scores are simulated, wards are treated as single points, and travel times don&apos;t change with live traffic. Every
                assumption is listed on the <Link href="/app/data">Data &amp; assumptions</Link> page (sign-in needed).
              </p>
            </div>
          </section>

          <section className="story-block" aria-labelledby="team-h">
            <h2 id="team-h">Team</h2>
            <div className="story-text">
              <div className="people">
                <div className="person">[Name] · [Role]</div>
                <div className="person">[Name] · [Role]</div>
                <div className="person">[Name] · [Role]</div>
              </div>
              <p className="gap-marker" style={{ display: 'block', padding: 12 }}>[Founder note: 2 to 3 sentences on why you built this]</p>
              <p>
                Contact: <span className="gap-marker">[email]</span>
              </p>
            </div>
          </section>
        </div>
      </main>
      <footer className="landing-foot">
        {APP_NAME} · Not affiliated with any government ambulance service · Sources: <a href="https://doi.org/10.1038/s41598-023-48713-1">Jana et al. 2023</a> · Map data © OpenStreetMap contributors, © CARTO
      </footer>
    </div>
  )
}
