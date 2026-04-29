'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Chunk } from '@/lib/types'

interface Props {
  chunks: Chunk[]
}

export default function ChunkPreview({ chunks }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const preview = chunks.slice(0, 8)

  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-white">
          Chunk Preview
          <span className="ml-2 text-xs font-mono text-slate-500">
            showing {preview.length} of {chunks.length}
          </span>
        </h3>
        <span className="text-xs text-slate-600 font-mono">
          {chunks.length} total
        </span>
      </div>

      <div className="space-y-2">
        {preview.map((chunk, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-violet-500/20 transition-all duration-200 overflow-hidden"
            >
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-md bg-violet-600/20 border border-violet-500/20 flex items-center justify-center text-[10px] font-mono text-violet-400">
                  {i + 1}
                </span>
                <p className="flex-1 text-xs text-slate-300 truncate font-mono leading-relaxed">
                  {chunk.text.split('\n')[0]}
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {chunk.metadata.sheet && (
                    <span className="text-[10px] font-mono text-emerald-500/70 bg-emerald-500/10 border border-emerald-500/15 px-1.5 py-0.5 rounded">
                      {chunk.metadata.sheet}
                    </span>
                  )}
                  {chunk.metadata.page !== undefined && (
                    <span className="text-[10px] font-mono text-blue-400/70 bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 rounded">
                      p.{chunk.metadata.page}
                    </span>
                  )}
                  <svg
                    className={`w-3 h-3 text-slate-600 transition-transform ${expanded === i ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded content */}
              <AnimatePresence>
                {expanded === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 pt-0">
                      <div className="border-t border-white/[0.05] pt-3">
                        <pre className="text-[11px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                          {chunk.text}
                        </pre>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </motion.div>
        ))}
      </div>

      {chunks.length > 8 && (
        <p className="text-center text-xs text-slate-600">
          +{chunks.length - 8} more chunks stored in Qdrant
        </p>
      )}
    </div>
  )
}
