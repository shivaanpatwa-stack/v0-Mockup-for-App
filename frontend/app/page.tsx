'use client'

import { useState } from 'react'

const ambulances = [
  ['AMB-001', 'Andheri West', 'K/W Ward', '6 min', 'ALS', 'Available'],
  ['AMB-002', 'Bandra', 'H/W Ward', '4 min', 'BLS', 'Responding'],
  ['AMB-003', 'Parel', 'G/S Ward', '7 min', 'ALS', 'At Hospital'],
  ['AMB-004', 'Dadar', 'G/N Ward', '5 min', 'BLS', 'Available'],
  ['AMB-005', 'Worli', 'D Ward', '8 min', 'ALS', 'Unavailable'],
]

export default function Page() {
  const [day, setDay] = useState('Monday')
  const [hour, setHour] = useState(8)
  const [fleet, setFleet] = useState(5)
  const [updated, setUpdated] = useState(false)

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div><p className="eyebrow">Fleet intelligence</p><h1>Ambulance Response Optimization Platform</h1></div>
        <div className="hospital"><span className="status-dot" /> Hospital A <span>— Parel</span></div>
      </header>
      <section className="controls" aria-label="Model controls">
        <label>Day<select value={day} onChange={(e) => setDay(e.target.value)}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="range-label">Hour <strong>{hour === 0 ? '12:00 AM' : hour < 12 ? `${hour}:00 AM` : `${hour === 12 ? 12 : hour - 12}:00 PM`}</strong><input type="range" min="0" max="23" value={hour} onChange={(e) => setHour(Number(e.target.value))} /></label>
        <label>Fleet size<input className="number-input" type="number" min="1" max="30" value={fleet} onChange={(e) => setFleet(Number(e.target.value))} /></label>
        <button onClick={() => { setUpdated(true); setTimeout(() => setUpdated(false), 2200) }}>{updated ? 'Updated' : 'Recalculate'}</button>
      </section>
      <section className="content-grid">
        <div className="map-card"><div className="map-heading"><div><p className="eyebrow">Mumbai operations map</p><h2>Demand by administrative ward</h2></div><span className="map-date">Live model view</span></div><div className="map"><div className="coastline" /><div className="ward ward-a">A</div><div className="ward ward-b">B</div><div className="ward ward-c">C</div><div className="ward ward-d">D</div><div className="ward ward-e">E</div><div className="ward ward-f">F/N</div><div className="ward ward-g">G/S</div><div className="ward ward-h">H/W</div><div className="ward ward-k">K/W</div><div className="ward ward-l">L</div><div className="marker ambulance">+</div><div className="marker hospital">H</div><div className="marker recommended">★</div><div className="map-label label-north">Mumbai</div><div className="map-label label-south">Worli · Parel</div><div className="legend"><span><i className="legend-dot high" /> High demand</span><span><i className="legend-dot medium" /> Medium</span><span><i className="legend-dot low" /> Low</span></div></div></div>
        <aside className="stats-column"><div className="stat-card"><span>Current average response time</span><strong>14.2 <small>min</small></strong><em>Baseline</em></div><div className="stat-card optimized"><span>Optimized average response time</span><strong>9.1 <small>min</small></strong><em>↓ 36% faster</em></div><div className="comparison"><p>Optimization impact</p><div><span>Reachable within 10 min</span><strong>48% <b>→</b> 71%</strong></div><div><span>Worst high-risk ward</span><strong>18 min <b>→</b> 8 min</strong></div></div></aside>
      </section>
      <section className="fleet-section"><div className="section-heading"><div><p className="eyebrow">Fleet overview</p><h2>Ambulance fleet</h2></div><span>{fleet} units modeled · {day}</span></div><div className="table-wrap"><table><thead><tr>{['Ambulance ID','Current zone','Recommended position','ETA / response','Type','Status'].map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{ambulances.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={cell}>{index === 0 ? <strong>{cell}</strong> : index === 5 ? <span className={`badge ${cell.toLowerCase().replace(' ', '-')}`}>{cell}</span> : cell}</td>)}</tr>)}</tbody></table></div></section>
    </main>
  )
}
