import type { AmbulanceAssignment, OptimizeResult, RunDetail } from '@/lib/api'

/** The plan currently on the map: a live /optimize result, or a saved run loaded from history. */
export type Plan = OptimizeResult & {
  hour: number
  /** ISO time the plan was calculated. */
  calculatedAt: string
  /**
   * False for a plan rebuilt from a saved run: runs don't store the coverage check
   * (coverage_guaranteed / uncovered_wards), so the UI must not claim either way.
   */
  coverageKnown: boolean
}

/** A saved run in the shape of a live plan. Rows without a known position are dropped. */
export function planFromRun(run: RunDetail): Plan {
  const assignments: AmbulanceAssignment[] = run.assignments.flatMap((a) =>
    a.lat === null || a.lng === null
      ? []
      : [
          {
            ambulance_id: a.ambulance_id,
            type: a.type,
            candidate_id: a.candidate_id,
            name: a.name,
            ward_code: a.ward_code,
            weighted_score: a.weighted_score ?? 0,
            lat: a.lat,
            lng: a.lng,
          },
        ],
  )
  const details = run.details.flatMap((d) =>
    d.lat === null || d.lng === null
      ? []
      : [{ candidate_id: d.candidate_id, name: d.name, ward_code: d.ward_code, weighted_score: d.weighted_score, lat: d.lat, lng: d.lng }],
  )
  return {
    chosen_candidates: run.details.map((d) => d.candidate_id),
    total_weighted_score: run.total_weighted_score ?? 0,
    details,
    assignments,
    run_id: run.run_id,
    coverage_guaranteed: true,
    max_response_minutes: 20,
    uncoverable_wards: [],
    uncovered_wards: [],
    kpis: run.kpis,
    hour: run.target_hour,
    calculatedAt: run.created_at,
    coverageKnown: false,
  }
}

/** A fresh /optimize result as a plan. */
export function planFromResult(result: OptimizeResult, hour: number): Plan {
  return { ...result, hour, calculatedAt: new Date().toISOString(), coverageKnown: true }
}
