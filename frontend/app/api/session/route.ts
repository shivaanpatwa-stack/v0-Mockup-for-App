// Sign in (POST) and sign out (DELETE). Credentials are checked against the backend and then kept
// only in httpOnly cookies, which page scripts can't read.
import { NextResponse, type NextRequest } from 'next/server'
import { KEY_COOKIE, CODE_COOKIE } from '@/lib/session'
import {
  BACKEND_URL,
  UNREACHABLE,
  backendHeaders,
  clearSessionCookies,
  isSameOrigin,
  setSessionCookie,
} from '@/lib/server-backend'

const PASS_THROUGH = new Set([401, 403, 429])

function relayError(upstream: Response, detail: string) {
  const res = NextResponse.json({ detail }, { status: upstream.status })
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) res.headers.set('Retry-After', retryAfter)
  return res
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ detail: 'Cross-origin request refused' }, { status: 403 })

  let body: { code?: unknown; admin_key?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request' }, { status: 400 })
  }
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const key = typeof body.admin_key === 'string' ? body.admin_key.trim() : ''
  if (!code || !key) return NextResponse.json({ detail: 'Invalid credentials' }, { status: 401 })

  let keys: Response
  let hospital: Response
  try {
    // An admin-only endpoint: succeeds only if code and key belong together.
    keys = await fetch(`${BACKEND_URL}/hospital/keys`, { headers: backendHeaders(req, { code, key }), cache: 'no-store' })
    if (!keys.ok) {
      return PASS_THROUGH.has(keys.status) ? relayError(keys, 'Invalid credentials') : NextResponse.json(UNREACHABLE, { status: 502 })
    }
    hospital = await fetch(`${BACKEND_URL}/hospital`, { headers: backendHeaders(req, { code }), cache: 'no-store' })
    if (!hospital.ok) return NextResponse.json(UNREACHABLE, { status: 502 })
  } catch {
    return NextResponse.json(UNREACHABLE, { status: 502 })
  }

  const { code: canonicalCode } = (await keys.json()) as { code: string }
  const { name } = (await hospital.json()) as { name: string }
  const res = NextResponse.json({ name })
  setSessionCookie(res, CODE_COOKIE, canonicalCode)
  setSessionCookie(res, KEY_COOKIE, key)
  return res
}

export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ detail: 'Cross-origin request refused' }, { status: 403 })
  const res = NextResponse.json({ ok: true })
  clearSessionCookies(res)
  return res
}
