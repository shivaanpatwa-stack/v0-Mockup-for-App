'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/api'

export default function SignInCard() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!code.trim() || !key.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await signIn(code.trim(), key.trim())
      if (result.ok) {
        setKey('')
        router.replace('/')
        return
      }
      // Never say which part was wrong.
      setError(result.status === 429 ? 'Too many attempts. Try again in a few minutes.' : 'Invalid code or key')
    } catch {
      setError("Can't reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="start-card" onSubmit={onSubmit}>
      <h2>Sign in to your hospital</h2>
      <p className="start-hint">Use the driver code and dashboard key you saved when the hospital was registered.</p>
      <label className="reg-field">
        Hospital code
        <input
          className="reg-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. PAREL-7K3QMZ"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
        />
      </label>
      <label className="reg-field">
        Dashboard key
        <input
          className="reg-input"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="current-password"
          spellCheck={false}
        />
      </label>
      {error && (
        <p className="reg-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="reg-submit" disabled={busy || !code.trim() || !key.trim()}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
