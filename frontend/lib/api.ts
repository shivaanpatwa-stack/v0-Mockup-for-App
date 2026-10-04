export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export type OptimizedPosition = {
  candidate_id: string
  name: string | null
  ward_code: string | null
  weighted_score: number
  lat: number
  lng: number
}

export type OptimizeResult = {
  chosen_candidates: string[]
  total_weighted_score: number
  details: OptimizedPosition[]
}

export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
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
  return `${fallback} (HTTP ${res.status}).`
}
