import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { APP_NAME } from '@/lib/config'
import './globals.css'

// Archivo (semi-condensed width axis) for headings and numbers, IBM Plex for UI and data.
// next/font self-hosts them with size-adjusted fallbacks, so text doesn't shift when they load.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' })
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex', display: 'swap' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-mono', display: 'swap' })

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Predicts ambulance demand by Mumbai ward and hour, and recommends where to stage each unit.',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: '#111413',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${plex.variable} ${plexMono.variable}`}>
      <body>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
