// The backend plans in Asia/Kolkata (PLANNING_TZ in backend/main.py) and India has no DST, so a
// fixed offset is enough and avoids depending on Intl time-zone support.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

export function istParts(iso: string): { hour: number; minute: number } {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS)
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() }
}

function clock(hour: number, minute: number, withMeridiem = true): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const mm = String(minute).padStart(2, '0')
  return `${h12}:${mm}${withMeridiem ? ` ${hour < 12 ? 'AM' : 'PM'}` : ''}`
}

export function formatIst(iso: string): string {
  const { hour, minute } = istParts(iso)
  return clock(hour, minute)
}

// "9:00 to 10:00 PM", or "11:00 PM to 12:00 AM" when the window crosses noon/midnight.
export function formatWindow(fromIso: string, toIso: string): string {
  const from = istParts(fromIso)
  const to = istParts(toIso)
  const sameMeridiem = from.hour < 12 === to.hour < 12
  return sameMeridiem
    ? `${clock(from.hour, from.minute, false)} to ${clock(to.hour, to.minute)}`
    : `${clock(from.hour, from.minute)} to ${clock(to.hour, to.minute)}`
}

export const formatLocalClock = (date: Date) =>
  date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function relativeTime(date: Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  return minutes === 1 ? '1 min ago' : `${minutes} min ago`
}
