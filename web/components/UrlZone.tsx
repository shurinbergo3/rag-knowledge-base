'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  onUrls: (urls: string[]) => void
  disabled?: boolean
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

export default function UrlZone({ onUrls, disabled }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (disabled) return

    const raw = value
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean)

    if (raw.length === 0) {
      setError('Paste at least one URL')
      return
    }

    const valid: string[] = []
    const invalid: string[] = []
    for (const r of raw) {
      const n = normalizeUrl(r)
      if (n) valid.push(n)
      else invalid.push(r)
    }

    setError(invalid.length ? `Invalid: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}` : null)

    if (valid.length) {
      onUrls(valid)
      setValue('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-6 bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div>
            <p className="text-white font-medium">Paste specific page URLs</p>
            <p className="text-xs text-slate-500">
              Each URL = one page · for whole sites use <span className="text-violet-400">🗺️ Crawl site</span> tab
            </p>
          </div>
        </div>

        <textarea
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={`https://www.gov.pl/web/diia/karta-pobytu\nhttps://migracje.gov.pl/...`}
          rows={5}
          disabled={disabled}
          className="w-full bg-black/40 border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-700 outline-none focus:border-violet-500/40 font-mono resize-none disabled:opacity-50"
        />

        <div className="flex justify-between items-center mt-3">
          <p className="text-xs text-slate-600">
            Static pages work best · JS-heavy SPAs may have limited content
          </p>
          <button
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add to queue
          </button>
        </div>
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
    </div>
  )
}
