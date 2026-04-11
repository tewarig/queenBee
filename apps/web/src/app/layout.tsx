import type { Metadata, Viewport } from 'next'
import '@xterm/xterm/css/xterm.css'

export const metadata: Metadata = {
  title: 'QueenBee',
  description: 'Manage multiple Claude Code instances',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, width: '100%', backgroundColor: '#0d0d0d' }}>{children}</body>
    </html>
  )
}
