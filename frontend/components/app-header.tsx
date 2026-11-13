'use client'

import { useEffect, useState } from 'react'
import { Activity, Clock, MapPin } from 'lucide-react'
import HospitalMenu from './hospital-menu'
import type { Hospital } from '@/lib/api'

export type NavSection = 'overview' | 'fleet' | 'runs' | 'analytics'

interface AppHeaderProps {
  hospital: Hospital | undefined
  onHospitalChanged: () => Promise<void> | void
  activeNav?: NavSection
  onNavSelect?: (section: NavSection) => void
}

export default function AppHeader({
  hospital,
  onHospitalChanged,
  activeNav = 'overview',
  onNavSelect,
}: AppHeaderProps) {
  const [timeStr, setTimeStr] = useState<string>('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const formatter = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      setTimeStr(formatter.format(now))
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  const navItems: { key: NavSection; label: string; targetId: string }[] = [
    { key: 'overview', label: 'Overview', targetId: 'overview' },
    { key: 'fleet', label: 'Fleet', targetId: 'fleet' },
    { key: 'runs', label: 'Optimization Runs', targetId: 'optimization-runs' },
    { key: 'analytics', label: 'Analytics', targetId: 'analytics' },
  ]

  const handleNavClick = (key: NavSection, targetId: string) => {
    onNavSelect?.(key)
    if (key === 'runs') {
      const detailsEl = document.getElementById('optimization-runs') as HTMLDetailsElement | null
      if (detailsEl) detailsEl.open = true
    }
    const target = document.getElementById(targetId)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <header className="topbar">
      {/* Left: Logo/Name and Mumbai Operations label */}
      <div className="topbar-left">
        <div className="brand-logo-wrap" aria-hidden="true">
          <Activity size={16} className="brand-icon" />
        </div>
        <span className="brand-name">AmbulanceIQ</span>
        <span className="brand-ops-label">Mumbai Operations</span>
      </div>

      {/* Middle: Horizontal compact navigation */}
      <nav className="topbar-nav" aria-label="Main Navigation">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`topbar-nav-item ${activeNav === item.key ? 'active' : ''}`}
            onClick={() => handleNavClick(item.key, item.targetId)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Right: Mumbai Location Indicator, Current Time, User Profile */}
      <div className="topbar-right">
        <div className="topbar-indicators" aria-label="Operations metadata">
          <div className="topbar-meta-item" title="Operating Location">
            <MapPin size={13} className="topbar-meta-icon" />
            <span>Mumbai</span>
          </div>
          <div className="topbar-meta-divider" aria-hidden="true" />
          <div className="topbar-meta-item" title="Current Time (Asia/Kolkata)">
            <Clock size={13} className="topbar-meta-icon" />
            <span className="topbar-time">{timeStr ? `${timeStr} IST` : '—'}</span>
          </div>
        </div>

        {hospital ? (
          <HospitalMenu hospital={hospital} onChanged={onHospitalChanged} />
        ) : (
          <div className="hospital-chip-loading">
            <span className="status-dot" />
            <span>Loading hospital…</span>
          </div>
        )}
      </div>
    </header>
  )
}

