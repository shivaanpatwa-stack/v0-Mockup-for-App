'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BookOpen, History, ListChecks, Map as MapIcon, MoreHorizontal, Search, SlidersHorizontal } from 'lucide-react'
import HospitalMenu from '@/components/hospital-menu'
import Wordmark from '@/components/app/wordmark'
import { useApp } from '@/lib/app-state'
import { formatClock } from '@/lib/format'
import { WARD_NAMES } from '@/lib/ward-names'

export const SECTIONS = [
  { href: '/app', label: 'Live map', key: '1', icon: MapIcon },
  { href: '/app/plan', label: 'Staging plan', key: '2', icon: ListChecks },
  { href: '/app/scenarios', label: 'Scenarios', key: '3', icon: SlidersHorizontal },
  { href: '/app/history', label: 'Run history', key: '4', icon: History },
  { href: '/app/data', label: 'Data & assumptions', key: '5', icon: BookOpen },
] as const

/** True when a keypress should not trigger a shortcut (typing in a field). */
export function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

function LiveStatus() {
  const { hospital, fleet, loadError, plan } = useApp()
  if (loadError) {
    return (
      <span className="status status-critical" role="status">
        <span className="dot" aria-hidden="true" /> Offline
      </span>
    )
  }
  if (!hospital || !fleet) {
    return (
      <span className="status" role="status">
        <span className="dot" aria-hidden="true" /> Connecting
      </span>
    )
  }
  return (
    <span className="status status-live" role="status">
      <span className="dot" aria-hidden="true" /> Live{plan ? ` · plan ${formatClock(plan.calculatedAt)}` : ''}
    </span>
  )
}

type Command = { id: string; label: string; kind: string; run: () => void }

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const { fleet, plan, setFocusWard, recalculate, setWhatIfOpen } = useApp()
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setQ('')
      setIndex(0)
      d.showModal()
    }
    if (!open && d.open) d.close()
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href)
    const pages: Command[] = SECTIONS.map((s) => ({ id: s.href, label: s.label, kind: `Page · ${s.key}`, run: go(s.href) }))
    const actions: Command[] = [
      { id: 'recalc', label: 'Recalculate staging', kind: 'Action · R', run: () => { router.push('/app'); recalculate() } },
      { id: 'whatif', label: 'What if…', kind: 'Action · W', run: () => { router.push('/app'); setWhatIfOpen(true) } },
    ]
    const wards: Command[] = Object.entries(WARD_NAMES).map(([code, name]) => ({
      id: `ward-${code}`,
      label: `${code} · ${name}`,
      kind: 'Ward',
      run: () => { router.push('/app'); setFocusWard(code) },
    }))
    const units: Command[] = (fleet ?? []).map((u) => {
      const a = plan?.assignments.find((p) => p.ambulance_id === u.call_sign)
      return {
        id: `unit-${u.call_sign}`,
        label: `${u.call_sign} · ${u.type}${a?.ward_code ? ` · ward ${a.ward_code}` : ''}`,
        kind: 'Unit',
        run: () => { router.push('/app'); if (a?.ward_code) setFocusWard(a.ward_code) },
      }
    })
    return [...actions, ...pages, ...units, ...wards]
  }, [router, fleet, plan, recalculate, setWhatIfOpen, setFocusWard])

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (needle ? commands.filter((c) => c.label.toLowerCase().includes(needle)) : commands).slice(0, 12)
  }, [q, commands])

  const choose = (c: Command | undefined) => {
    if (!c) return
    onClose()
    c.run()
  }

  return (
    <dialog ref={ref} className="palette" aria-label="Command palette" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <input
        autoFocus
        value={q}
        placeholder="Jump to a ward, unit or page"
        aria-label="Search wards, units and pages"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={matches[index] ? `cmd-${matches[index].id}` : undefined}
        onChange={(e) => {
          setQ(e.target.value)
          setIndex(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, matches.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
          if (e.key === 'Enter') { e.preventDefault(); choose(matches[index]) }
        }}
      />
      <ul id="palette-list" role="listbox">
        {matches.map((c, i) => (
          <li key={c.id}>
            <button type="button" id={`cmd-${c.id}`} role="option" aria-selected={i === index} onMouseEnter={() => setIndex(i)} onClick={() => choose(c)}>
              <span>{c.label}</span>
              <span className="kind">{c.kind}</span>
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="empty">No ward, unit or page matches &quot;{q}&quot;.</li>}
      </ul>
    </dialog>
  )
}

const SHORTCUTS: [string, string][] = [
  ['1 to 5', 'Switch section'],
  ['⌘K / Ctrl K', 'Jump to a ward, unit or page'],
  ['R', 'Recalculate staging'],
  ['W', 'Open or close What if…'],
  ['Hold Space', 'Compare scenario with the current plan'],
  ['← →', 'Move the time scrubber one hour'],
  ['Esc', 'Close the open panel'],
  ['?', 'Show this list'],
]

function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="palette" aria-labelledby="shortcuts-title" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="drawer-head">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
      </div>
      <dl className="shortcut-grid">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt><kbd>{k}</kbd></dt>
            <dd style={{ margin: 0 }}>{v}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  )
}

function Toasts() {
  const { toasts, dismissToast } = useApp()
  const [, setNow] = useState(0)
  const hasCountdown = toasts.some((t) => t.until)
  useEffect(() => {
    if (!hasCountdown) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [hasCountdown])
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role="status">
          <span>
            {t.text}
            {t.until ? <span className="muted mono"> · saving in {Math.max(0, Math.ceil((t.until - Date.now()) / 1000))} s</span> : null}
          </span>
          {t.undo ? (
            <button type="button" className="btn btn-sm" onClick={t.undo}>Undo</button>
          ) : (
            <button type="button" className="btn btn-sm btn-ghost" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>OK</button>
          )}
        </div>
      ))}
    </div>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { hospital, refreshHospital, recalculate, whatIfOpen, setWhatIfOpen } = useApp()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('dialog[open]')) return
      const section = SECTIONS.find((s) => s.key === e.key)
      if (section) {
        e.preventDefault()
        router.push(section.href)
      } else if (e.key === '?') {
        setHelpOpen(true)
      } else if (e.key === 'r' || e.key === 'R') {
        if (pathname !== '/app') router.push('/app')
        recalculate()
      } else if (e.key === 'w' || e.key === 'W') {
        if (pathname !== '/app') router.push('/app')
        setWhatIfOpen(!whatIfOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, pathname, recalculate, whatIfOpen, setWhatIfOpen])

  const current = (href: string) => (href === '/app' ? pathname === '/app' : pathname.startsWith(href))

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="topbar">
        <Wordmark />
        <nav className="tabs" aria-label="Sections">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="tab" aria-current={current(s.href) ? 'page' : undefined}>
              {s.label} <kbd aria-hidden="true">{s.key}</kbd>
            </Link>
          ))}
        </nav>
        <div className="topbar-right">
          <LiveStatus />
          <button type="button" className="btn search-btn" onClick={() => setPaletteOpen(true)} aria-label="Search wards, units and pages">
            <Search aria-hidden="true" />
            <span className="search-label">Search</span>
            <kbd aria-hidden="true">⌘K</kbd>
          </button>
          {hospital && <HospitalMenu hospital={hospital} onChanged={refreshHospital} />}
        </div>
      </header>
      <main id="main" className="app-main">
        {children}
      </main>
      <nav className="bottom-tabs" aria-label="Sections">
        {SECTIONS.slice(0, 3).map((s) => (
          <Link key={s.href} href={s.href} aria-current={current(s.href) ? 'page' : undefined}>
            <s.icon aria-hidden="true" />
            {s.label === 'Staging plan' ? 'Plan' : s.label}
          </Link>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)}>
          <MoreHorizontal aria-hidden="true" />
          More
        </button>
      </nav>
      {moreOpen && (
        <div className="drawer" role="dialog" aria-label="More sections">
          <div className="drawer-head">
            <h2>More</h2>
            <button type="button" className="btn btn-sm" onClick={() => setMoreOpen(false)}>Close</button>
          </div>
          <div className="drawer-body">
            {SECTIONS.slice(3).map((s) => (
              <Link key={s.href} href={s.href} className="btn" onClick={() => setMoreOpen(false)}>
                <s.icon aria-hidden="true" /> {s.label}
              </Link>
            ))}
            <button type="button" className="btn" onClick={() => { setMoreOpen(false); setHelpOpen(true) }}>Keyboard shortcuts</button>
          </div>
        </div>
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toasts />
    </div>
  )
}
