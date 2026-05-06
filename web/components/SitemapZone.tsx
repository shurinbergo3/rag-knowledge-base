'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchWithAuth, UnauthorizedError } from '@/lib/client-auth'

interface DiscoverResult {
  sitemap: string | null
  method?: 'sitemap' | 'crawl'
  pagesFetched?: number
  pathPrefix: string | null
  include?: string[]
  exclude?: string[]
  urls: string[]
  total: number
  totalBeforeFilters?: number
}

interface Props {
  onUrls: (urls: string[]) => void
  disabled?: boolean
}

function parseKeywords(input: string): string[] {
  return input
    .split(/[,\n;]+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0)
}

export default function SitemapZone({ onUrls, disabled }: Props) {
  const [value, setValue] = useState('')
  const [includeRaw, setIncludeRaw] = useState('')
  const [excludeRaw, setExcludeRaw] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DiscoverResult | null>(null)

  // post-discovery refinement
  const [refineInclude, setRefineInclude] = useState('')
  const [refineExclude, setRefineExclude] = useState('')

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
        body: JSON.stringify({
          url: trimmed,
          include: parseKeywords(includeRaw),
          exclude: parseKeywords(excludeRaw),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Discovery failed' }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data: DiscoverResult = await res.json()
      setResult(data)
      setRefineInclude('')
      setRefineExclude('')
    } catch (err) {
      const msg = err instanceof UnauthorizedError ? 'Session expired' : err instanceof Error ? err.message : 'Network error'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  function applyRefinement(urls: string[]): string[] {
    const inc = parseKeywords(refineInclude)
    const exc = parseKeywords(refineExclude)
    return urls.filter(u => {
      const hay = u.toLowerCase()
      if (exc.length > 0 && exc.some(kw => hay.includes(kw))) return false
      if (inc.length > 0 && !inc.some(kw => hay.includes(kw))) return false
      return true
    })
  }

  function addAll() {
    if (!result) return
    const urls = applyRefinement(result.urls)
    if (urls.length === 0) {
      setError('No URLs match the refinement filters')
      return
    }
    onUrls(urls)
    setResult(null)
    setValue('')
    setRefineInclude('')
    setRefineExclude('')
    setIncludeRaw('')
    setExcludeRaw('')
    setError(null)
  }

  const refinedUrls = result ? applyRefinement(result.urls) : []
  const refinedCount = refinedUrls.length

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
            <p className="text-white font-medium">Crawl whole website</p>
            <p className="text-xs text-slate-500">Enter a domain or section URL — bot walks the site (depth 2) and lists all pages</p>
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

        {/* Topic/keyword filters BEFORE crawl */}
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className="mt-3 text-xs text-slate-500 hover:text-violet-400 flex items-center gap-1.5"
        >
          <svg className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Filter by topic / keywords (optional)
          {(includeRaw || excludeRaw) && (
            <span className="text-violet-400 text-[10px]">· active</span>
          )}
        </button>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Include keywords <span className="text-slate-600">(URL or link text must contain at least one)</span>
                  </label>
                  <input
                    value={includeRaw}
                    onChange={e => setIncludeRaw(e.target.value)}
                    placeholder="karta-pobytu, zezwolenie, wiza"
                    className="w-full bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-700 outline-none focus:border-violet-500/40 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Exclude keywords <span className="text-slate-600">(skip URLs/links containing any)</span>
                  </label>
                  <input
                    value={excludeRaw}
                    onChange={e => setExcludeRaw(e.target.value)}
                    placeholder="aktualnosci, news, kontakt, en/, ru/"
                    className="w-full bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-700 outline-none focus:border-violet-500/40 font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Filters apply during crawl — bot only follows/keeps links matching include and not matching exclude.
                  Comma-separated. Case-insensitive substring match.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-xs text-slate-600 mt-3">
          Tries <span className="font-mono">/sitemap.xml</span>, <span className="font-mono">/robots.txt</span>, then falls back to depth-2 link crawl.
          Pass a path like <span className="font-mono">/web/udsc</span> to constrain to that section.
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
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">
                  Found <span className="font-mono text-emerald-400">{result.total}</span> URL{result.total === 1 ? '' : 's'}
                  {result.totalBeforeFilters !== undefined && result.totalBeforeFilters !== result.total && (
                    <span className="ml-1 text-xs text-slate-500 font-mono">
                      (from {result.totalBeforeFilters} before topic filters)
                    </span>
                  )}
                  {result.method === 'crawl' && (
                    <span className="ml-2 text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      via link crawl
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 truncate" title={result.sitemap ?? 'page link extraction'}>
                  {result.method === 'crawl'
                    ? <>Crawled {result.pagesFetched ?? 0} pages (depth 2) — no public sitemap on this site</>
                    : <>via <span className="font-mono">{result.sitemap}</span></>}
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Refine: include keywords</label>
                <input
                  value={refineInclude}
                  onChange={e => setRefineInclude(e.target.value)}
                  placeholder="e.g. karta-pobytu"
                  className="w-full bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-700 outline-none focus:border-violet-500/40 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Refine: exclude keywords</label>
                <input
                  value={refineExclude}
                  onChange={e => setRefineExclude(e.target.value)}
                  placeholder="e.g. aktualnosci, news"
                  className="w-full bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-700 outline-none focus:border-violet-500/40 font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-600">
                {(refineInclude.trim() || refineExclude.trim())
                  ? <><span className="text-violet-400 font-mono">{refinedCount}</span> of {result.total} URLs match the refinement</>
                  : <>{result.total} URLs ready · refine above to narrow further</>}
              </p>
            </div>

            <div className="rounded-lg bg-black/30 border border-white/[0.04] p-3 max-h-48 overflow-y-auto">
              <p className="text-xs text-slate-500 mb-2">Preview (first {Math.min(refinedCount, 8)}):</p>
              <ul className="space-y-1">
                {refinedUrls.slice(0, 8).map(u => (
                  <li key={u} className="text-xs font-mono text-slate-400 truncate" title={u}>
                    {u}
                  </li>
                ))}
                {refinedUrls.length > 8 && (
                  <li className="text-xs font-mono text-slate-600">…{refinedUrls.length - 8} more</li>
                )}
                {refinedUrls.length === 0 && (
                  <li className="text-xs text-amber-400">Nothing matches the refinement filters.</li>
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
                onClick={addAll}
                disabled={refinedCount === 0}
                className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
              >
                Add {refinedCount} to queue
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
