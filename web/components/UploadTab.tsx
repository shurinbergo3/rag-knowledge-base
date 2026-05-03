'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import UploadZone from './UploadZone'
import ProgressSteps from './ProgressSteps'
import ChunkPreview from './ChunkPreview'
import type { Chunk, UploadProgress } from '@/lib/types'
import type { StepStatus } from './ProgressSteps'
import { fetchWithAuth, UnauthorizedError } from '@/lib/client-auth'

type Phase = 'idle' | 'processing' | 'done' | 'error'

const STEP_IDS = ['parse', 'embed', 'upload', 'done']

interface Props {
  project: string | null
}

export default function UploadTab({ project }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({
    parse: 'idle', embed: 'idle', upload: 'idle', done: 'idle',
  })
  const [currentStep, setCurrentStep] = useState('')
  const [chunkCount, setChunkCount] = useState<number | undefined>()
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  function resetStatuses() {
    setStatuses({ parse: 'idle', embed: 'idle', upload: 'idle', done: 'idle' })
  }

  const handleFile = useCallback((f: File) => {
    setFile(f)
    resetStatuses()
    setPhase('idle')
    setChunks([])
    setChunkCount(undefined)
    setErrorMsg('')
  }, [])

  async function handleUpload() {
    if (!file) return
    if (!project) {
      setErrorMsg('Select or create a project first.')
      setPhase('error')
      return
    }
    setPhase('processing')
    resetStatuses()
    setChunks([])
    setChunkCount(undefined)
    setErrorMsg('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('project', project)

    try {
      const response = await fetchWithAuth('/api/upload', { method: 'POST', body: formData })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(err.error || 'Upload failed')
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
            applyProgress(data)
          } catch {
            // partial JSON, skip
          }
        }
      }
    } catch (err) {
      const msg = err instanceof UnauthorizedError
        ? 'Session expired. Please re-enter the secret.'
        : err instanceof Error ? err.message : 'Something went wrong'
      setErrorMsg(msg)
      setPhase('error')
      setStatuses(prev => {
        const next = { ...prev }
        for (const id of STEP_IDS) {
          if (next[id] === 'running') next[id] = 'error'
        }
        return next
      })
    }
  }

  function applyProgress(data: UploadProgress) {
    if (data.step === 'complete') {
      setStatuses({ parse: 'done', embed: 'done', upload: 'done', done: 'done' })
      setPhase('done')
      if (data.chunks) setChunks(data.chunks)
      if (data.chunkCount) setChunkCount(data.chunkCount)
      return
    }

    if (data.step === 'error') {
      setErrorMsg(data.message ?? 'Unknown error')
      setPhase('error')
      return
    }

    setCurrentStep(data.step)
    setStatuses(prev => ({ ...prev, [data.step]: data.status as StepStatus }))
    if (data.chunkCount !== undefined) setChunkCount(data.chunkCount)
  }

  const isProcessing = phase === 'processing'
  const isDone = phase === 'done'

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Upload zone */}
      <UploadZone onFile={handleFile} disabled={isProcessing} />

      {/* Upload button */}
      <AnimatePresence>
        {file && phase === 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex flex-col items-center gap-2"
          >
            <button
              onClick={handleUpload}
              disabled={!project}
              className="btn-primary px-8 py-3 rounded-xl font-semibold text-white text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
              </svg>
              {project ? `Build into "${project}"` : 'Select a project first'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress (while processing or done) */}
      <AnimatePresence>
        {(isProcessing || isDone || phase === 'error') && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            <ProgressSteps
              currentStep={currentStep}
              statuses={statuses}
              chunkCount={chunkCount}
            />

            {/* Error message */}
            {phase === 'error' && errorMsg && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                <span className="font-semibold">Error: </span>{errorMsg}
              </motion.div>
            )}

            {/* Success + chunk preview */}
            {isDone && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
              >
                {/* Success banner */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-300">Knowledge base ready!</p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      {chunkCount} chunks stored. Switch to the Search tab to test it.
                    </p>
                  </div>
                </div>

                {chunks.length > 0 && <ChunkPreview chunks={chunks} />}

                {/* Reset button */}
                <div className="flex justify-center">
                  <button
                    onClick={() => { setPhase('idle'); setFile(null); resetStatuses(); setChunks([]) }}
                    className="text-sm text-slate-500 hover:text-violet-400 transition-colors"
                  >
                    Upload another document
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
