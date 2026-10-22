'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { addAmbulance, ApiError, setAmbulanceStatus, updateHospital, type Hospital } from '@/lib/api'

const MAX_RADIUS_KM = 100
const NETWORK_ERROR = "Can't reach the server. Is the backend running?"

type EditFleetDialogProps = {
  hospital: Hospital
  open: boolean
  onClose: () => void
  /** Called after any successful change, so the page can refresh and prompt a recalculation. */
  onChanged: () => Promise<void> | void
}

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : NETWORK_ERROR)

export default function EditFleetDialog({ hospital, open, onClose, onChanged }: EditFleetDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(hospital.name)
  const [radius, setRadius] = useState(String(hospital.operating_radius_km))
  const [newId, setNewId] = useState('')
  const [newType, setNewType] = useState<'ALS' | 'BLS'>('ALS')
  // Which action is in flight: 'hospital', 'add', or an ambulance call sign.
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setName(hospital.name)
      setRadius(String(hospital.operating_radius_km))
      setError(null)
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
    // Only `open` on purpose: re-sync the form when the dialog opens, not on every hospital refresh.
  }, [open])

  const radiusKm = Number(radius)
  const radiusValid = radius.trim() !== '' && radiusKm > 0 && radiusKm <= MAX_RADIUS_KM
  const hospitalChanged = name.trim() !== hospital.name || radiusKm !== hospital.operating_radius_km
  const idTaken = hospital.ambulances.some((a) => a.id === newId.trim())

  async function run(action: string, change: () => Promise<unknown>) {
    setBusy(action)
    setError(null)
    try {
      await change()
      await onChanged()
      return true
    } catch (err) {
      setError(errorText(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  function saveHospital(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !radiusValid || !hospitalChanged) return
    run('hospital', () => updateHospital({ name: name.trim(), operating_radius_km: radiusKm }))
  }

  async function submitAmbulance(e: FormEvent) {
    e.preventDefault()
    if (!newId.trim() || idTaken) return
    if (await run('add', () => addAmbulance({ id: newId.trim(), type: newType }))) setNewId('')
  }

  return (
    <dialog ref={dialogRef} className="fleet-dialog" onClose={onClose} aria-labelledby="fleet-dialog-title">
      <div className="fleet-dialog-head">
        <h2 id="fleet-dialog-title">Edit fleet</h2>
        <button type="button" className="banner-dismiss" aria-label="Close" onClick={onClose}>×</button>
      </div>
      {error && <p className="controls-error" role="alert">{error}<button type="button" className="banner-dismiss" aria-label="Dismiss error" onClick={() => setError(null)}>×</button></p>}

      <form className="fleet-dialog-section" onSubmit={saveHospital}>
        <h3>Hospital</h3>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Operating radius (km)<input className="number-input" type="number" min="0.5" max={MAX_RADIUS_KM} step="0.5" value={radius} onChange={(e) => setRadius(e.target.value)} aria-invalid={!radiusValid} /></label>
        <p className="fleet-dialog-hint">To move the hospital, register it again.</p>
        <button type="submit" disabled={busy !== null || !name.trim() || !radiusValid || !hospitalChanged}>{busy === 'hospital' ? 'Saving…' : 'Save hospital'}</button>
      </form>

      <div className="fleet-dialog-section">
        <h3>Ambulances</h3>
        <ul className="fleet-dialog-list">
          {hospital.ambulances.map((a) => {
            const outOfService = a.status === 'unavailable'
            return (
              <li key={a.id}>
                <span><strong>{a.id}</strong> · {a.type} · {outOfService ? 'Out of service' : 'In service'}</span>
                <button type="button" disabled={busy !== null} onClick={() => run(a.id, () => setAmbulanceStatus(a.id, outOfService ? 'available' : 'unavailable'))}>
                  {busy === a.id ? 'Saving…' : outOfService ? 'Return to service' : 'Out of service'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <form className="fleet-dialog-section fleet-dialog-add" onSubmit={submitAmbulance}>
        <h3>Add ambulance</h3>
        <label>ID<input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="e.g. AMB-006" aria-invalid={idTaken} /></label>
        <label>Type<select value={newType} onChange={(e) => setNewType(e.target.value as 'ALS' | 'BLS')}><option>ALS</option><option>BLS</option></select></label>
        <button type="submit" disabled={busy !== null || !newId.trim() || idTaken}>{busy === 'add' ? 'Adding…' : 'Add'}</button>
        {idTaken && <p className="fleet-dialog-hint">That ID is already in this fleet.</p>}
      </form>
    </dialog>
  )
}
