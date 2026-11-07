const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
const dayClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** "14:32" in Mumbai time. */
export const formatClock = (iso: string | number | Date) => clock.format(new Date(iso))
/** "7 Nov, 14:32" in Mumbai time. */
export const formatDayClock = (iso: string | number | Date) => dayClock.format(new Date(iso))
/** "08:00" for an hour of the day. */
export const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/** "just now", "6 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string | number | Date, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export const num = (v: number | null | undefined, digits = 1) => (v == null || Number.isNaN(v) ? '–' : v.toFixed(digits))
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
