import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'QueenBee',
  description: 'Manage multiple Claude Code instances',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#f5f5f5' }}>{children}</body>
    </html>
  )
}
