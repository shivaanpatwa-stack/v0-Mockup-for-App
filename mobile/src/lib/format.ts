import type { UnitType } from './api'

export const UNIT_TYPE_NAME: Record<UnitType, string> = {
  ALS: 'Advanced Life Support',
  BLS: 'Basic Life Support',
}

/**
 * Names are entered by hand ("lilavati", "hospital 1"). Capitalise words that are all lower case for display, and
 * leave anything already cased (such as "MH-01" or "St. George's") alone.
 */
export function displayName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .trim()
    .split(/\s+/)
    .map((word) => (word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}
