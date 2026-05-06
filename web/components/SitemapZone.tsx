'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchWithAuth, UnauthorizedError } from '@/lib/client-auth'

interface DiscoverResult {
  sitemap: string | null
  method?: 'sitemap' | 'crawl'
  pathPrefix: string | null
  urls: string[]
  total: number
}

interface Props {
  onUrls: (urls: string[]) => void
  disabled?: boolean
}

export default function SitemapZone({ onUrls, disabled }: Props) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DiscoverResult | null>(null)
  const [pathFilter, setPathFilter] = useState('')

  async function discover() {
    if (disabled || busy) return
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Enter a website URL')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetchWithAuth('/api/sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Discovery failed' }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data: DiscoverResult = await res.json()
      setResult(data)
      setPathFilter(data.pathPrefix ?? '')
    } catch (err) {
      const msg = err instanceof UnauthorizedError ? 'Session expired' : err instanceof Error ? err.message : 'Network error'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  function addAll(filter?: string) {
    if (!result) return
    let urls = result.urls
    if (filter && filter.trim()) {
      const f = filter.trim()
      urls = urls.filter(u => {
        try { return new URL(u).pathname.includes(f) } catch { return false }
      })
    }
    if (urls.length === 0) {
      setError('No URLs match the filter')
      return
    }
    onUrls(urls)
    setResult(null)
    setValue('')
    setPathFilter('')
    setError(null)
  }

  const previewCount = result ? Math.min(result.urls.length, 8) : 0
  const filteredCount = result && pathFilter.trim()
    ? result.urls.filter(u => {
        try { return new URL(u).pathname.includes(pathFilter.trim()) } catch { return false }
      }).length
    : result?.urls.length ?? 0

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-6 bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <div>
            <p className="text-white font-medium">Discover via sitemap</p>
            <p className="text-xs text-slate-500">Enter a domain or section URL — bot finds all pages automatically</p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); discover() } }}
            placeholder="www.gov.pl/web/udsc  or  migracje.gov.pl"
            disabled={disabled || busy}
            className="flex-1 bg-black/40 border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-700 outline-none focus:border-violet-500/40 font-mono disabled:opacity-50"
          />
          <button
            onClick={discover}
            disabled={disabled || busy || !value.trim()}
            className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {busy ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"
                />
                Searching…
              </>
            ) : 'Discover'}
          </button>
        </div>

        <p className="text-xs text-slate-600 mt-2">
          Tries <span className="font-mono">/sitemap.xml</span>, <span className="font-mono">/robots.txt</span>, and sitemap index files.
          Falls back to crawling links on the page if no sitemap exists.
          Pass a path like <span className="font-mono">/web/udsc</span> to filter that section.
        </p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-sm text-red-400 text-center"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">
                  Found <span className="font-mono text-emerald-400">{result.total}</span> URL{result.total === 1 ? '' : 's'}
                  {result.method === 'crawl' && (
                    <span className="ml-2 text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      via link crawl
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 truncate" title={result.sitemap ?? 'page link extraction'}>
                  {result.method === 'crawl'
                    ? <>No sitemap available — extracted links directly from page (depth 1)</>
                    : <>via <span className="font-mono">{result.sitemap}</span></>}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Filter by path substring (optional)</label>
              <input
                value={pathFilter}
                onChange={e => setPathFilter(e.target.value)}
                placeholder="e.g. /web/udsc/karta-pobytu"
                className="w-full bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-700 outline-none focus:border-violet-500/40 font-mono"
              />
              <p className="text-xs text-slate-600 mt-1.5">
                {pathFilter.trim()
                  ? <>{filteredCount} of {result.total} URLs match</>
                  : <>All {result.total} URLs will be added</>}
              </p>
            </div>

            <div className="rounded-lg bg-black/30 border border-white/[0.04] p-3 max-h-48 overflow-y-auto">
              <p className="text-xs text-slate-500 mb-2">Preview (first {previewCount}):</p>
              <ul className="space-y-1">
                {result.urls.slice(0, 8).map(u => (
                  <li key={u} className="text-xs font-mono text-slate-400 truncate" title={u}>
                    {u}
                  </li>
                ))}
                {result.urls.length > 8 && (
                  <li className="text-xs font-mono text-slate-600">…{result.urls.length - 8} more</li>
                )}
              </ul>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setResult(null); setError(null) }}
                className="text-sm text-slate-500 hover:text-slate-300 px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => addAll(pathFilter)}
                disabled={filteredCount === 0}
                className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
              >
                Add {filteredCount} to queue
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
