import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Document Automation',
  description: 'Private document automation tools',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
