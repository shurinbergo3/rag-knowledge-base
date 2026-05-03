'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SearchResult } from '@/lib/types'
import { fetchWithAuth, UnauthorizedError } from '@/lib/client-auth'

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color =
    pct >= 80 ? '#4ade80' :
    pct >= 60 ? '#a78bfa' :
    pct >= 40 ? '#60a5fa' : '#94a3b8'

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="relative w-6 h-6">
        <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
          <circle
            cx="12" cy="12" r="9" fill="none"
            stroke={color} strokeWidth="2"
            strokeDasharray={`${56.5 * score} 56.5`}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="text-xs font-mono font-semibold" style={{ color }}>
        {pct}%
      </span>
    </div>
  )
}

function SourceTag({ result }: { result: SearchResult }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-mono text-slate-500 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
        {result.source}
      </span>
      {result.sheet && (
        <span className="text-[10px] font-mono text-emerald-500/70 bg-emerald-500/10 border border-emerald-500/15 px-1.5 py-0.5 rounded-full">
          {result.sheet}
        </span>
      )}
      {result.page !== undefined && (
        <span className="text-[10px] font-mono text-blue-400/70 bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 rounded-full">
          page {result.page}
        </span>
      )}
      {result.row !== undefined && (
        <span className="text-[10px] font-mono text-slate-500 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded-full">
          row {result.row}
        </span>
      )}
    </div>
  )
}

interface Props {
  project: string | null
}

export default function SearchTab({ project }: Props) {
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const q = query.trim()
    if (!q) return
    if (!project) {
      setError('Select a project first.')
      return
    }

    setLoading(true)
    setError('')
    setResults([])

    try {
      const res = await fetchWithAuth(
        `/api/search?q=${encodeURIComponent(q)}&top=${topK}&project=${encodeURIComponent(project)}`,
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Search failed' }))
        throw new Error(err.error || 'Search failed')
      }
      const data = await res.json()
      setResults(data.results ?? [])
      setSearched(true)
    } catch (err) {
      const msg = err instanceof UnauthorizedError
        ? 'Session expired. Please re-enter the secret.'
        : err instanceof Error ? err.message : 'Search failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const suggestions = [
    'How much does it cost?',
    'What is the warranty?',
    'Technical specifications',
    'Contact information',
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Search input */}
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="glass-violet rounded-2xl p-1.5 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-3 px-4">
            <svg className={`w-4 h-4 flex-shrink-0 transition-colors ${loading ? 'text-violet-400 animate-pulse' : 'text-slate-500'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search your knowledge base..."
              className="flex-1 bg-transparent py-3 text-sm text-white placeholder:text-slate-600 outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setResults([]); setSearched(false) }}
                className="text-slate-600 hover:text-slate-400 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Top-K selector */}
          <div className="flex items-center gap-1 border-l border-white/[0.06] pl-3 pr-2">
            <span className="text-xs text-slate-600 font-mono">top</span>
            <select
              value={topK}
              onChange={e => setTopK(Number(e.target.value))}
              className="bg-transparent text-sm font-mono text-slate-400 outline-none cursor-pointer"
            >
              {[3, 5, 8, 10].map(n => (
                <option key={n} value={n} className="bg-[#131720]">{n}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={!query.trim() || loading || !project}
            className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex-shrink-0"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : 'Search'}
          </button>
        </div>

        {/* Suggestion pills */}
        <AnimatePresence>
          {!searched && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-wrap gap-2"
            >
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setQuery(s); setTimeout(() => handleSearch(), 50) }}
                  className="text-xs text-slate-500 hover:text-violet-300 border border-white/[0.06] hover:border-violet-500/30 bg-white/[0.02] hover:bg-violet-500/10 px-3 py-1.5 rounded-full transition-all duration-200"
                >
                  {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading skeleton */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl p-5 space-y-3 animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="h-3 w-16 bg-white/[0.06] rounded-full" />
                  <div className="h-3 w-12 bg-white/[0.06] rounded-full" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-white/[0.06] rounded-full" />
                  <div className="h-3 bg-white/[0.06] rounded-full w-3/4" />
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {!loading && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            <p className="text-xs text-slate-600 font-mono px-1">
              {results.length} results for &ldquo;{query}&rdquo;
            </p>
            {results.map((result, i) => (
              <motion.div
                key={result.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
                className="glass rounded-2xl p-5 hover:border-violet-500/15 transition-all duration-200 space-y-3 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <SourceTag result={result} />
                  <ScoreBadge score={result.score} />
                </div>
                <p className="text-sm text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                  {result.text.length > 400 ? result.text.slice(0, 400) + '…' : result.text}
                </p>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* No results */}
      <AnimatePresence>
        {!loading && searched && results.length === 0 && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 text-slate-600"
          >
            <svg className="w-8 h-8 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <p className="text-sm">No results found. Try a different query.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!searched && !loading && (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-400">Search your knowledge base</p>
          <p className="text-xs text-slate-600">
            Upload a document first, then search in natural language.
          </p>
        </div>
      )}
    </div>
  )
}
