// Server-only helpers for talking to the FastAPI backend from Route Handlers. Reads server-only env
// (no NEXT_PUBLIC_ prefix), so these values never reach the browser bundle.
import type { NextRequest, NextResponse } from 'next/server'
import { CODE_COOKIE, KEY_COOKIE } from './session'

export const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '')
const PROXY_SHARED_SECRET = process.env.PROXY_SHARED_SECRET ?? ''

const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60

/**
 * The visitor's IP as reported by the hosting platform: x-real-ip, else the first x-forwarded-for
 * entry, else "local". The backend only trusts it when X-Proxy-Secret matches its PROXY_SHARED_SECRET.
 */
export function clientIp(req: NextRequest): string {
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return first || 'local'
}

/** Headers every backend call carries; credentials are added by the caller. */
export function backendHeaders(req: NextRequest, credentials: { code?: string; key?: string } = {}): Headers {
  const headers = new Headers()
  if (credentials.code) headers.set('X-Hospital-Code', credentials.code)
  if (credentials.key) headers.set('X-Admin-Key', credentials.key)
  if (PROXY_SHARED_SECRET) headers.set('X-Proxy-Secret', PROXY_SHARED_SECRET)
  headers.set('X-Client-IP', clientIp(req))
  return headers
}

/** Only same-origin pages may change state, so another site can't make a signed-in browser act. */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (origin) {
    try {
      return new URL(origin).host === req.headers.get('host')
    } catch {
      return false
    }
  }
  return req.headers.get('sec-fetch-site') === 'same-origin'
}

export function sessionCredentials(req: NextRequest) {
  return { code: req.cookies.get(CODE_COOKIE)?.value, key: req.cookies.get(KEY_COOKIE)?.value }
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_S,
}

export function setSessionCookie(res: NextResponse, name: typeof CODE_COOKIE | typeof KEY_COOKIE, value: string) {
  res.cookies.set(name, value, cookieOptions)
}

export function clearSessionCookies(res: NextResponse) {
  for (const name of [CODE_COOKIE, KEY_COOKIE]) res.cookies.set(name, '', { ...cookieOptions, maxAge: 0 })
}

export const UNREACHABLE = { detail: "Can't reach the server." }
