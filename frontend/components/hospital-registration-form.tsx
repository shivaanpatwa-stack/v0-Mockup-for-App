'use client'

import dynamic from 'next/dynamic'
import { X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { LatLng, ViewTarget } from './location-picker-map'
import CopyCode from './copy-code'
import LocationSearch from './location-search'
import {
  ApiError,
  getStoredHospitalName,
  registerHospital,
  signIn,
  type Place,
  type RegisterHospitalResponse,
} from '@/lib/api'

const LocationPickerMap = dynamic(() => import('./location-picker-map'), {
  ssr: false,
  loading: () => <div className="reg-map-loading">Loading map…</div>,
})

const PLACE_ZOOM = 16

// The area the platform covers (same box as the backend's place search).
const MUMBAI = { latMin: 18.85, latMax: 19.3, lngMin: 72.75, lngMax: 73.05 }
const insideMumbai = ({ lat, lng }: LatLng) =>
  lat >= MUMBAI.latMin && lat <= MUMBAI.latMax && lng >= MUMBAI.lngMin && lng <= MUMBAI.lngMax

/** Where the pin came from: a search result (with its label) or the user clicking/dragging. */
type PinSource = { kind: 'search'; label: string } | { kind: 'manual' }

const MIN_RADIUS_KM = 5
const MAX_RADIUS_KM = 30

type AmbulanceType = 'ALS' | 'BLS'
type AmbulanceRow = { key: number; id: string; type: AmbulanceType }

export default function HospitalRegistrationForm({ hasSession }: { hasSession: boolean }) {
  const router = useRouter()
  // Signed in already: confirm before registering, since finishing switches this browser to the new hospital.
  const [confirmedSwitch, setConfirmedSwitch] = useState(!hasSession)
  const [currentName, setCurrentName] = useState<string | null>(null)
  const [savedKeys, setSavedKeys] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [radius, setRadius] = useState('15')
  const [ambulances, setAmbulances] = useState<AmbulanceRow[]>([{ key: 0, id: '', type: 'ALS' }])
  const nextKey = useRef(1)
  const [location, setLocation] = useState<LatLng | null>(null)
  const [pinSource, setPinSource] = useState<PinSource | null>(null)
  const [viewTarget, setViewTarget] = useState<ViewTarget | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [registration, setRegistration] = useState<RegisterHospitalResponse | null>(null)

  const radiusKm = Number(radius)
  const radiusValid =
    radius.trim() !== '' && Number.isFinite(radiusKm) && radiusKm >= MIN_RADIUS_KM && radiusKm <= MAX_RADIUS_KM

  const ids = ambulances.map((a) => a.id.trim())
  const allIdsFilled = ids.every(Boolean)
  const hasDuplicateIds = new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length

  const registered = registration !== null
  const canSubmit =
    name.trim() !== '' &&
    radiusValid &&
    ambulances.length > 0 &&
    allIdsFilled &&
    !hasDuplicateIds &&
    location !== null &&
    insideMumbai(location) &&
    !submitting &&
    !registered

  useEffect(() => setCurrentName(getStoredHospitalName()), [])

  function updateAmbulance(key: number, patch: Partial<Omit<AmbulanceRow, 'key'>>) {
    setAmbulances((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addAmbulance() {
    setAmbulances((rows) => [...rows, { key: nextKey.current++, id: '', type: 'ALS' }])
  }

  function removeAmbulance(key: number) {
    setAmbulances((rows) => rows.filter((row) => row.key !== key))
  }

  function choosePlace(place: Place) {
    setLocation({ lat: place.lat, lng: place.lng })
    setPinSource({ kind: 'search', label: place.label })
    setViewTarget({ center: { lat: place.lat, lng: place.lng }, zoom: PLACE_ZOOM })
  }

  // Stable identity so the map's drag handler isn't rebuilt on every keystroke elsewhere in the form.
  const placeManually = useCallback((pos: LatLng) => {
    setLocation(pos)
    setPinSource({ kind: 'manual' })
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit || !location) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const body = await registerHospital({
        hospital_name: name.trim(),
        lat: location.lat,
        lng: location.lng,
        operating_radius_km: radiusKm,
        ambulances: ambulances.map((a) => ({ id: a.id.trim(), type: a.type })),
      })
      // Kept only in component state until the user confirms they've saved it.
      setRegistration(body)
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Can't reach the server. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function goToDashboard() {
    if (!registration || !savedKeys) return
    setFinishing(true)
    setFinishError(null)
    try {
      const result = await signIn(registration.code, registration.admin_key)
      if (!result.ok) {
        setFinishError(
          result.status === 429
            ? 'Too many attempts. Try again in a few minutes.'
            : 'Signing in failed. Use the code and key you saved on the start page.',
        )
        return
      }
      // The key is only in the httpOnly session cookie from here on.
      setRegistration({ ...registration, admin_key: '' })
      router.replace('/app')
    } catch {
      setFinishError("Can't reach the server. Check your connection and try again.")
    } finally {
      setFinishing(false)
    }
  }

  if (!confirmedSwitch) {
    return (
      <section className="reg-card reg-switch">
        <h2>You&apos;re already signed in{currentName ? ` to ${currentName}` : ''}</h2>
        <p className="reg-hint">
          Registering creates a new hospital and switches this browser to it. Make sure you have the current
          hospital&apos;s code and dashboard key saved if you&apos;ll need it again.
        </p>
        <div className="reg-switch-actions">
          <button type="button" className="reg-submit" onClick={() => setConfirmedSwitch(true)}>
            Register a new hospital
          </button>
          <Link href="/app" className="reg-secondary">
            Back to dashboard
          </Link>
        </div>
      </section>
    )
  }

  if (registration) {
    return (
      <section className="reg-card reg-keys" aria-labelledby="save-keys-title">
        <h2 id="save-keys-title">Save your keys</h2>
        <p className="reg-hint">
          {registration.fleet_size} {registration.fleet_size === 1 ? 'ambulance' : 'ambulances'} added. These are shown{' '}
          <strong>only once</strong>. Store them somewhere safe, such as a password manager.
        </p>
        <div className="reg-key-row">
          <CopyCode code={registration.code} label="Hospital code" />
          <p className="reg-hint">Drivers enter this in the app.</p>
        </div>
        {registration.admin_key && (
          <div className="reg-key-row">
            <CopyCode code={registration.admin_key} label="Dashboard key" className="reg-dashboard-key" />
            <p className="reg-hint">Needed to sign in to this dashboard. Keep it private.</p>
          </div>
        )}
        <label className="reg-confirm">
          <input type="checkbox" checked={savedKeys} onChange={(e) => setSavedKeys(e.target.checked)} />I have saved these
        </label>
        {finishError && (
          <p className="reg-error" role="alert">
            {finishError}
          </p>
        )}
        <button type="button" className="reg-submit" onClick={goToDashboard} disabled={!savedKeys || finishing}>
          {finishing ? 'Signing in…' : 'Go to dashboard'}
        </button>
      </section>
    )
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
              placeholder="e.g. City Hospital, Parel"
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
              ><X aria-hidden="true" size={14} /></button>
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
        <p className="reg-hint">Search for the hospital or its area and pick a result, or click the map to place the pin.</p>
        <LocationSearch onSelect={choosePlace} />
        <div className="reg-map">
          <LocationPickerMap
            position={location}
            radiusKm={radiusValid ? radiusKm : null}
            viewTarget={viewTarget}
            onPick={placeManually}
          />
        </div>
        <div className="reg-pin-status">
          {pinSource ? (
            <span className="reg-chip">{pinSource.kind === 'search' ? `Selected: ${pinSource.label}` : 'Pin set manually'}</span>
          ) : (
            <span className="reg-coords">No location selected yet</span>
          )}
          {location && (
            <span className="reg-coords">
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)} · click the map or drag the pin to adjust
            </span>
          )}
        </div>
        {location && !insideMumbai(location) && (
          <p className="reg-error" role="alert">
            This point is outside Mumbai. Choose a location within the city to register.
          </p>
        )}
      </section>

      {submitError && (
        <p className="reg-error reg-banner" role="alert">
          {submitError}
        </p>
      )}
      <button type="submit" className="reg-submit" disabled={!canSubmit}>
        {submitting ? 'Registering…' : 'Register Hospital'}
      </button>
    </form>
  )
}
