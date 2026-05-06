'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import UploadTab from '@/components/UploadTab'
import SearchTab from '@/components/SearchTab'
import AuthGate from '@/components/AuthGate'
import ProjectSelector from '@/components/ProjectSelector'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useProjects } from '@/lib/use-projects'

type Tab = 'upload' | 'search'

function HomeInner() {
  const [tab, setTab] = useState<Tab>('upload')
  const projectState = useProjects()

  return (
    <main className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] glass">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 opacity-80" />
              <div className="absolute inset-0 rounded-lg flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M2 8h8M2 12h10" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="13" cy="12" r="2.5" fill="#a78bfa" />
                </svg>
              </div>
            </div>
            <span className="font-semibold text-white tracking-tight">RAG Builder</span>
            <span className="hidden sm:inline text-xs font-mono text-slate-500 border border-white/[0.08] px-2 py-0.5 rounded-full">
              v1.0
            </span>
          </div>

          {/* Tab switcher */}
          <nav className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            {(['upload', 'search'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="relative px-4 py-1.5 text-sm font-medium rounded-lg transition-colors duration-200"
              >
                {tab === t && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute inset-0 rounded-lg bg-gradient-to-br from-violet-600/80 to-indigo-600/80"
                    style={{ boxShadow: '0 0 16px rgba(124,58,237,0.3)' }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className={`relative z-10 capitalize ${tab === t ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                  {t === 'upload' ? '⬆ Upload' : '🔍 Search'}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="max-w-5xl mx-auto px-6 pt-14 pb-8 w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Powered by OpenAI + Qdrant
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-4">
            Turn any document into a{' '}
            <span className="gradient-text">searchable knowledge base</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto leading-relaxed">
            Upload Excel, PDF, DOCX or TXT — we parse, embed, and store vectors in Qdrant automatically.
          </p>
        </motion.div>

        {/* ── Project selector ── */}
        <div className="max-w-2xl mx-auto mb-5">
          <ProjectSelector state={projectState} />
        </div>

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {tab === 'upload'
              ? <UploadTab project={projectState.active} />
              : <SearchTab project={projectState.active} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Footer ── */}
      <footer className="mt-auto py-8 border-t border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-xs text-slate-600">
          <span>RAG Builder</span>
          <span className="font-mono">OpenAI text-embedding-3-small · Qdrant</span>
        </div>
      </footer>
    </main>
  )
}

export default function Home() {
  return (
    <ErrorBoundary>
      <AuthGate>
        <HomeInner />
      </AuthGate>
    </ErrorBoundary>
  )
}
