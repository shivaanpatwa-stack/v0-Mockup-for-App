'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export type SortState<K extends string> = { key: K; dir: 1 | -1 }

/** A table header that sorts: a real button, announced with aria-sort on the <th>. */
export function SortHeader<K extends string>({
  label,
  k,
  sort,
  onSort,
  numeric = false,
}: {
  label: string
  k: K
  sort: SortState<K>
  onSort: (s: SortState<K>) => void
  numeric?: boolean
}) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown
  return (
    <th className={numeric ? 'num-cell' : undefined} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-btn" onClick={() => onSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {label} <Icon aria-hidden="true" />
      </button>
    </th>
  )
}

export function sortBy<T, K extends string>(rows: T[], sort: SortState<K>, get: (row: T, key: K) => string | number | null) {
  return [...rows].sort((a, b) => {
    const x = get(a, sort.key)
    const y = get(b, sort.key)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir
  })
}
