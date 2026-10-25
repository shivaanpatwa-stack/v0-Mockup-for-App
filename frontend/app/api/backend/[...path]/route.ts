// Same-origin proxy to the FastAPI backend. The browser never holds credentials: they live in
// httpOnly cookies and are attached here as X-Hospital-Code / X-Admin-Key.
import { NextResponse, type NextRequest } from 'next/server'
import { CODE_COOKIE, KEY_COOKIE } from '@/lib/session'
import {
  BACKEND_URL,
  UNREACHABLE,
  backendHeaders,
  isSameOrigin,
  sessionCredentials,
  setSessionCookie,
} from '@/lib/server-backend'

type Context = { params: Promise<{ path: string[] }> }

// After a successful rotation the old value stops working at once, so the session cookie is updated
// in the same response: no later request (e.g. fleet polling) can go out with the dead value.
const ROTATIONS: Record<string, { field: 'code' | 'admin_key'; cookie: typeof CODE_COOKIE | typeof KEY_COOKIE }> = {
  'hospital/rotate-code': { field: 'code', cookie: CODE_COOKIE },
  'hospital/rotate-admin-key': { field: 'admin_key', cookie: KEY_COOKIE },
}

async function forward(req: NextRequest, ctx: Context): Promise<Response> {
  if (req.method !== 'GET' && !isSameOrigin(req)) {
    return NextResponse.json({ detail: 'Cross-origin request refused' }, { status: 403 })
  }
  const { path } = await ctx.params
  if (path.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    return NextResponse.json({ detail: 'Not found' }, { status: 404 })
  }
  const joined = path.join('/')
  const target = `${BACKEND_URL}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`

  // Only what the backend needs: never the browser's cookies or any credential headers it sent.
  const headers = backendHeaders(req, sessionCredentials(req))
  const contentType = req.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' ? undefined : await req.text(),
      cache: 'no-store',
      redirect: 'manual',
    })
  } catch {
    return NextResponse.json(UNREACHABLE, { status: 502 })
  }

  const body = await upstream.text()
  // Relay status, body, content type and Retry-After only; upstream cookies are never forwarded.
  const res = new NextResponse(body || null, { status: upstream.status })
  for (const name of ['content-type', 'retry-after']) {
    const value = upstream.headers.get(name)
    if (value) res.headers.set(name, value)
  }
  res.headers.set('Cache-Control', 'no-store')

  const rotation = ROTATIONS[joined]
  if (rotation && req.method === 'POST' && upstream.ok) {
    try {
      const value = JSON.parse(body)?.[rotation.field]
      if (typeof value === 'string' && value) setSessionCookie(res, rotation.cookie, value)
    } catch {
      // Unexpected body: leave the cookie; the next request will fail and sign the user out.
    }
  }
  return res
}

export const GET = forward
export const POST = forward
export const PATCH = forward
export const DELETE = forward
