'use client'

import { useState, useMemo } from 'react'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  X,
  MapPin,
  Clock,
  Compass,
  Radio,
  Shield,
  Activity,
} from 'lucide-react'
import type { AmbulanceStatus, AssignmentStatus, FleetAmbulance, Hospital, OptimizeResult } from '@/lib/api'
import { getWardArea } from '@/lib/ward-names'

export type Run = OptimizeResult & { hour: number }

export type FleetRow = {
  id: string
  displayId: string
  zone: string
  wardArea?: string | null
  position: string
  fromBaseKm: number | null
  fromBaseText: string
  estimatedDriveMin: number | null
  type: string
  status: AmbulanceStatus | null
  assignmentStatus: AssignmentStatus | null
  lat: number | null
  lng: number | null
  candidateId?: string | null
}

const STATUS_LABEL: Record<AmbulanceStatus, string> = {
  available: 'Available',
  responding: 'Responding',
  at_hospital: 'At hospital',
  unavailable: 'Unavailable',
}

const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  planned: 'planned',
  en_route: 'en route',
  in_position: 'in position',
  cancelled: 'cancelled',
}

export function formatAmbulanceId(id: string): string {
  const match = id.match(/^([A-Za-z]+)[-_]?(\d+)$/)
  if (match) {
    const prefix = match[1].toUpperCase()
    const num = parseInt(match[2], 10)
    return `${prefix}-${num.toString().padStart(2, '0')}`
  }
  return id
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function buildFleetRows(
  fleet: FleetAmbulance[] | null,
  run: Run | null,
  hospital: Hospital | undefined
): FleetRow[] {
  const fromRun = new Map(run?.assignments.map((a) => [a.ambulance_id, a]))

  if (fleet) {
    return fleet.map((amb) => {
      const planned = fromRun.get(amb.call_sign)
      const current = amb.current_assignment
      const lat = planned?.lat ?? current?.lat ?? null
      const lng = planned?.lng ?? current?.lng ?? null

      let distKm: number | null = null
      if (hospital && lat != null && lng != null) {
        distKm = haversineKm(hospital.lat, hospital.lng, lat, lng)
      }

      const zone = planned?.ward_code ?? current?.ward_code ?? '—'
      const pos = planned?.name ?? planned?.candidate_id ?? current?.name ?? current?.candidate_id ?? '—'
      const estMin = distKm != null ? Math.max(2, Math.round(distKm * 2.7)) : null

      return {
        id: amb.call_sign,
        displayId: formatAmbulanceId(amb.call_sign),
        zone,
        wardArea: getWardArea(zone),
        position: pos,
        candidateId: planned?.candidate_id ?? current?.candidate_id ?? null,
        fromBaseKm: distKm,
        fromBaseText: distKm != null ? `${distKm.toFixed(1)} km` : '—',
        estimatedDriveMin: estMin,
        type: amb.type,
        status: amb.status,
        assignmentStatus:
          current && (!planned || planned.candidate_id === current.candidate_id) ? current.assignment_status : null,
        lat,
        lng,
      }
    })
  }

  if (run) {
    return run.assignments.map((a) => {
      let distKm: number | null = null
      if (hospital && a.lat != null && a.lng != null) {
        distKm = haversineKm(hospital.lat, hospital.lng, a.lat, a.lng)
      }
      const zone = a.ward_code ?? '—'
      const estMin = distKm != null ? Math.max(2, Math.round(distKm * 2.7)) : null

      return {
        id: a.ambulance_id,
        displayId: formatAmbulanceId(a.ambulance_id),
        zone,
        wardArea: getWardArea(zone),
        position: a.name ?? a.candidate_id,
        candidateId: a.candidate_id,
        fromBaseKm: distKm,
        fromBaseText: distKm != null ? `${distKm.toFixed(1)} km` : '—',
        estimatedDriveMin: estMin,
        type: a.type,
        status: null,
        assignmentStatus: null,
        lat: a.lat,
        lng: a.lng,
      }
    })
  }

  // Placeholder fallback
  return [
    {
      id: 'AMB-001',
      displayId: 'AMB-01',
      zone: 'K/W',
      wardArea: 'Andheri West, Juhu, Versova',
      position: 'Cooper Hospital Emergency Bay, Juhu',
      candidateId: 'CAND-01',
      fromBaseKm: 4.8,
      fromBaseText: '4.8 km',
      estimatedDriveMin: 13,
      type: 'ALS',
      status: 'available',
      assignmentStatus: null,
      lat: 19.1075,
      lng: 72.8363,
    },
    {
      id: 'AMB-002',
      displayId: 'AMB-02',
      zone: 'H/W',
      wardArea: 'Bandra West, Khar, Santacruz West',
      position: 'Bhabha Hospital Staging Area, Bandra West',
      candidateId: 'CAND-02',
      fromBaseKm: 2.3,
      fromBaseText: '2.3 km',
      estimatedDriveMin: 6,
      type: 'BLS',
      status: 'responding',
      assignmentStatus: null,
      lat: 19.0558,
      lng: 72.8327,
    },
    {
      id: 'AMB-003',
      displayId: 'AMB-03',
      zone: 'G/S',
      wardArea: 'Worli, Prabhadevi, Lower Parel',
      position: 'KEM Hospital Trauma Care Center, Parel',
      candidateId: 'CAND-03',
      fromBaseKm: 6.1,
      fromBaseText: '6.1 km',
      estimatedDriveMin: 16,
      type: 'ALS',
      status: 'at_hospital',
      assignmentStatus: null,
      lat: 19.0033,
      lng: 72.8427,
    },
    {
      id: 'AMB-004',
      displayId: 'AMB-04',
      zone: 'G/N',
      wardArea: 'Dadar, Mahim, Dharavi',
      position: 'Sion Hospital Critical Care Unit, Sion',
      candidateId: 'CAND-04',
      fromBaseKm: 5.4,
      fromBaseText: '5.4 km',
      estimatedDriveMin: 15,
      type: 'BLS',
      status: 'available',
      assignmentStatus: null,
      lat: 19.039,
      lng: 72.8619,
    },
    {
      id: 'AMB-005',
      displayId: 'AMB-05',
      zone: 'D',
      wardArea: 'Grant Road, Malabar Hill, Tardeo',
      position: 'Nair Hospital Emergency Complex, Mumbai Central',
      candidateId: 'CAND-05',
      fromBaseKm: 8.2,
      fromBaseText: '8.2 km',
      estimatedDriveMin: 22,
      type: 'ALS',
      status: 'unavailable',
      assignmentStatus: null,
      lat: 18.9712,
      lng: 72.8226,
    },
  ]
}

type SortField = 'id' | 'zone' | 'position' | 'distance' | 'type' | 'status'
type SortDirection = 'asc' | 'desc'

type FleetTableProps = {
  fleet: FleetAmbulance[] | null
  run: Run | null
  hospital: Hospital | undefined
  realRows: boolean
  onEditFleet?: () => void
  highlightedId?: string | null
  onHighlightId?: (id: string | null) => void
}

export default function FleetTable({
  fleet,
  run,
  hospital,
  realRows,
  onEditFleet,
  highlightedId,
  onHighlightId,
}: FleetTableProps) {
  const [sortField, setSortField] = useState<SortField>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedUnit, setSelectedUnit] = useState<FleetRow | null>(null)

  const rows = useMemo(() => buildFleetRows(fleet, run, hospital), [fleet, run, hospital])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedRows = useMemo(() => {
    const list = [...rows]
    const dir = sortDirection === 'asc' ? 1 : -1

    list.sort((a, b) => {
      if (sortField === 'id') {
        return a.displayId.localeCompare(b.displayId, undefined, { numeric: true }) * dir
      }
      if (sortField === 'zone') {
        return a.zone.localeCompare(b.zone) * dir
      }
      if (sortField === 'position') {
        return a.position.localeCompare(b.position) * dir
      }
      if (sortField === 'distance') {
        const distA = a.fromBaseKm ?? 9999
        const distB = b.fromBaseKm ?? 9999
        return (distA - distB) * dir
      }
      if (sortField === 'type') {
        return a.type.localeCompare(b.type) * dir
      }
      if (sortField === 'status') {
        const orderMap: Record<string, number> = {
          available: 1,
          responding: 2,
          at_hospital: 3,
          unavailable: 4,
        }
        const rankA = a.status ? orderMap[a.status] ?? 5 : 6
        const rankB = b.status ? orderMap[b.status] ?? 5 : 6
        return (rankA - rankB) * dir
      }
      return 0
    })
    return list
  }, [rows, sortField, sortDirection])

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-stone-400 opacity-60 ml-1 inline" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-sky-800 ml-1 inline" />
    ) : (
      <ArrowDown className="w-3 h-3 text-sky-800 ml-1 inline" />
    )
  }

  return (
    <section id="fleet" className="fleet-section">
      <div className="section-heading">
        <div>
          <h2>Ambulance fleet</h2>
        </div>
        <div className="section-actions">
          <span className="fleet-count-badge">
            {fleet ? `${fleet.length} units` : run ? `${run.assignments.length} units` : hospital ? `${hospital.fleet_size} units` : '—'}
          </span>
          {hospital && onEditFleet && (
            <button type="button" className="back-to-live" onClick={onEditFleet}>
              Edit fleet
            </button>
          )}
        </div>
      </div>

      <div className="table-wrap fleet-table-wrap">
        <table className="fleet-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('id')} className="cursor-pointer select-none">
                Ambulance ID {renderSortIndicator('id')}
              </th>
              <th onClick={() => handleSort('zone')} className="cursor-pointer select-none">
                {realRows ? 'Ward' : 'Current zone'} {renderSortIndicator('zone')}
              </th>
              <th onClick={() => handleSort('position')} className="cursor-pointer select-none th-position">
                Recommended position {renderSortIndicator('position')}
              </th>
              <th onClick={() => handleSort('distance')} className="cursor-pointer select-none">
                From base {renderSortIndicator('distance')}
              </th>
              <th onClick={() => handleSort('type')} className="cursor-pointer select-none">
                Type {renderSortIndicator('type')}
              </th>
              <th onClick={() => handleSort('status')} className="cursor-pointer select-none">
                Status {renderSortIndicator('status')}
              </th>
              <th className="th-actions text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const isHighlighted = highlightedId === row.id
              return (
                <tr
                  key={row.id}
                  className={`fleet-row ${isHighlighted ? 'fleet-row-highlighted' : ''}`}
                  onMouseEnter={() => onHighlightId?.(row.id)}
                  onMouseLeave={() => onHighlightId?.(null)}
                >
                {/* Ambulance ID */}
                <td className="fleet-id-cell">
                  <span className="fleet-id-badge">{row.displayId}</span>
                </td>

                {/* Ward */}
                <td>
                  <span
                    className="fleet-ward-badge"
                    title={row.wardArea ? `Ward ${row.zone} · ${row.wardArea}` : `Ward ${row.zone}`}
                  >
                    {row.zone.startsWith('Ward') ? row.zone : `Ward ${row.zone}`}
                  </span>
                </td>

                {/* Recommended Position */}
                <td className="fleet-position-cell" title={row.position}>
                  <div className="fleet-position-content">
                    <span className="fleet-position-name">{row.position}</span>
                    {row.wardArea && (
                      <span className="fleet-position-sub">{row.wardArea}</span>
                    )}
                  </div>
                </td>

                {/* From Base */}
                <td className="fleet-frombase-cell">
                  <div className="fleet-frombase-wrap">
                    <span className="fleet-distance-val">{row.fromBaseText}</span>
                    {row.estimatedDriveMin != null && (
                      <span className="fleet-travel-time">~{row.estimatedDriveMin} min drive</span>
                    )}
                  </div>
                </td>

                {/* Type */}
                <td>
                  <span className={`fleet-type-label type-${row.type.toLowerCase()}`}>
                    {row.type}
                  </span>
                </td>

                {/* Status with small dot */}
                <td>
                  <div className="fleet-status-wrap">
                    <span className={`status-dot dot-${(row.status || 'unknown').replace('_', '-')}`} />
                    <span className="status-text">
                      {row.status ? STATUS_LABEL[row.status] : '—'}
                    </span>
                    {row.assignmentStatus && (
                      <span className="fleet-assignment-chip">
                        {ASSIGNMENT_LABEL[row.assignmentStatus]}
                      </span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td className="text-right">
                  <button
                    type="button"
                    className="fleet-details-btn"
                    onClick={() => setSelectedUnit(row)}
                    title={`View details for ${row.displayId}`}
                  >
                    <Eye className="w-3.5 h-3.5" /> Details
                  </button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* Ambulance Detail Modal */}
      {selectedUnit && (
        <div
          className="fleet-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedUnit(null)}
        >
          <div
            className="fleet-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fleet-modal-header">
              <div className="fleet-modal-title-row">
                <div className="fleet-modal-title">
                  <span className="fleet-modal-callsign">{selectedUnit.displayId}</span>
                  <span className={`fleet-type-label type-${selectedUnit.type.toLowerCase()}`}>
                    {selectedUnit.type}
                  </span>
                  <div className="fleet-status-wrap">
                    <span className={`status-dot dot-${(selectedUnit.status || 'unknown').replace('_', '-')}`} />
                    <span className="status-text font-medium text-xs">
                      {selectedUnit.status ? STATUS_LABEL[selectedUnit.status] : 'Active'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="fleet-modal-close"
                  onClick={() => setSelectedUnit(null)}
                  aria-label="Close details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="fleet-modal-sub">
                Original Call Sign: <code>{selectedUnit.id}</code>
              </div>
            </div>

            <div className="fleet-modal-body">
              <div className="fleet-detail-grid">
                {/* Full Recommended Staging Location */}
                <div className="fleet-detail-item col-span-2">
                  <div className="fleet-detail-label">
                    <MapPin className="w-3.5 h-3.5 text-sky-800" /> Recommended Staging Location
                  </div>
                  <div className="fleet-detail-val text-base font-semibold text-stone-900 select-all">
                    {selectedUnit.position}
                  </div>
                  {selectedUnit.candidateId && (
                    <div className="fleet-detail-sub">Candidate ID: {selectedUnit.candidateId}</div>
                  )}
                </div>

                {/* Ward & Neighborhood */}
                <div className="fleet-detail-item">
                  <div className="fleet-detail-label">
                    <Compass className="w-3.5 h-3.5 text-stone-600" /> Operational Ward
                  </div>
                  <div className="fleet-detail-val font-semibold">
                    Ward {selectedUnit.zone}
                  </div>
                  {selectedUnit.wardArea && (
                    <div className="fleet-detail-sub">{selectedUnit.wardArea}</div>
                  )}
                </div>

                {/* Distance & Travel Time */}
                <div className="fleet-detail-item">
                  <div className="fleet-detail-label">
                    <Clock className="w-3.5 h-3.5 text-stone-600" /> From Base Hospital
                  </div>
                  <div className="fleet-detail-val font-semibold">
                    {selectedUnit.fromBaseText}
                  </div>
                  {selectedUnit.estimatedDriveMin != null && (
                    <div className="fleet-detail-sub">
                      Est. drive time: ~{selectedUnit.estimatedDriveMin} mins (traffic modeled)
                    </div>
                  )}
                </div>

                {/* Base Hospital */}
                <div className="fleet-detail-item">
                  <div className="fleet-detail-label">
                    <Activity className="w-3.5 h-3.5 text-stone-600" /> Base Facility
                  </div>
                  <div className="fleet-detail-val">
                    {hospital?.name || 'Base Hospital'}
                  </div>
                </div>

                {/* Coordinates */}
                <div className="fleet-detail-item">
                  <div className="fleet-detail-label">
                    <Radio className="w-3.5 h-3.5 text-stone-600" /> GPS Staging Coordinates
                  </div>
                  <div className="fleet-detail-val font-mono text-xs text-stone-700">
                    {selectedUnit.lat != null && selectedUnit.lng != null
                      ? `${selectedUnit.lat.toFixed(5)}, ${selectedUnit.lng.toFixed(5)}`
                      : 'Pending coordinates'}
                  </div>
                </div>

                {/* Vehicle Capability */}
                <div className="fleet-detail-item col-span-2">
                  <div className="fleet-detail-label">
                    <Shield className="w-3.5 h-3.5 text-sky-800" /> Vehicle Capability Spec
                  </div>
                  <div className="fleet-detail-val text-xs text-stone-700 leading-relaxed">
                    {selectedUnit.type === 'ALS'
                      ? 'Advanced Life Support (ALS) — Equipped with transport ventilator, multi-parameter defibrillator/monitor, intubation kit, advanced IV resuscitation medications, and senior emergency medical technician.'
                      : 'Basic Life Support (BLS) — Equipped with automated external defibrillator (AED), bag-valve-mask, medical oxygen supply, full patient immobilization splints, and primary emergency trauma kit.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="fleet-modal-footer">
              <button
                type="button"
                className="fleet-modal-dismiss-btn"
                onClick={() => setSelectedUnit(null)}
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

