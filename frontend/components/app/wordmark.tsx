import Link from 'next/link'
import { Plus } from 'lucide-react'
import { APP_NAME } from '@/lib/config'

/** Product name (placeholder in lib/config.ts) with the first-aid cross mark. */
export default function Wordmark({ href = '/app' }: { href?: string }) {
  return (
    <Link href={href} className="wordmark" aria-label={`${APP_NAME} home`}>
      <span className="wordmark-mark" aria-hidden="true">
        <Plus strokeWidth={3} />
      </span>
      {APP_NAME}
    </Link>
  )
}
