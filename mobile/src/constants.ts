import type { AmbulanceStatus } from '@/lib/api'

// Matches the web app's dark control-room theme (frontend/app/globals.css). Text colours are
// tuned for WCAG AA on the dark surfaces; fills like `primary` carry white text.
export const colors = {
  bg: '#111413',
  card: '#181c1b',
  raised: '#21262a',
  white: '#FFFFFF',
  border: 'rgba(232,235,233,0.16)',
  text: '#e8ebe9',
  muted: '#9aa3a0',
  faint: '#8a938f',
  /** Safety green fill for the main action; white text on it. */
  primary: '#007a51',
  /** Safety green for text and icons on dark surfaces. */
  accent: '#3dbb85',
  stepIdle: '#2c3235',
  green: '#3dbb85',
  greenBg: 'rgba(61,187,133,0.14)',
  red: '#ff7a6b',
  redBg: 'rgba(217,48,37,0.18)',
  amber: '#e8a400',
  amberBg: 'rgba(232,164,0,0.16)',
  amberDot: '#e8a400',
  blue: '#8fa3b3',
  blueText: '#b4c4d1',
  blueBg: 'rgba(143,163,179,0.16)',
  indigo: '#b4c4d1',
  indigoBg: 'rgba(143,163,179,0.16)',
  slate: '#9aa3a0',
  slateBg: 'rgba(154,163,160,0.14)',
} as const

export type StatusMeta = { label: string; description: string; color: string; bg: string; note?: string }

// What each backend ambulance status means to the driver. Order is the order shown in the sheet.
export const STATUS_OPTIONS: { value: AmbulanceStatus; meta: StatusMeta }[] = [
  {
    value: 'available',
    meta: {
      label: 'Available',
      description: 'Ready to be dispatched for new emergency calls',
      color: colors.green,
      bg: colors.greenBg,
    },
  },
  {
    value: 'responding',
    meta: {
      label: 'Responding to a call',
      description: 'Active trip or en route to patient location',
      color: colors.red,
      bg: colors.redBg,
    },
  },
  {
    value: 'at_hospital',
    meta: {
      label: 'At hospital',
      description: 'Patient handover, triage, or sanitization',
      color: colors.blue,
      bg: colors.blueBg,
    },
  },
  {
    value: 'unavailable',
    meta: {
      label: 'Out of service',
      description: 'Shift ended, refueling, or vehicle maintenance',
      color: colors.slate,
      bg: colors.slateBg,
      note: "You'll be left out of the next position plan.",
    },
  },
]

export const STATUS_META = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.meta])) as Record<
  AmbulanceStatus,
  StatusMeta
>
