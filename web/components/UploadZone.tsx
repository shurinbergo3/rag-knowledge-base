'use client'

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const FILE_TYPES = {
  xlsx: { label: 'Excel', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', ext: '.xlsx,.xls' },
  pdf:  { label: 'PDF',   color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         ext: '.pdf' },
  docx: { label: 'Word',  color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',        ext: '.docx,.doc' },
  txt:  { label: 'Text',  color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-500/20',      ext: '.txt' },
}

const ACCEPT = Object.values(FILE_TYPES).map(f => f.ext).join(',')

function FileIcon({ type }: { type: keyof typeof FILE_TYPES | null }) {
  if (!type) {
    return (
      <svg className="w-12 h-12 text-slate-600" fill="none" viewBox="0 0 48 48" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M28 4H12a4 4 0 00-4 4v32a4 4 0 004 4h24a4 4 0 004-4V20L28 4z"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M28 4v16h16"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 28h16M16 34h10"/>
      </svg>
    )
  }

  const colors: Record<string, string> = {
    xlsx: '#4ade80', pdf: '#f87171', docx: '#60a5fa', txt: '#94a3b8'
  }

  return (
    <motion.div
      initial={{ scale: 0.8, rotate: -10 }}
      animate={{ scale: 1, rotate: 0 }}
      className="w-16 h-16 rounded-2xl flex items-center justify-center"
      style={{ background: `${colors[type]}15`, border: `1px solid ${colors[type]}30` }}
    >
      <span className="text-2xl font-bold font-mono" style={{ color: colors[type] }}>
        {FILE_TYPES[type].label.slice(0, 2)}
      </span>
    </motion.div>
  )
}

function detectType(file: File): keyof typeof FILE_TYPES | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'xlsx'
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'docx'
  if (name.endsWith('.txt')) return 'txt'
  return null
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

export default function UploadZone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleFile(file: File) {
    const type = detectType(file)
    if (!type) {
      setError('Unsupported file type. Please upload Excel, PDF, DOCX, or TXT.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File exceeds 20 MB limit.')
      return
    }
    setError(null)
    setSelected(file)
    onFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const fileType = selected ? detectType(selected) : null

  return (
    <div className="space-y-4">
      {/* Drop zone */}
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
        {/* Scan line on drag */}
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
          <div className="relative">
            {/* Outer ring */}
            <div className={`
              w-20 h-20 rounded-full flex items-center justify-center
              transition-all duration-300
              ${dragging
                ? 'bg-violet-600/20 ring-2 ring-violet-500/50'
                : 'bg-white/[0.04] ring-1 ring-white/10'
              }
            `}>
              <AnimatePresence mode="wait">
                {selected ? (
                  <FileIcon key="typed" type={fileType} />
                ) : (
                  <motion.svg
                    key="default"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className={`w-8 h-8 transition-colors ${dragging ? 'text-violet-400' : 'text-slate-500'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </motion.svg>
                )}
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key="selected"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-1"
              >
                <p className="font-semibold text-white">{selected.name}</p>
                <p className="text-sm text-slate-500 font-mono">{formatSize(selected.size)}</p>
                {!disabled && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelected(null); setError(null) }}
                    className="text-xs text-slate-500 hover:text-violet-400 transition-colors mt-1"
                  >
                    Change file
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-2"
              >
                <p className="text-white font-medium">
                  {dragging ? 'Drop to upload' : 'Drag & drop your document'}
                </p>
                <p className="text-sm text-slate-500">or click to browse</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onInputChange}
          className="hidden"
        />
      </motion.div>

      {/* File type pills */}
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

      {/* Error */}
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
