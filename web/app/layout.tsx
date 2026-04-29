import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RAG Builder — Document to Knowledge Base',
  description: 'Upload any document and transform it into a searchable vector knowledge base.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#07090f] text-slate-200 font-sans antialiased">
        <div className="bg-mesh" aria-hidden />
        <div className="bg-grid" aria-hidden />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  )
}
