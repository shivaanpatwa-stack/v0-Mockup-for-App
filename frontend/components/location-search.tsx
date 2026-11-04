'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { PLACE_QUERY_MAX, PLACE_QUERY_MIN, searchPlaces, type Place } from '@/lib/api'

const DEBOUNCE_MS = 350
const CLIENT_CACHE_MAX = 50

// Results already fetched this visit, by lowercased query: backspacing to an earlier query, or
// searching it again, shows them instantly with no request. Oldest entries are dropped first.
const resultCache = new Map<string, Place[]>()
function remember(key: string, places: Place[]) {
  resultCache.delete(key)
  resultCache.set(key, places)
  if (resultCache.size > CLIENT_CACHE_MAX) resultCache.delete(resultCache.keys().next().value as string)
}

type Status = 'idle' | 'loading' | 'results' | 'empty' | 'error' | 'rate_limited'

/**
 * Place autocomplete (ARIA combobox pattern). Results are rendered as React text only: names come
 * from OpenStreetMap and must never be inserted as HTML.
 */
export default function LocationSearch({ onSelect }: { onSelect: (place: Place) => void }) {
  const listId = useId()
  const optionId = (i: number) => `${listId}-option-${i}`
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // The label of the place just picked: typing it back into the box shouldn't search again.
  const pickedRef = useRef<string | null>(null)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [places, setPlaces] = useState<Place[]>([])
  const [active, setActive] = useState(-1)

  // Debounced search; each new query cancels the request for the previous one.
  useEffect(() => {
    const q = query.trim()
    if (q.length < PLACE_QUERY_MIN || q === pickedRef.current) {
      setStatus('idle')
      setPlaces([])
      return
    }
    const cached = resultCache.get(q.toLowerCase())
    if (cached) {
      setPlaces(cached)
      setStatus(cached.length ? 'results' : 'empty')
      setActive(-1)
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    const timer = setTimeout(async () => {
      try {
        const result = await searchPlaces(q, controller.signal)
        if (!result.ok) {
          setStatus(result.reason === 'rate_limited' ? 'rate_limited' : result.reason === 'too_short' ? 'idle' : 'error')
          setPlaces([])
          return
        }
        remember(q.toLowerCase(), result.places)
        setPlaces(result.places)
        setStatus(result.places.length ? 'results' : 'empty')
        setActive(-1)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setStatus('error')
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  // Close when clicking anywhere outside the box and its dropdown.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const showDropdown = open && status !== 'idle'
  const hasOptions = status === 'results' && places.length > 0

  function choose(place: Place) {
    pickedRef.current = place.label
    setQuery(place.label)
    setOpen(false)
    setActive(-1)
    onSelect(place)
  }

  function clear() {
    pickedRef.current = null
    setQuery('')
    setPlaces([])
    setStatus('idle')
    setOpen(false)
    inputRef.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hasOptions) return
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + places.length) % places.length)
    } else if (e.key === 'Enter') {
      // The box sits inside the registration form: Enter must never submit it.
      e.preventDefault()
      if (showDropdown && hasOptions) choose(places[active >= 0 ? active : 0])
    } else if (e.key === 'Escape') {
      if (showDropdown) {
        e.preventDefault()
        setOpen(false)
      }
    }
  }

  return (
    <div className="loc-search" ref={rootRef}>
      <div className="loc-search-field">
        <input
          ref={inputRef}
          className="reg-input loc-search-input"
          type="text"
          role="combobox"
          aria-label="Search for the hospital's location in Mumbai"
          aria-autocomplete="list"
          aria-expanded={showDropdown && hasOptions}
          aria-controls={listId}
          aria-activedescendant={showDropdown && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={PLACE_QUERY_MAX}
          placeholder="Search a hospital, street or area in Mumbai"
          value={query}
          onChange={(e) => {
            pickedRef.current = null
            // Drop the previous results at once, so Enter can't pick one that no longer matches.
            setPlaces([])
            setActive(-1)
            setStatus(e.target.value.trim().length >= PLACE_QUERY_MIN ? 'loading' : 'idle')
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button type="button" className="loc-search-clear" aria-label="Clear search" onClick={clear}>
            ×
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="loc-search-dropdown">
          <ul id={listId} role="listbox" aria-label="Places">
            {hasOptions &&
              places.map((place, i) => {
                const secondary = place.label.startsWith(place.name)
                  ? place.label.slice(place.name.length).replace(/^,\s*/, '')
                  : place.label
                return (
                  <li
                    key={place.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    className={i === active ? 'loc-option is-active' : 'loc-option'}
                    // pointerdown, not click: keeps focus in the input and beats the outside-click handler.
                    onPointerDown={(e) => {
                      e.preventDefault()
                      choose(place)
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span className="loc-option-name">{place.name}</span>
                    {secondary && <span className="loc-option-label">{secondary}</span>}
                  </li>
                )
              })}
          </ul>
          <div className="loc-search-status" role="status" aria-live="polite">
            {status === 'loading' && 'Searching…'}
            {status === 'empty' && 'No places found in Mumbai'}
            {status === 'error' && 'Search unavailable. Click the map to place the pin.'}
            {status === 'rate_limited' && 'Too many searches. Wait a minute, or click the map to place the pin.'}
          </div>
          <p className="loc-search-footer">Search by Photon, data © OpenStreetMap contributors</p>
        </div>
      )}
    </div>
  )
}
