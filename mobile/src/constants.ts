import type { AmbulanceStatus } from '@/lib/api'

export const colors = {
  bg: '#F0E9DD',
  card: '#F8F5EE',
  white: '#FFFFFF',
  border: '#DDD5C6',
  text: '#0F172A',
  muted: '#5B6573',
  faint: '#8A93A0',
  primary: '#0B4A6F',
  stepIdle: '#D9CFBE',
  green: '#15803D',
  greenBg: '#DCFCE7',
  red: '#DC2626',
  redBg: '#FEE2E2',
  amber: '#B45309',
  amberBg: '#FEF3C7',
  amberDot: '#D97706',
  blue: '#2563EB',
  blueText: '#1D4ED8',
  blueBg: '#DBEAFE',
  indigo: '#4338CA',
  indigoBg: '#E0E7FF',
  slate: '#475569',
  slateBg: '#E8ECF1',
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
