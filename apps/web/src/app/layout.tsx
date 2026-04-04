import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'QueenBee',
  description: 'Manage multiple Claude Code instances',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
