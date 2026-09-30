import type { Metadata, Viewport } from 'next'
import { Atkinson_Hyperlegible, Barlow_Condensed } from 'next/font/google'
import { ServiceWorker } from '@/components/ServiceWorker'
import './globals.css'

const atkinson = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-atkinson' })
const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-barlow' })

export const metadata: Metadata = {
  title: 'myteam',
  description: 'Run rec soccer practices and games from your phone: check-in, lineups, fair substitutions, schedules and snacks.',
  appleWebApp: { capable: true, title: 'myteam', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#edf2ee' },
    { media: '(prefers-color-scheme: dark)', color: '#09130e' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${barlow.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
