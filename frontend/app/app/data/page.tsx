import type { Metadata } from 'next'
import { AlertTriangle } from 'lucide-react'
import { APP_NAME, DATA_LABEL } from '@/lib/config'

export const metadata: Metadata = { title: 'Data & assumptions' }

export default function DataPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Data &amp; assumptions</h1>
          <p>What the numbers in {APP_NAME} are built on, what is simulated, and where they stop being reliable.</p>
        </div>
      </div>
      <div className="prose">
        <p className="notice">
          <AlertTriangle aria-hidden="true" />
          <span>
            <strong>{DATA_LABEL}.</strong> The demand scores are not recorded ambulance calls. Use them to compare staging options, not to
            predict real call volumes.
          </span>
        </p>

        <h2>What the model predicts</h2>
        <p>
          For each of Mumbai&apos;s 24 administrative wards and each hour of the day, the model gives a relative risk score between 0
          and 1. A higher score means the ward is expected to need ambulances more at that hour, compared with other wards. It is a
          ranking signal, not a number of calls.
        </p>
        <ul>
          <li>
            <strong>Base score per ward.</strong> Built from ward features in the project&apos;s ward file: population, number of
            commercial places, number of road intersections and their density per km².
          </li>
          <li>
            <strong>Time of day.</strong> One 24-hour curve, the same for every ward, multiplies the base score: quietest around 04:00
            (0.62×), busiest around 11:00 (1.33×), with a second rise from 17:00 to 22:00.
          </li>
          <li>
            <strong>Why it counts as simulated.</strong> The project has no incident records to check these scores against, the hourly
            curve is a smooth assumed shape rather than a measured one, and the score file also carries a deliberately noised copy of
            the score. The files were added without a cited source. Until a real dataset is attached, every screen labels this data as
            simulated.
          </li>
        </ul>

        <h2>How staging is chosen</h2>
        <p>
          The planner looks at fixed candidate staging positions (hospitals, clinics and similar places) within the hospital&apos;s
          operating radius. It scores each one by how quickly it reaches high-scoring wards, then picks one position per unit. Picks
          must be a minimum distance apart (2 km unless changed) and, where the fleet allows, every ward the positions can reach within
          the response target (20 min unless changed) must be covered. Units are then matched to positions, with advanced life support
          (ALS) units preferred where demand is highest.
        </p>
        <p>
          <strong>&quot;Before&quot;</strong> on every screen means all units waiting at the hospital&apos;s nearest candidate position.
          <strong> Average response</strong> is the travel time from the nearest staged unit to each ward, averaged with each
          ward&apos;s demand score as its weight. <strong>Reachable in 20 min</strong> is the share of total demand in wards that a unit
          can reach within 20 minutes.
        </p>

        <h2>Travel times</h2>
        <p>
          Minutes from each candidate position to each ward come from a precomputed travel-time table in the project. Its source and
          date are not recorded in the project yet. It does not change with live traffic. Distances shown in the unit list are straight
          lines.
        </p>

        <h2>What-if knobs</h2>
        <p>Scenario knobs change the planner&apos;s inputs for that one request. The planner itself is unchanged.</p>
        <ul>
          <li><strong>Ambulances available</strong>: plans for fewer units (the first ones in service) or adds simulated BLS units.</li>
          <li><strong>Demand surge</strong>: multiplies the demand score of every ward, or of the wards you pick (1.3 = +30%). A surge in every ward raises all scores equally, so positions only change when the surge is uneven.</li>
          <li><strong>Road speed</strong>: multiplies every travel time. &quot;Monsoon gridlock&quot; at the end of the slider means trips take twice as long.</li>
          <li><strong>Close a staging position</strong>: removes that position from the choices for this scenario only.</li>
          <li><strong>Presets</strong> only set these knobs. Their values are assumptions chosen to be modest, not measurements: each preset&apos;s tooltip lists them.</li>
        </ul>

        <h2>Known limitations</h2>
        <ul>
          <li>Ward level, not street level: a ward is treated as one point for travel times.</li>
          <li>No live traffic, road closures, hospital capacity or ambulance turnaround times.</li>
          <li>One hour at a time: plans don&apos;t account for units still busy on earlier calls.</li>
          <li>Only 24 wards inside Greater Mumbai are modelled.</li>
          <li>Candidate positions are a fixed list; new places can&apos;t be added from the app.</li>
        </ul>
      </div>
    </div>
  )
}
