'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { ArrowRight, Check, Minus, Pencil, Plus } from 'lucide-react'
import EditFleetDialog from '@/components/edit-fleet-dialog'
import { SortHeader, sortBy, type SortState } from '@/components/app/sort'
import { haversineKm, movesFor, useApp } from '@/lib/app-state'
import type { AmbulanceStatus } from '@/lib/api'
import { formatClock, hourLabel, plural } from '@/lib/format'
import { WARD_NAMES } from '@/lib/ward-names'
import { DEMAND_LABEL, demandLevel } from '@/lib/map-theme'
import { getBundledScoresForHour } from '@/lib/ward-risk-data'

const LiveMap = dynamic(() => import('@/components/app/live-map'), { ssr: false })

const STATUS: Record<AmbulanceStatus, string> = {
  available: 'Available',
  responding: 'Responding to a call',
  at_hospital: 'At hospital',
  unavailable: 'Out of service',
}
const ASSIGN: Record<string, string> = { planned: 'Not dispatched', en_route: 'On the way', in_position: 'In position', cancelled: 'Cancelled' }

type Key = 'call' | 'type' | 'status' | 'ward' | 'position' | 'km'

export default function StagingPlanPage() {
  const { plan, fleet, hospital, refreshHospital, refreshFleet } = useApp()
  const [hover, setHover] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [sort, setSort] = useState<SortState<Key>>({ key: 'call', dir: 1 })

  const moves = useMemo(() => (plan ? movesFor(plan.assignments, fleet, hospital) : []), [plan, fleet, hospital])
  const scores = plan ? getBundledScoresForHour(plan.hour) : {}
  const hovered = moves.find((m) => m.callSign === hover)

  const rows = useMemo(() => {
    if (!plan) return []
    const list = (fleet ?? []).map((u) => {
      const a = plan.assignments.find((p) => p.ambulance_id === u.call_sign)
      const live = u.current_assignment
      const at = a ?? (live?.lat != null && live.lng != null ? { lat: live.lat, lng: live.lng, name: live.name, ward_code: live.ward_code, candidate_id: live.candidate_id } : null)
      const effectiveAssignment =
        live?.assignment_status === 'in_position' && u.status !== 'available'
          ? 'en_route'
          : (live?.assignment_status ?? 'planned')
      return {
        call: u.call_sign,
        type: u.type,
        status: u.status,
        assignment: effectiveAssignment,
        ward: at?.ward_code ?? null,
        position: at ? at.name ?? at.candidate_id : null,
        km: at && hospital ? haversineKm(hospital, at) : null,
      }
    })
    return sortBy(list, sort, (r, k) => (k === 'call' ? r.call : k === 'type' ? r.type : k === 'status' ? r.status : k === 'ward' ? r.ward : k === 'position' ? r.position : r.km))
  }, [fleet, plan, hospital, sort])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Staging plan</h1>
          <p>
            {plan
              ? `Plan for ${hourLabel(plan.hour)}, calculated ${formatClock(plan.calculatedAt)}. ${plural(moves.length, 'unit')} placed.`
              : 'No plan yet. Recalculate staging on the live map.'}
          </p>
        </div>
        {hospital && (
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" /> Edit fleet
          </button>
        )}
      </div>

      <div className="page-cols">
        <section aria-labelledby="moves-h">
          <h2 id="moves-h" className="section-title" style={{ marginTop: 0 }}>Moves</h2>
          {!plan ? (
            <div className="empty"><strong>No plan yet</strong><span>Recalculate staging on the live map to get a position for each unit.</span></div>
          ) : (
            <ul className="moves-list table-wrap">
              {moves.map((m) => {
                const s = m.toWard ? scores[m.toWard] : undefined
                const fullArea = m.toWard ? WARD_NAMES[m.toWard] : undefined
                const primaryArea = fullArea ? fullArea.split(',')[0].trim() : ''

                return (
                  <li
                    key={m.callSign}
                    className={`move${hover === m.callSign ? ' is-hover' : ''}`}
                    onMouseEnter={() => setHover(m.callSign)}
                    onMouseLeave={() => setHover(null)}
                    tabIndex={0}
                    onFocus={() => setHover(m.callSign)}
                  >
                    <div className="move-head">
                      <div className="move-unit-info">
                        <span className="move-id">Unit {m.callSign}</span>
                        <span className="move-type">{m.type}</span>
                      </div>
                      {(() => {
                        const unit = fleet?.find((u) => u.call_sign === m.callSign)
                        const isOffPosition = unit?.status && unit.status !== 'available'
                        const displayStatus = isOffPosition && m.status === 'in_position' ? 'en_route' : m.status

                        if (!displayStatus && !unit?.status) return null

                        return (
                          <span
                            className={`status ${
                              unit?.status === 'responding'
                                ? 'status-responding'
                                : unit?.status === 'at_hospital'
                                  ? 'status-hospital'
                                  : displayStatus === 'in_position'
                                    ? 'status-available'
                                    : ''
                            }`}
                          >
                            {unit?.status === 'responding' ? (
                              <>
                                <span className="dot" aria-hidden="true" />
                                Responding
                              </>
                            ) : unit?.status === 'at_hospital' ? (
                              <>
                                <span className="dot" aria-hidden="true" />
                                At hospital
                              </>
                            ) : unit?.status === 'unavailable' ? (
                              <>
                                <span className="dot" aria-hidden="true" />
                                Out of service
                              </>
                            ) : displayStatus === 'in_position' ? (
                              <>
                                <Check size={11} aria-hidden="true" />
                                In position
                              </>
                            ) : (
                              <>
                                <span className="dot" aria-hidden="true" />
                                {ASSIGN[displayStatus ?? 'en_route'] ?? displayStatus}
                              </>
                            )}
                          </span>
                        )
                      })()}
                    </div>

                    <div className="move-dest-row">
                      <span className="move-dest-name" title={m.fromLabel ? `${m.fromLabel} → ${m.toLabel}` : m.toLabel}>
                        {m.toLabel}
                        {m.fromLabel && m.fromLabel !== 'Hospital base' && (
                          <span className="move-from-sub"> (from {m.fromLabel})</span>
                        )}
                      </span>
                      {m.km != null && <span className="move-dest-dist">{m.km.toFixed(1)} km</span>}
                    </div>

                    {m.toWard && (
                      <div className="move-meta-row">
                        <span className="move-ward" title={fullArea ? `Ward ${m.toWard} (${fullArea})` : `Ward ${m.toWard}`}>
                          Ward {m.toWard}{primaryArea ? ` · ${primaryArea}` : ''}
                        </span>
                        {s !== undefined && (
                          <span
                            className={`move-demand level-${demandLevel(s)}`}
                            title={`Demand score: ${s.toFixed(2)} at ${hourLabel(plan.hour)}`}
                          >
                            {DEMAND_LABEL[demandLevel(s)]} demand (score {s.toFixed(2)})
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {plan?.kpis && (
            <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Whole plan: average response {plan.kpis.avg_response_min.before?.toFixed(1)} to {plan.kpis.avg_response_min.after?.toFixed(1)} min compared with every unit waiting at the hospital.
            </p>
          )}
        </section>
        <aside aria-label="Move preview">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 className="section-title" style={{ margin: 0 }}>{hovered ? `Preview: ${hovered.callSign}` : 'Preview'}</h2>
            <button
              type="button"
              className="btn btn-icon btn-sm"
              title={maximized ? 'Minimize preview (-)' : 'Maximize preview (+)'}
              aria-label={maximized ? 'Minimize preview' : 'Maximize preview'}
              onClick={() => setMaximized(!maximized)}
              style={{ width: 28, height: 28 }}
            >
              {maximized ? <Minus size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
            </button>
          </div>
          <div className="mini-map" style={{ height: maximized ? 520 : 320, transition: 'height 0.2s ease-out' }}>
            <LiveMap
              mini
              hour={plan?.hour ?? 0}
              hospital={hospital}
              units={plan?.assignments ?? []}
              ghosts={hovered?.from && (hovered.km ?? 0) > 0.05 ? [{ callSign: hovered.callSign, from: hovered.from, to: hovered.to }] : []}
              hotUnit={hover}
              onHoverUnit={setHover}
              layers={{ demand: true, reach: false, units: true }}
            />
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Hover or focus a move to see it on the map.</p>
        </aside>
      </div>

      <h2 className="section-title">Units</h2>
      {fleet && fleet.length === 0 ? (
        <div className="empty"><strong>No units stationed here</strong><span>Use Edit fleet to add the first ambulance.</span></div>
      ) : !plan ? (
        <div className="empty">
          <strong>No active staging plan</strong>
          <span>All {plural(fleet?.length ?? 0, 'unit')} are currently on stand by at hospital base. Recalculate staging on the live map to deploy your units.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Units, their status and planned position</caption>
            <thead>
              <tr>
                <SortHeader label="Call sign" k="call" sort={sort} onSort={setSort} />
                <SortHeader label="Type" k="type" sort={sort} onSort={setSort} />
                <SortHeader label="Status" k="status" sort={sort} onSort={setSort} />
                <SortHeader label="Ward" k="ward" sort={sort} onSort={setSort} />
                <SortHeader label="Position" k="position" sort={sort} onSort={setSort} />
                <SortHeader label="From base" k="km" sort={sort} onSort={setSort} numeric />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.call}>
                  <td className="mono">{r.call}</td>
                  <td>{r.type}</td>
                  <td>
                    <span
                      className={`status ${
                        r.status === 'responding'
                          ? 'status-responding'
                          : r.status === 'at_hospital'
                            ? 'status-hospital'
                            : r.status === 'unavailable'
                              ? 'status-warning'
                              : 'status-available'
                      }`}
                    >
                      <span className="dot" aria-hidden="true" />
                      {STATUS[r.status]}
                      {r.status === 'available' && r.assignment ? ` · ${ASSIGN[r.assignment]}` : ''}
                    </span>
                  </td>
                  <td className="mono">{r.ward ?? '–'}</td>
                  <td>{r.position ?? <span className="muted">At base</span>}</td>
                  <td className="num-cell">{r.km != null ? `${r.km.toFixed(1)} km` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {plan && (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>From base is the straight-line distance. Response times use the planner&apos;s travel-time model.</p>
      )}
      {hospital && (
        <EditFleetDialog
          hospital={hospital}
          open={editing}
          onClose={() => setEditing(false)}
          onChanged={async () => {
            await refreshHospital()
            await refreshFleet()
          }}
        />
      )}
    </div>
  )
}
