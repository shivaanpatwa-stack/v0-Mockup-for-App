'use client'

import { useState } from 'react'
import {
  History,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Eye,
  RotateCcw,
  Sparkles,
  ChevronDown,
} from 'lucide-react'
import type { Kpis, RunDetail, RunSummary } from '@/lib/api'

type RunHistoryTableProps = {
  runs: RunSummary[] | null
  viewing: RunDetail | null
  loadingRunId: number | null
  onViewRun: (runId: number) => void
  onBackToLive: () => void
  liveRunId?: number | null
  liveKpis?: Kpis | null
}

const istParts = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

function formatIST(iso: string) {
  try {
    const part = Object.fromEntries(istParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
    return `${part.day} ${part.month} ${part.year}, ${part.hour}:${part.minute} ${String(part.dayPeriod).toUpperCase()}`
  } catch {
    return iso
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'Just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 30) return `${diffDays}d ago`
    return formatIST(iso)
  } catch {
    return iso
  }
}

function formatHour(hour: number) {
  if (hour === 0) return '12:00 AM'
  if (hour < 12) return `${hour}:00 AM`
  if (hour === 12) return '12:00 PM'
  return `${hour - 12}:00 PM`
}

export default function RunHistoryTable({
  runs,
  viewing,
  loadingRunId,
  onViewRun,
  onBackToLive,
  liveRunId,
  liveKpis,
}: RunHistoryTableProps) {
  const [isOpen, setIsOpen] = useState(true)

  const getResponseTime = (run: RunSummary): string => {
    if (run.status !== 'succeeded') return '—'
    if (viewing && viewing.run_id === run.run_id && viewing.kpis?.avg_response_min.after != null) {
      return `${viewing.kpis.avg_response_min.after.toFixed(1)} min`
    }
    if (liveRunId && liveRunId === run.run_id && liveKpis?.avg_response_min.after != null) {
      return `${liveKpis.avg_response_min.after.toFixed(1)} min`
    }
    if (run.avg_response_min != null) {
      return `${run.avg_response_min.toFixed(1)} min`
    }
    return '—'
  }

  const getResponseTimeClass = (run: RunSummary): string => {
    let val: number | null = null
    if (viewing && viewing.run_id === run.run_id && viewing.kpis?.avg_response_min.after != null) {
      val = viewing.kpis.avg_response_min.after
    } else if (liveRunId && liveRunId === run.run_id && liveKpis?.avg_response_min.after != null) {
      val = liveKpis.avg_response_min.after
    } else if (run.avg_response_min != null) {
      val = run.avg_response_min
    }

    if (val === null) return 'text-stone-500'
    if (val <= 11.5) return 'text-emerald-700 font-semibold'
    if (val <= 14.0) return 'text-amber-700 font-semibold'
    return 'text-rose-700 font-semibold'
  }

  return (
    <section id="optimization-runs" className="runs-history-card">
      <div className="runs-card-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="runs-header-left">
          <div className="runs-icon-badge">
            <History className="w-4 h-4 text-sky-800" />
          </div>
          <div>
            <div className="runs-title-row">
              <h2 className="runs-title">Optimization Run History</h2>
              <span className="runs-counter-badge">{runs?.length ?? 0} runs</span>
            </div>
            <p className="runs-subtitle">
              Repeated algorithmic placements. Click any run to review past positions and compare response outcomes.
            </p>
          </div>
        </div>

        <div className="runs-header-right">
          {viewing && (
            <div className="runs-viewing-indicator">
              <span className="runs-viewing-tag">
                <Eye className="w-3.5 h-3.5" /> Viewing Run #{viewing.run_id} ({formatHour(viewing.target_hour)})
              </span>
              <button
                type="button"
                className="runs-back-live-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onBackToLive()
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Return to Live
              </button>
            </div>
          )}
          <ChevronDown className={`runs-toggle-chevron w-4 h-4 ${isOpen ? 'open' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="runs-card-body">
          {!runs || runs.length === 0 ? (
            <div className="runs-empty-state">
              <Sparkles className="w-6 h-6 text-stone-400 mb-2" />
              <p className="runs-empty-title">No optimization runs recorded yet</p>
              <p className="runs-empty-sub">
                Click <strong>Recalculate</strong> in the optimizer controls above to generate your first placement record.
              </p>
            </div>
          ) : (
            <div className="runs-table-wrap">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Date & Time</th>
                    <th>Demand Hour</th>
                    <th>Fleet Count</th>
                    <th>Avg Response Time</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => {
                    const succeeded = r.status === 'succeeded'
                    const isViewing = viewing?.run_id === r.run_id
                    const isLive = liveRunId === r.run_id && !viewing
                    const isLoading = loadingRunId === r.run_id

                    return (
                      <tr
                        key={r.run_id}
                        className={`run-row ${isViewing ? 'row-viewing' : ''} ${succeeded ? 'cursor-pointer' : 'row-failed'}`}
                        onClick={() => succeeded && !isLoading && onViewRun(r.run_id)}
                        tabIndex={succeeded ? 0 : undefined}
                        onKeyDown={(e) => {
                          if (succeeded && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault()
                            onViewRun(r.run_id)
                          }
                        }}
                        title={succeeded ? `Click to inspect Run #${r.run_id}` : r.error_message ?? 'Run failed'}
                      >
                        {/* Run ID */}
                        <td className="run-id-cell">
                          <div className="run-id-wrap">
                            <span className="run-id-badge">#{r.run_id}</span>
                            {isViewing && <span className="run-active-pill">Viewing</span>}
                            {isLive && <span className="run-live-pill">Live</span>}
                          </div>
                        </td>

                        {/* Date and Time */}
                        <td className="run-time-cell">
                          <div className="run-time-primary" title={formatIST(r.created_at)}>
                            {formatRelativeTime(r.created_at)}
                          </div>
                          <div className="run-time-sub">{formatIST(r.created_at)}</div>
                        </td>

                        {/* Demand Hour */}
                        <td className="run-hour-cell">
                          <div className="run-hour-badge">
                            <Clock className="w-3 h-3 text-stone-500" />
                            <span>{formatHour(r.target_hour)}</span>
                          </div>
                        </td>

                        {/* Fleet Count */}
                        <td className="run-fleet-cell">
                          <span className="font-semibold">{r.num_ambulances}</span>
                          <span className="text-stone-500 text-xs ml-1">units</span>
                        </td>

                        {/* Average Response Time */}
                        <td className="run-kpi-cell">
                          <span className={`run-resp-time ${getResponseTimeClass(r)}`}>
                            {getResponseTime(r)}
                          </span>
                        </td>

                        {/* Status */}
                        <td>
                          <div className="run-status-cell">
                            {succeeded ? (
                              <span className="run-status-badge status-success">
                                <span className="status-dot dot-available" />
                                <span>Succeeded</span>
                              </span>
                            ) : (
                              <span
                                className="run-status-badge status-failure"
                                title={r.error_message || 'Optimization failed'}
                              >
                                <span className="status-dot dot-unavailable" />
                                <span>Failed</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* View Results Action */}
                        <td className="text-right run-action-cell" onClick={(e) => e.stopPropagation()}>
                          {succeeded ? (
                            isViewing ? (
                              <button
                                type="button"
                                className="run-action-btn viewing-btn"
                                onClick={onBackToLive}
                                title="Exit past run view and return to live plan"
                              >
                                <RotateCcw className="w-3 h-3" /> Live Plan
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="run-action-btn view-btn"
                                onClick={() => onViewRun(r.run_id)}
                                disabled={isLoading}
                                aria-busy={isLoading}
                              >
                                {isLoading ? (
                                  'Loading…'
                                ) : (
                                  <>
                                    <span>View results</span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </>
                                )}
                              </button>
                            )
                          ) : (
                            <span className="run-failed-label" title={r.error_message || 'Optimization failed'}>
                              Failed
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

