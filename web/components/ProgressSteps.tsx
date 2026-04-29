'use client'

import { motion, AnimatePresence } from 'framer-motion'

export type StepStatus = 'idle' | 'running' | 'done' | 'error'

export interface Step {
  id: string
  label: string
  description: string
}

const STEPS: Step[] = [
  { id: 'parse',  label: 'Parse',  description: 'Extracting text chunks from document' },
  { id: 'embed',  label: 'Embed',  description: 'Generating OpenAI embeddings' },
  { id: 'upload', label: 'Upload', description: 'Storing vectors in Qdrant' },
  { id: 'done',   label: 'Done',   description: 'Knowledge base is ready' },
]

interface Props {
  currentStep: string
  statuses: Record<string, StepStatus>
  chunkCount?: number
}

function StepIcon({ status, index }: { status: StepStatus; index: number }) {
  if (status === 'done') {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg"
        style={{ boxShadow: '0 0 16px rgba(124,58,237,0.5)' }}
      >
        <motion.svg
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="w-4 h-4 text-white"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <motion.path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </motion.svg>
      </motion.div>
    )
  }

  if (status === 'running') {
    return (
      <div className="w-9 h-9 rounded-full border-2 border-violet-500/30 bg-violet-600/10 flex items-center justify-center relative">
        {/* Spinning ring */}
        <svg className="w-9 h-9 absolute inset-0 animate-spin" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="none" strokeWidth="2"
            stroke="url(#spin-grad)" strokeDasharray="70 30" strokeLinecap="round" />
          <defs>
            <linearGradient id="spin-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>
        </svg>
        <span className="text-xs font-bold font-mono text-violet-400">{index + 1}</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
        <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    )
  }

  return (
    <div className="w-9 h-9 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center">
      <span className="text-xs font-mono text-slate-600">{index + 1}</span>
    </div>
  )
}

export default function ProgressSteps({ currentStep, statuses, chunkCount }: Props) {
  return (
    <div className="glass-violet rounded-2xl p-6">
      <div className="flex items-start gap-0 relative">
        {STEPS.map((step, i) => {
          const status = statuses[step.id] ?? 'idle'
          const isLast = i === STEPS.length - 1

          return (
            <div key={step.id} className="flex-1 flex flex-col items-center">
              {/* Step icon + connector */}
              <div className="flex items-center w-full">
                <div className="flex-shrink-0 z-10">
                  <StepIcon status={status} index={i} />
                </div>

                {/* Connector line */}
                {!isLast && (
                  <div className="flex-1 h-0.5 mx-1 relative overflow-hidden rounded-full bg-white/[0.06]">
                    <AnimatePresence>
                      {(statuses[STEPS[i + 1]?.id] === 'done' || status === 'done') && (
                        <motion.div
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ background: 'linear-gradient(90deg, #7c3aed, #4f46e5)', boxShadow: '0 0 8px rgba(124,58,237,0.6)' }}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Label */}
              <div className="mt-3 text-center px-1">
                <p className={`text-xs font-semibold transition-colors ${
                  status === 'done' ? 'text-violet-300' :
                  status === 'running' ? 'text-white' :
                  status === 'error' ? 'text-red-400' :
                  'text-slate-600'
                }`}>
                  {step.label}
                </p>
                <AnimatePresence>
                  {status === 'running' && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-[10px] text-slate-500 mt-0.5 leading-tight hidden sm:block"
                    >
                      {step.description}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )
        })}
      </div>

      {/* Chunk count badge */}
      <AnimatePresence>
        {chunkCount !== undefined && chunkCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-center gap-3 text-sm"
          >
            <span className="text-slate-500">Extracted</span>
            <span className="font-mono font-bold text-violet-300 text-lg">{chunkCount}</span>
            <span className="text-slate-500">chunks</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
