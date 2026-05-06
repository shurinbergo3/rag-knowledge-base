'use client'

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const FILE_TYPES = {
  xlsx: { label: 'Excel', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', ext: '.xlsx,.xls' },
  csv:  { label: 'CSV',   color: 'text-teal-400',    bg: 'bg-teal-500/10 border-teal-500/20',        ext: '.csv' },
  pdf:  { label: 'PDF',   color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',          ext: '.pdf' },
  docx: { label: 'Word',  color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',        ext: '.docx,.doc' },
  md:   { label: 'MD',    color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',      ext: '.md,.markdown' },
  txt:  { label: 'Text',  color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-500/20',      ext: '.txt' },
}

const ACCEPT = Object.values(FILE_TYPES).map(f => f.ext).join(',')

function detectType(file: File): keyof typeof FILE_TYPES | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'xlsx'
  if (name.endsWith('.csv')) return 'csv'
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'docx'
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md'
  if (name.endsWith('.txt')) return 'txt'
  return null
}

interface Props {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

export default function UploadZone({ onFiles, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFiles(files: File[]) {
    if (files.length === 0) return

    const valid: File[] = []
    const invalid: string[] = []
    const tooBig: string[] = []

    for (const file of files) {
      if (!detectType(file)) {
        invalid.push(file.name)
        continue
      }
      if (file.size > 20 * 1024 * 1024) {
        tooBig.push(file.name)
        continue
      }
      valid.push(file)
    }

    const errors: string[] = []
    if (invalid.length) errors.push(`Unsupported: ${invalid.join(', ')}`)
    if (tooBig.length) errors.push(`> 20 MB: ${tooBig.join(', ')}`)
    setError(errors.length ? errors.join(' · ') : null)

    if (valid.length) onFiles(valid)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    handleFiles(Array.from(e.dataTransfer.files))
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  return (
    <div className="space-y-4">
      <motion.div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        animate={{ scale: dragging ? 1.01 : 1 }}
        transition={{ duration: 0.15 }}
        className={`
          relative rounded-2xl p-10 text-center cursor-pointer
          transition-all duration-300 select-none overflow-hidden
          drop-zone-border
          ${dragging ? 'active' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.02]'}
        `}
      >
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ top: '-10%' }}
              animate={{ top: '110%' }}
              transition={{ duration: 1.2, ease: 'linear', repeat: Infinity }}
              className="absolute left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.8), transparent)' }}
            />
          )}
        </AnimatePresence>

        <div className="flex flex-col items-center gap-4">
          <div className={`
            w-20 h-20 rounded-full flex items-center justify-center
            transition-all duration-300
            ${dragging
              ? 'bg-violet-600/20 ring-2 ring-violet-500/50'
              : 'bg-white/[0.04] ring-1 ring-white/10'
            }
          `}>
            <svg
              className={`w-8 h-8 transition-colors ${dragging ? 'text-violet-400' : 'text-slate-500'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>

          <div className="space-y-2">
            <p className="text-white font-medium">
              {dragging ? 'Drop to add' : 'Drag & drop documents'}
            </p>
            <p className="text-sm text-slate-500">or click to browse · multiple files supported</p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={onInputChange}
          className="hidden"
        />
      </motion.div>

      <div className="flex items-center justify-center gap-2 flex-wrap">
        <span className="text-xs text-slate-600">Supported:</span>
        {(Object.entries(FILE_TYPES) as [keyof typeof FILE_TYPES, typeof FILE_TYPES[keyof typeof FILE_TYPES]][]).map(([key, info]) => (
          <span
            key={key}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border font-mono ${info.bg} ${info.color}`}
          >
            .{key}
          </span>
        ))}
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
