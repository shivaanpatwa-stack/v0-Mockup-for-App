// Page gate (Next.js 16 renamed middleware.ts to proxy.ts). Runs on the server before any page renders,
// so without a session the app is never sent to the browser, not even for a moment.
import { NextResponse, type NextRequest } from 'next/server'
import { CODE_COOKIE, KEY_COOKIE } from '@/lib/session'

/** The landing page and the sign-in pages are public. Everything else (the app at /app) needs a session. */
const PUBLIC_PAGES = new Set(['/', '/start', '/register'])

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const signedIn = Boolean(req.cookies.get(CODE_COOKIE)?.value && req.cookies.get(KEY_COOKIE)?.value)
  // Signed in already: /start goes straight to the live map.
  if (path === '/start' && signedIn) return NextResponse.redirect(new URL('/app', req.url))
  if (PUBLIC_PAGES.has(path) || signedIn) return NextResponse.next()
  return NextResponse.redirect(new URL('/start', req.url))
}

export const config = {
  // Every page except /api/*, Next's build output, and files with an extension (data, icons, images).
  matcher: ['/((?!api/|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
}
