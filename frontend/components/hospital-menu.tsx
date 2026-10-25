'use client'

import { useEffect, useRef, useState } from 'react'
import CopyCode from './copy-code'
import { ApiError, rotateDashboardKey, rotateDriverCode, signOut, type Hospital } from '@/lib/api'

type Rotating = 'code' | 'key'

const CONFIRM: Record<Rotating, { title: string; body: string; action: string }> = {
  code: {
    title: 'Regenerate driver code?',
    body: 'The current code stops working immediately. Every driver will need to enter the new code in the app.',
    action: 'Regenerate driver code',
  },
  key: {
    title: 'Regenerate dashboard key?',
    body: 'The current key stops working immediately, including on other browsers signed in to this hospital. This browser stays signed in.',
    action: 'Regenerate dashboard key',
  },
}

/** Header menu: hospital keys (view and regenerate) and sign out / switch hospital. */
export default function HospitalMenu({ hospital, onChanged }: { hospital: Hospital; onChanged: () => Promise<void> | void }) {
  const menuRef = useRef<HTMLDetailsElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [confirming, setConfirming] = useState<Rotating | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A freshly generated dashboard key: shown once, cleared when the dialog closes.
  const [newKey, setNewKey] = useState<string | null>(null)

  useEffect(() => {
    // Close the menu when clicking outside it.
    const onClick = (e: MouseEvent) => {
      if (menuRef.current?.open && !menuRef.current.contains(e.target as Node)) menuRef.current.open = false
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  function openKeys() {
    if (menuRef.current) menuRef.current.open = false
    setConfirming(null)
    setError(null)
    dialogRef.current?.showModal()
  }

  function onDialogClose() {
    setNewKey(null)
    setConfirming(null)
  }

  async function regenerate(what: Rotating) {
    setBusy(true)
    setError(null)
    try {
      // The proxy stores the new value in the session cookie in the same response.
      if (what === 'key') setNewKey((await rotateDashboardKey()).admin_key)
      else await rotateDriverCode()
      setConfirming(null)
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  async function onSignOut() {
    await signOut()
    window.location.assign('/start')
  }

  return (
    <>
      <details className="hospital-menu" ref={menuRef}>
        <summary aria-label="Hospital menu">Menu</summary>
        <div className="hospital-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={openKeys}>
            Hospital keys
          </button>
          <button type="button" role="menuitem" onClick={onSignOut}>
            Sign out / switch hospital
          </button>
        </div>
      </details>

      <dialog ref={dialogRef} className="fleet-dialog keys-dialog" onClose={onDialogClose} aria-labelledby="keys-title">
        <div className="fleet-dialog-head">
          <h2 id="keys-title">Hospital keys</h2>
          <button type="button" className="banner-dismiss" aria-label="Close" onClick={() => dialogRef.current?.close()}>
            ×
          </button>
        </div>
        {error && (
          <p className="controls-error" role="alert">
            {error}
          </p>
        )}

        <div className="fleet-dialog-section">
          <h3>Driver code</h3>
          <CopyCode code={hospital.code} />
          <p className="fleet-dialog-hint">Drivers enter this in the app.</p>
        </div>

        <div className="fleet-dialog-section">
          <h3>Dashboard key</h3>
          {newKey ? (
            <>
              <CopyCode code={newKey} label="New dashboard key" className="reg-dashboard-key" />
              <p className="fleet-dialog-hint">
                <strong>Shown only now.</strong> Save it before closing this window; it can&apos;t be shown again.
              </p>
            </>
          ) : (
            <>
              <span className="copy-code">
                Dashboard key: <strong aria-label="hidden">••••••••••••</strong>
              </span>
              <p className="fleet-dialog-hint">Only shown when it is created. If it&apos;s lost, regenerate it.</p>
            </>
          )}
        </div>

        <div className="fleet-dialog-section">
          {confirming ? (
            <div className="keys-confirm" role="alertdialog" aria-labelledby="keys-confirm-title">
              <h3 id="keys-confirm-title">{CONFIRM[confirming].title}</h3>
              <p className="fleet-dialog-hint">{CONFIRM[confirming].body}</p>
              <div className="keys-actions">
                <button type="button" className="keys-danger" disabled={busy} onClick={() => regenerate(confirming)}>
                  {busy ? 'Regenerating…' : CONFIRM[confirming].action}
                </button>
                <button type="button" className="keys-cancel" disabled={busy} onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="keys-actions">
              <button type="button" className="keys-cancel" onClick={() => setConfirming('code')}>
                Regenerate driver code
              </button>
              <button type="button" className="keys-cancel" onClick={() => setConfirming('key')}>
                Regenerate dashboard key
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>
  )
}
