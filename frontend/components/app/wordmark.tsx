import Link from 'next/link'
import { APP_NAME } from '@/lib/config'

/** The Standby logo (public/standby.svg) and product name. */
export default function Wordmark({ href = '/app' }: { href?: string }) {
  return (
    <Link href={href} className="wordmark" aria-label={`${APP_NAME} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, no optimisation needed */}
      <img src="/standby.svg" alt="" width={24} height={24} className="wordmark-logo" />
      {APP_NAME}
    </Link>
  )
}
