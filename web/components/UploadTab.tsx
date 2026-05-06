'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import UploadZone from './UploadZone'
import UrlZone from './UrlZone'
import SitemapZone from './SitemapZone'
import type { UploadProgress, Chunk } from '@/lib/types'
import { fetchWithAuth, UnauthorizedError } from '@/lib/client-auth'

type Mode = 'files' | 'urls' | 'sitemap'

type ItemStatus = 'pending' | 'parse' | 'filter' | 'embed' | 'upload' | 'review' | 'committing' | 'done' | 'error'

interface QueueItem {
  id: string
  kind: 'file' | 'url'
  name: string
  payload: File | string
  status: ItemStatus
  chunkCount?: number
  error?: string
  title?: string
  samples?: Chunk[]
  dropped?: number
  scanned?: number
  filterScanned?: number
  filterTotal?: number
}

const LOW_CHUNK_THRESHOLD = 3
const LOW_TEXT_THRESHOLD = 400

interface Props {
  project: string | null
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: 'Queued',
  parse: 'Parsing…',
  filter: 'Filtering noise…',
  embed: 'Embedding…',
  upload: 'Storing…',
  review: 'Ready to review',
  committing: 'Saving…',
  done: 'Done',
  error: 'Error',
}

let nextId = 0
const newId = () => `q_${++nextId}`

function shortenUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.length > 30 ? u.pathname.slice(0, 27) + '…' : u.pathname
    return `${u.host}${path === '/' ? '' : path}`
  } catch {
    return url
  }
}

export default function UploadTab({ project }: Props) {
  const [mode, setMode] = useState<Mode>('files')
  const [reviewMode, setReviewMode] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [running, setRunning] = useState(false)
  const [globalError, setGlobalError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const runningRef = useRef(false)
  const queueRef = useRef<QueueItem[]>([])

  useEffect(() => { queueRef.current = queue }, [queue])

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue(prev => {
      const next = prev.map(it => (it.id === id ? { ...it, ...patch } : it))
      queueRef.current = next
      return next
    })
  }, [])

  const handleFiles = useCallback((files: File[]) => {
    setGlobalError('')
    setQueue(prev => [
      ...prev,
      ...files.map<QueueItem>(f => ({
        id: newId(), kind: 'file', name: f.name, payload: f, status: 'pending',
      })),
    ])
  }, [])

  const handleUrls = useCallback((urls: string[]) => {
    setGlobalError('')
    setQueue(prev => [
      ...prev,
      ...urls.map<QueueItem>(u => ({
        id: newId(), kind: 'url', name: shortenUrl(u), payload: u, status: 'pending',
      })),
    ])
  }, [])

  const removeItem = useCallback((id: string) => {
    setQueue(prev => prev.filter(it => it.id !== id))
    setExpandedId(prev => (prev === id ? null : prev))
  }, [])

  const clearFinished = useCallback(() => {
    setQueue(prev => prev.filter(it => it.status !== 'done' && it.status !== 'error'))
  }, [])

  const dropChunk = useCallback((itemId: string, chunkIdx: number) => {
    setQueue(prev => {
      const next = prev.map(it => {
        if (it.id !== itemId || !it.samples) return it
        const samples = it.samples.filter((_, i) => i !== chunkIdx)
        return { ...it, samples, chunkCount: samples.length }
      })
      queueRef.current = next
      return next
    })
  }, [])

  async function processItem(item: QueueItem) {
    if (!project) {
      updateItem(item.id, { status: 'error', error: 'No project selected' })
      return
    }

    updateItem(item.id, { status: 'parse', error: undefined })

    let response: Response
    try {
      if (item.kind === 'file') {
        const formData = new FormData()
        formData.append('file', item.payload as File)
        formData.append('project', project)
        if (reviewMode) formData.append('dryRun', 'true')
        response = await fetchWithAuth('/api/upload', { method: 'POST', body: formData })
      } else {
        response = await fetchWithAuth('/api/ingest-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.payload as string, project, dryRun: reviewMode }),
        })
      }
    } catch (err) {
      const msg = err instanceof UnauthorizedError ? 'Session expired' : err instanceof Error ? err.message : 'Network error'
      updateItem(item.id, { status: 'error', error: msg })
      return
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Request failed' }))
      updateItem(item.id, { status: 'error', error: body.error || `HTTP ${response.status}` })
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events) {
        if (!event.startsWith('data: ')) continue
        try {
          const data: UploadProgress = JSON.parse(event.slice(6))
          if (data.step === 'review') {
            updateItem(item.id, {
              status: 'review',
              chunkCount: data.chunkCount,
              title: data.message,
              samples: data.chunks,
              dropped: data.dropped,
              scanned: data.scanned,
            })
          } else if (data.step === 'complete') {
            updateItem(item.id, {
              status: 'done',
              chunkCount: data.chunkCount,
              title: data.message,
              samples: data.chunks,
              dropped: data.dropped,
              scanned: data.scanned,
            })
          } else if (data.step === 'error') {
            updateItem(item.id, { status: 'error', error: data.message ?? 'Failed' })
          } else if (data.status === 'running') {
            const stepMap: Record<string, ItemStatus> = {
              parse: 'parse', filter: 'filter', embed: 'embed', upload: 'upload',
            }
            const next = stepMap[data.step]
            if (next) {
              const patch: Partial<QueueItem> = {
                status: next,
                chunkCount: data.chunkCount ?? undefined,
              }
              if (data.step === 'parse' && data.message) patch.title = data.message
              if (data.step === 'filter') {
                patch.filterScanned = data.scanned
                patch.filterTotal = data.chunkCount
              }
              updateItem(item.id, patch)
            }
          } else if (data.status === 'done' && data.step === 'filter') {
            updateItem(item.id, {
              chunkCount: data.chunkCount,
              dropped: data.dropped,
              scanned: data.scanned,
            })
          } else if (data.status === 'done' && data.chunkCount !== undefined) {
            updateItem(item.id, { chunkCount: data.chunkCount })
          }
        } catch { /* partial JSON */ }
      }
    }
  }

  async function processQueue() {
    if (runningRef.current) return
    if (!project) {
      setGlobalError('Select or create a project first.')
      return
    }
    runningRef.current = true
    setRunning(true)
    setGlobalError('')

    try {
      while (true) {
        const next = queueRef.current.find(it => it.status === 'pending')
        if (!next) break
        await processItem(next)
      }
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }

  async function commitItem(itemId: string) {
    if (!project) {
      setGlobalError('Select or create a project first.')
      return
    }
    const item = queueRef.current.find(it => it.id === itemId)
    if (!item || !item.samples || item.samples.length === 0) return

    updateItem(itemId, { status: 'committing', error: undefined })
    try {
      const res = await fetchWithAuth('/api/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, chunks: item.samples }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Commit failed' }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      updateItem(itemId, { status: 'done', chunkCount: data.chunkCount })
    } catch (err) {
      const msg = err instanceof UnauthorizedError ? 'Session expired' : err instanceof Error ? err.message : 'Save failed'
      updateItem(itemId, { status: 'review', error: msg })
    }
  }

  async function commitAllReviewed() {
    const reviewed = queueRef.current.filter(it => it.status === 'review')
    for (const it of reviewed) {
      // sequentially to avoid concurrent embed surges
      await commitItem(it.id)
    }
  }

  const pending = queue.filter(it => it.status === 'pending').length
  const inFlight = queue.filter(it => ['parse', 'filter', 'embed', 'upload', 'committing'].includes(it.status)).length
  const reviewing = queue.filter(it => it.status === 'review').length
  const done = queue.filter(it => it.status === 'done').length
  const errors = queue.filter(it => it.status === 'error').length
  const totalDoneChunks = queue.reduce((sum, it) => sum + (it.status === 'done' ? (it.chunkCount ?? 0) : 0), 0)
  const totalReviewChunks = queue.reduce((sum, it) => sum + (it.status === 'review' ? (it.chunkCount ?? 0) : 0), 0)

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Mode switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-full max-w-md mx-auto">
        {([
          { id: 'files', label: 'Files', icon: '📄' },
          { id: 'urls', label: 'Websites', icon: '🌐' },
          { id: 'sitemap', label: 'Sitemap', icon: '🗺️' },
        ] as { id: Mode; label: string; icon: string }[]).map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`relative flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
              mode === m.id ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {mode === m.id && (
              <motion.div
                layoutId="upload-mode-indicator"
                className="absolute inset-0 rounded-lg bg-gradient-to-br from-violet-600/80 to-indigo-600/80"
                style={{ boxShadow: '0 0 12px rgba(124,58,237,0.3)' }}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10">{m.icon} {m.label}</span>
          </button>
        ))}
      </div>

      {mode === 'files' && <UploadZone onFiles={handleFiles} disabled={running} />}
      {mode === 'urls' && <UrlZone onUrls={handleUrls} disabled={running} />}
      {mode === 'sitemap' && <SitemapZone onUrls={handleUrls} disabled={running} />}

      {/* Review-mode toggle */}
      <div className="flex items-center justify-center">
        <label className="flex items-center gap-2.5 cursor-pointer select-none group">
          <button
            type="button"
            role="switch"
            aria-checked={reviewMode}
            onClick={() => !running && setReviewMode(v => !v)}
            disabled={running}
            className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${
              reviewMode ? 'bg-violet-600' : 'bg-white/[0.08]'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                reviewMode ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span
            className={`text-sm transition-colors ${reviewMode ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}
            onClick={() => !running && setReviewMode(v => !v)}
          >
            🔍 Review chunks before saving to base
          </span>
        </label>
      </div>

      {/* Queue list */}
      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">
                <span className="font-medium text-white">{queue.length}</span> in queue
                {reviewing > 0 && <span className="text-violet-400"> · {reviewing} to review</span>}
                {done > 0 && <span className="text-emerald-400"> · {done} saved</span>}
                {errors > 0 && <span className="text-red-400"> · {errors} failed</span>}
                {totalDoneChunks > 0 && <span className="text-slate-500 font-mono"> · {totalDoneChunks} chunks in base</span>}
              </p>
              {(done > 0 || errors > 0) && !running && (
                <button onClick={clearFinished} className="text-xs text-slate-500 hover:text-violet-400">
                  Clear finished
                </button>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-black/20 divide-y divide-white/[0.04] overflow-hidden">
              <AnimatePresence initial={false}>
                {queue.map(item => (
                  <QueueItemRow
                    key={item.id}
                    item={item}
                    expanded={expandedId === item.id}
                    onToggleExpand={() => setExpandedId(prev => prev === item.id ? null : item.id)}
                    onRemove={() => removeItem(item.id)}
                    onDropChunk={(idx) => dropChunk(item.id, idx)}
                    onCommit={() => commitItem(item.id)}
                    runningGlobal={running}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* CTA: Process pending */}
            {pending > 0 && !running && (
              <div className="flex justify-center">
                <button
                  onClick={processQueue}
                  disabled={!project}
                  className="btn-primary px-8 py-3 rounded-xl font-semibold text-white text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                  </svg>
                  {project
                    ? reviewMode
                      ? `Extract ${pending} item${pending === 1 ? '' : 's'} for review`
                      : `Process ${pending} item${pending === 1 ? '' : 's'} into "${project}"`
                    : 'Select a project first'}
                </button>
              </div>
            )}

            {running && (
              <div className="text-center text-sm text-slate-500">
                Working… {inFlight > 0 ? `${inFlight} active, ` : ''}{pending} pending
              </div>
            )}

            {/* CTA: commit all reviewed */}
            {reviewing > 1 && !running && (
              <div className="flex justify-center">
                <button
                  onClick={commitAllReviewed}
                  className="btn-primary px-8 py-3 rounded-xl font-semibold text-white text-sm flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Save all {reviewing} reviewed ({totalReviewChunks} chunks) to "{project}"
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {globalError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {globalError}
        </div>
      )}

      {done > 0 && !running && pending === 0 && inFlight === 0 && reviewing === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-300">Knowledge base updated</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {done} source{done === 1 ? '' : 's'} saved · {totalDoneChunks} chunks stored. Switch to Search to test.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

interface RowProps {
  item: QueueItem
  expanded: boolean
  onToggleExpand: () => void
  onRemove: () => void
  onDropChunk: (idx: number) => void
  onCommit: () => void
  runningGlobal: boolean
}

function QueueItemRow({ item, expanded, onToggleExpand, onRemove, onDropChunk, onCommit, runningGlobal }: RowProps) {
  const totalSampleChars = (item.samples ?? []).reduce((s, c) => s + c.text.length, 0)
  const isLowContent = (item.status === 'done' || item.status === 'review') && (
    (item.chunkCount ?? 0) < LOW_CHUNK_THRESHOLD ||
    (!!item.samples && item.samples.length > 0 && totalSampleChars < LOW_TEXT_THRESHOLD)
  )
  const isReview = item.status === 'review'
  const canExpand = (item.status === 'done' || isReview) && item.samples && item.samples.length > 0
  const samples = item.samples ?? []
  const showAllChunks = isReview

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={`overflow-hidden ${isReview ? 'bg-violet-500/[0.03]' : ''}`}
    >
      <div
        className={`px-4 py-3 flex items-center gap-3 ${canExpand ? 'cursor-pointer hover:bg-white/[0.02]' : ''}`}
        onClick={() => canExpand && onToggleExpand()}
      >
        <StatusIcon status={item.status} warn={isLowContent && !isReview} review={isReview} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate" title={item.kind === 'url' ? String(item.payload) : item.name}>
            {item.kind === 'url' ? '🌐 ' : '📄 '}{item.title || item.name}
          </p>
          <p className="text-xs mt-0.5">
            {item.status === 'error' && item.error ? (
              <span className="text-red-400">{item.error}</span>
            ) : isReview ? (
              <span className="text-violet-400">
                Ready to review · <span className="font-mono text-violet-300">{item.chunkCount ?? 0} chunks</span>
                {item.dropped !== undefined && item.dropped > 0 && (
                  <span className="font-mono text-amber-500/70"> · {item.dropped} dropped by filter</span>
                )}
                <span className="text-slate-600"> · click to inspect</span>
              </span>
            ) : isLowContent ? (
              <span className="text-amber-400">
                ⚠ Low content · only {item.chunkCount ?? 0} chunk{item.chunkCount === 1 ? '' : 's'} kept — click to inspect
              </span>
            ) : item.status === 'filter' ? (
              <span className="text-slate-500">
                Filtering noise…
                {item.filterTotal !== undefined && (
                  <span className="font-mono text-slate-600"> · {item.filterScanned ?? 0}/{item.filterTotal}</span>
                )}
              </span>
            ) : (
              <span className="text-slate-500">
                {STATUS_LABEL[item.status]}
                {item.chunkCount !== undefined && (
                  <span className="font-mono text-slate-600"> · {item.chunkCount} chunks</span>
                )}
                {item.status === 'done' && item.dropped !== undefined && item.dropped > 0 && (
                  <span className="font-mono text-amber-500/70"> · {item.dropped} dropped</span>
                )}
                {canExpand && <span className="text-slate-600"> · click to preview</span>}
              </span>
            )}
          </p>
        </div>

        {canExpand && (
          <svg
            className={`w-3.5 h-3.5 text-slate-600 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
        {(item.status === 'pending' || item.status === 'error' || item.status === 'review') && !runningGlobal && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="text-slate-600 hover:text-red-400 transition-colors p-1"
            aria-label={isReview ? 'Discard' : 'Remove'}
            title={isReview ? 'Discard (do not save)' : 'Remove'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <AnimatePresence>
        {expanded && canExpand && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/[0.04] bg-black/30"
          >
            <div className="px-4 py-3 space-y-2.5">
              {item.kind === 'url' && (
                <a
                  href={item.payload as string}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] font-mono text-violet-400 hover:underline break-all block"
                >
                  {item.payload as string} ↗
                </a>
              )}

              <p className="text-[11px] text-slate-500">
                {showAllChunks
                  ? <>Showing all {samples.length} chunks · click ✕ to drop unwanted ones</>
                  : <>Showing {Math.min(samples.length, 3)} of {item.chunkCount} stored chunks (~{totalSampleChars.toLocaleString()} chars sampled)</>}
              </p>

              {(showAllChunks ? samples : samples.slice(0, 3)).map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
                      #{i + 1}
                    </span>
                    <span className="text-[10px] font-mono text-slate-600">{c.text.length} chars</span>
                    {showAllChunks && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDropChunk(i) }}
                        className="ml-auto text-[10px] font-mono text-slate-600 hover:text-red-400 border border-white/[0.06] hover:border-red-500/30 px-2 py-0.5 rounded transition-colors"
                      >
                        ✕ drop
                      </button>
                    )}
                  </div>
                  <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                    {c.text}
                  </pre>
                </div>
              ))}

              {isLowContent && !isReview && (
                <p className="text-[11px] text-amber-400/80 leading-relaxed">
                  Tip: if the page is JS-rendered (SPA), the parser only sees the empty shell.
                  Try copying the article text into a .txt/.md file instead.
                </p>
              )}

              {isReview && samples.length === 0 && (
                <p className="text-[11px] text-amber-400">
                  All chunks were dropped. Use the ✕ on the row to discard this item, or process again.
                </p>
              )}

              {isReview && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.04]">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove() }}
                    className="text-xs text-slate-500 hover:text-red-400 px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-red-500/30 hover:bg-red-500/5 transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onCommit() }}
                    disabled={samples.length === 0}
                    className="btn-primary text-xs font-semibold text-white px-4 py-1.5 rounded-lg disabled:opacity-40"
                  >
                    Save {samples.length} chunk{samples.length === 1 ? '' : 's'} to base
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function StatusIcon({ status, warn, review }: { status: ItemStatus; warn?: boolean; review?: boolean }) {
  if (review) {
    return (
      <div className="w-7 h-7 rounded-full bg-violet-500/15 border border-violet-500/40 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </div>
    )
  }
  if (status === 'done' && warn) {
    return (
      <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.7-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
        </svg>
      </div>
    )
  }
  if (status === 'done') {
    return (
      <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="w-7 h-7 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    )
  }
  if (status === 'pending') {
    return (
      <div className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/[0.08] flex-shrink-0" />
    )
  }
  return (
    <div className="w-7 h-7 rounded-full bg-violet-500/15 border border-violet-500/40 flex items-center justify-center flex-shrink-0">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full"
      />
    </div>
  )
}
