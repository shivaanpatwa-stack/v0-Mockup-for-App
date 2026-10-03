'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { LatLng, ViewTarget } from './location-picker-map'

const LocationPickerMap = dynamic(() => import('./location-picker-map'), {
  ssr: false,
  loading: () => <div className="reg-map-loading">Loading map…</div>,
})

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
// Biases (does not restrict) geocoding results towards Mumbai: left,top,right,bottom.
const MUMBAI_VIEWBOX = '72.75,19.30,73.05,18.85'

const MIN_RADIUS_KM = 5
const MAX_RADIUS_KM = 30
const REDIRECT_DELAY_MS = 2000

type AmbulanceType = 'ALS' | 'BLS'
type AmbulanceRow = { key: number; id: string; type: AmbulanceType }

// Nominatim's boundingbox is [south, north, west, east] as strings.
type NominatimResult = { boundingbox: [string, string, string, string] }

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const { detail } = await res.json()
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      // FastAPI validation errors: [{ loc: ['body', 'field'], msg }, ...]
      return detail.map((d) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`).join('; ')
    }
  } catch {
    // Body wasn't JSON; fall through to the generic message.
  }
  return `Registration failed (HTTP ${res.status}).`
}

export default function HospitalRegistrationForm() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [radius, setRadius] = useState('15')
  const [ambulances, setAmbulances] = useState<AmbulanceRow[]>([{ key: 0, id: '', type: 'ALS' }])
  const nextKey = useRef(1)
  const [location, setLocation] = useState<LatLng | null>(null)

  const [query, setQuery] = useState('')
  const [viewTarget, setViewTarget] = useState<ViewTarget | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchAbort = useRef<AbortController | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fleetSize, setFleetSize] = useState<number | null>(null)

  const radiusKm = Number(radius)
  const radiusValid =
    radius.trim() !== '' && Number.isFinite(radiusKm) && radiusKm >= MIN_RADIUS_KM && radiusKm <= MAX_RADIUS_KM

  const ids = ambulances.map((a) => a.id.trim())
  const allIdsFilled = ids.every(Boolean)
  const hasDuplicateIds = new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length

  const registered = fleetSize !== null
  const canSubmit =
    name.trim() !== '' &&
    radiusValid &&
    ambulances.length > 0 &&
    allIdsFilled &&
    !hasDuplicateIds &&
    location !== null &&
    !submitting &&
    !registered

  useEffect(() => {
    if (!registered) return
    const timer = setTimeout(() => router.push('/'), REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [registered, router])

  useEffect(() => () => searchAbort.current?.abort(), [])

  function updateAmbulance(key: number, patch: Partial<Omit<AmbulanceRow, 'key'>>) {
    setAmbulances((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addAmbulance() {
    setAmbulances((rows) => [...rows, { key: nextKey.current++, id: '', type: 'ALS' }])
  }

  function removeAmbulance(key: number) {
    setAmbulances((rows) => rows.filter((row) => row.key !== key))
  }

  async function runSearch() {
    const q = query.trim()
    if (!q) return

    searchAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    setSearching(true)
    setSearchError(null)

    try {
      const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=in&viewbox=${MUMBAI_VIEWBOX}&q=${encodeURIComponent(q)}`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const results: NominatimResult[] = await res.json()
      if (results.length === 0) {
        setSearchError('No matches found. Try a nearby landmark or area name.')
        return
      }
      const [south, north, west, east] = results[0].boundingbox.map(Number)
      setViewTarget({
        bounds: [
          [south, west],
          [north, east],
        ],
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setSearchError('Search failed. Check your connection and try again.')
    } finally {
      if (searchAbort.current === controller) setSearching(false)
    }
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    // The search box lives inside the registration <form>; Enter must not submit it.
    e.preventDefault()
    runSearch()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit || !location) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`${API_URL}/hospital/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospital_name: name.trim(),
          lat: location.lat,
          lng: location.lng,
          operating_radius_km: radiusKm,
          ambulances: ambulances.map((a) => ({ id: a.id.trim(), type: a.type })),
        }),
      })
      if (!res.ok) {
        setSubmitError(await readErrorMessage(res))
        return
      }
      const body = await res.json()
      setFleetSize(typeof body.fleet_size === 'number' ? body.fleet_size : ambulances.length)
    } catch {
      setSubmitError(`Couldn't reach the server at ${API_URL}. Is the backend running?`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="reg-form" onSubmit={onSubmit} noValidate>
      <section className="reg-card">
        <h2>Hospital details</h2>
        <div className="reg-row">
          <label className="reg-field reg-grow">
            Hospital name
            <input
              className="reg-input"
              type="text"
              value={name}
              maxLength={120}
              placeholder="e.g. Hospital A — Parel"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="reg-field reg-radius">
            Operating radius (km)
            <input
              className="reg-input"
              type="number"
              inputMode="decimal"
              min={MIN_RADIUS_KM}
              max={MAX_RADIUS_KM}
              step="any"
              value={radius}
              aria-invalid={!radiusValid}
              onChange={(e) => setRadius(e.target.value)}
            />
          </label>
        </div>
        {!radiusValid && (
          <p className="reg-error" role="alert">
            Radius must be between {MIN_RADIUS_KM} and {MAX_RADIUS_KM} km.
          </p>
        )}
      </section>

      <section className="reg-card">
        <div className="reg-card-head">
          <h2>Ambulance fleet</h2>
          <span className="reg-hint">{ambulances.length} {ambulances.length === 1 ? 'unit' : 'units'}</span>
        </div>
        <ul className="reg-fleet">
          {ambulances.map((a, index) => (
            <li key={a.key} className="reg-fleet-row">
              <input
                className="reg-input reg-grow"
                type="text"
                value={a.id}
                maxLength={40}
                placeholder={`AMB-${String(index + 1).padStart(3, '0')}`}
                aria-label={`Ambulance ${index + 1} ID`}
                onChange={(e) => updateAmbulance(a.key, { id: e.target.value })}
              />
              <select
                className="reg-input"
                value={a.type}
                aria-label={`Ambulance ${index + 1} type`}
                onChange={(e) => updateAmbulance(a.key, { type: e.target.value as AmbulanceType })}
              >
                <option value="ALS">ALS</option>
                <option value="BLS">BLS</option>
              </select>
              <button
                type="button"
                className="reg-remove"
                aria-label={`Remove ambulance ${index + 1}`}
                disabled={ambulances.length === 1}
                onClick={() => removeAmbulance(a.key)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {hasDuplicateIds && (
          <p className="reg-error" role="alert">
            Ambulance IDs must be unique.
          </p>
        )}
        <button type="button" className="reg-secondary" onClick={addAmbulance}>
          + Add ambulance
        </button>
      </section>

      <section className="reg-card">
        <h2>Hospital location</h2>
        <p className="reg-hint">Search for an area, then click the map to place the hospital.</p>
        <div className="reg-search">
          <input
            className="reg-input reg-grow"
            type="search"
            value={query}
            placeholder="Search an address or area, then press Enter"
            aria-label="Search for a location"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          <button type="button" className="reg-secondary" onClick={runSearch} disabled={searching || !query.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {searchError && (
          <p className="reg-error" role="alert">
            {searchError}
          </p>
        )}
        <div className="reg-map">
          <LocationPickerMap
            position={location}
            radiusKm={radiusValid ? radiusKm : null}
            viewTarget={viewTarget}
            onPick={setLocation}
          />
        </div>
        <p className="reg-coords">
          {location
            ? `Selected: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} — click elsewhere to move it`
            : 'No location selected yet'}
        </p>
      </section>

      {submitError && (
        <p className="reg-error reg-banner" role="alert">
          {submitError}
        </p>
      )}
      {registered && (
        <div className="reg-success" role="status">
          <strong>Hospital registered.</strong> {fleetSize} {fleetSize === 1 ? 'ambulance' : 'ambulances'} added to
          your fleet. Taking you to the dashboard…{' '}
          <Link href="/">Go now</Link>
        </div>
      )}

      <button type="submit" className="reg-submit" disabled={!canSubmit}>
        {submitting ? 'Registering…' : 'Register Hospital'}
      </button>
    </form>
  )
}
