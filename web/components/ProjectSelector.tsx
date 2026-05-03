'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { UseProjects } from '@/lib/use-projects'
import { isValidProjectName } from '@/lib/use-projects'

interface Props {
  state: UseProjects
}

export default function ProjectSelector({ state }: Props) {
  const { projects, active, loading, error, setActive, create, remove } = state
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!isValidProjectName(newName.trim())) {
      setLocalError('Use 1–48 chars: letters, digits, "-", "_".')
      return
    }
    setBusy(true)
    try {
      await create(newName.trim())
      setNewName('')
      setCreating(false)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!active) return
    if (!confirm(`Delete project "${active}"? All chunks will be removed from Qdrant.`)) return
    setBusy(true)
    setLocalError(null)
    try {
      await remove(active)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600/15 border border-violet-500/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
            </svg>
          </div>
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Project</span>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={active ?? ''}
            disabled={loading || busy || projects.length === 0}
            onChange={e => setActive(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm font-mono text-slate-200 outline-none cursor-pointer hover:border-violet-500/30 focus:border-violet-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {projects.length === 0 ? (
              <option value="" className="bg-[#131720]">No projects</option>
            ) : (
              projects.map(p => (
                <option key={p} value={p} className="bg-[#131720]">{p}</option>
              ))
            )}
          </select>

          <button
            onClick={() => { setCreating(true); setLocalError(null) }}
            disabled={busy}
            className="text-xs font-medium text-violet-300 hover:text-violet-200 border border-violet-500/30 hover:border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/20 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
            title="Create new project"
          >
            + New
          </button>

          {active && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="text-xs text-slate-500 hover:text-red-400 border border-white/[0.06] hover:border-red-500/30 bg-white/[0.02] hover:bg-red-500/10 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
              title={`Delete project "${active}"`}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {creating && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreate}
            className="flex items-center gap-2 overflow-hidden"
          >
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="project_name"
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm font-mono text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
            >
              {busy ? '…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewName(''); setLocalError(null) }}
              disabled={busy}
              className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1.5"
            >
              Cancel
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(error || localError) && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-red-400"
          >
            {localError || error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
