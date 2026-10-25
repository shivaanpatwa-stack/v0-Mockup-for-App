// Page gate (Next.js 16 renamed middleware.ts to proxy.ts). Runs on the server before any page renders,
// so without a session the dashboard is never sent to the browser, not even for a moment.
import { NextResponse, type NextRequest } from 'next/server'
import { CODE_COOKIE, KEY_COOKIE } from '@/lib/session'

const PUBLIC_PAGES = new Set(['/start', '/register'])

export function proxy(req: NextRequest) {
  if (PUBLIC_PAGES.has(req.nextUrl.pathname)) return NextResponse.next()
  if (req.cookies.get(CODE_COOKIE)?.value && req.cookies.get(KEY_COOKIE)?.value) return NextResponse.next()
  return NextResponse.redirect(new URL('/start', req.url))
}

export const config = {
  // Every page except /api/*, Next's build output, and files with an extension (data, icons, images).
  matcher: ['/((?!api/|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
}
