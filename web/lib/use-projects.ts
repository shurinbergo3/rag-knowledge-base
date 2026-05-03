'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchWithAuth, UnauthorizedError } from './client-auth'

const ACTIVE_KEY = 'rag_active_project'
const NAME_RE = /^[a-zA-Z0-9_-]{1,48}$/

export function isValidProjectName(name: string): boolean {
  return NAME_RE.test(name)
}

export interface UseProjects {
  projects: string[]
  active: string | null
  loading: boolean
  error: string | null
  setActive: (name: string) => void
  refresh: () => Promise<void>
  create: (name: string) => Promise<string>
  remove: (name: string) => Promise<void>
}

export function useProjects(): UseProjects {
  const [projects, setProjects] = useState<string[]>([])
  const [active, setActiveState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setActive = useCallback((name: string) => {
    setActiveState(name)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_KEY, name)
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithAuth('/api/projects')
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to load projects' }))
        throw new Error(body.error || 'Failed to load projects')
      }
      const data = await res.json()
      const list: string[] = data.projects ?? []
      setProjects(list)

      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_KEY) : null
      const next = stored && list.includes(stored) ? stored : (list[0] ?? null)
      setActiveState(next)
      if (next && typeof window !== 'undefined') {
        window.localStorage.setItem(ACTIVE_KEY, next)
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setError('Session expired. Re-enter the secret.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load projects')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const create = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!isValidProjectName(trimmed)) {
      throw new Error('Invalid name. 1–48 chars: letters, digits, "-", "_".')
    }
    const res = await fetchWithAuth('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Failed to create project' }))
      throw new Error(body.error || 'Failed to create project')
    }
    await refresh()
    setActive(trimmed)
    return trimmed
  }, [refresh, setActive])

  const remove = useCallback(async (name: string) => {
    const res = await fetchWithAuth(`/api/projects?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Failed to delete project' }))
      throw new Error(body.error || 'Failed to delete project')
    }
    await refresh()
  }, [refresh])

  useEffect(() => {
    refresh().catch(() => { /* surfaced via state */ })
  }, [refresh])

  return { projects, active, loading, error, setActive, refresh, create, remove }
}
