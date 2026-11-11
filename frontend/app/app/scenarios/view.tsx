'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useApp } from '@/lib/app-state'
import { deleteScenario, getScenarios, type SavedScenario } from '@/lib/api'
import { formatDayClock, num } from '@/lib/format'
import { describeScenario } from '@/lib/describe'

export default function ScenariosPage() {
  const router = useRouter()
  const { setPendingScenarioRequest, setWhatIfOpen, pushToast, hospital } = useApp()
  const [rows, setRows] = useState<SavedScenario[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    getScenarios()
      .then((r) => {
        setRows(r)
        setError(null)
      })
      .catch((err) => setError((err as Error).message))
  }, [])
  useEffect(() => {
    if (hospital) load()
  }, [hospital, load])

  const open = (s: SavedScenario) => {
    setPendingScenarioRequest(s.parameters)
    setWhatIfOpen(true)
    router.push('/app')
  }
  const remove = async (s: SavedScenario) => {
    if (!window.confirm(`Delete the saved scenario "${s.name}"? This can't be undone.`)) return
    try {
      await deleteScenario(s.scenario_id)
      pushToast({ text: `Deleted "${s.name}"` })
      load()
    } catch (err) {
      pushToast({ text: `Couldn't delete: ${(err as Error).message}`, tone: 'critical' })
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Scenarios</h1>
          <p>What-ifs you saved. Open one to see it on the live map and adjust it.</p>
        </div>
      </div>
      {error && <p className="controls-error" role="alert">{error} <button type="button" className="btn btn-sm" onClick={load}>Retry</button></p>}
      {rows === null && !error ? (
        <p className="muted">Loading saved scenarios…</p>
      ) : rows && rows.length === 0 ? (
        <div className="empty">
          <strong>No saved scenarios</strong>
          <span>Open What if… on the live map, set the knobs, then choose Save.</span>
        </div>
      ) : rows ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Saved scenarios</caption>
            <thead>
              <tr>
                <th>Name</th>
                <th>Assumes</th>
                <th className="num-cell">Avg response</th>
                <th className="num-cell">20-min reach</th>
                <th className="num-cell">Wards within 20 min</th>
                <th>Saved</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.scenario_id}>
                  <td>{s.name}</td>
                  <td className="muted">{describeScenario(s.parameters)}</td>
                  <td className="num-cell">{num(s.result_summary?.avg_response_min)} min</td>
                  <td className="num-cell">{num(s.result_summary?.reach_20_pct ?? s.result_summary?.reach_15_pct, 0)}%</td>
                  <td className="num-cell">{s.result_summary?.wards_covered ?? '–'}</td>
                  <td className="mono">{formatDayClock(s.created_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-sm" onClick={() => open(s)}>Open in What if…</button>{' '}
                    <button type="button" className="btn btn-sm btn-ghost" aria-label={`Delete ${s.name}`} onClick={() => remove(s)}><Trash2 aria-hidden="true" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Scenario numbers come from simulated demand and the assumptions listed. They are not forecasts of real events.</p>
    </div>
  )
}
