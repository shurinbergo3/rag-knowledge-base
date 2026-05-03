'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { getSecret, setSecret } from '@/lib/client-auth'

export default function AuthGate({ children }: { children: ReactNode }) {
  const [hasSecret, setHasSecret] = useState<boolean | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setHasSecret(Boolean(getSecret()))
    const handler = () => setHasSecret(false)
    window.addEventListener('rag:unauthorized', handler)
    return () => window.removeEventListener('rag:unauthorized', handler)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = input.trim()
    if (!value) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/auth-check', {
        method: 'POST',
        headers: { 'x-api-secret': value },
      })
      if (res.ok) {
        setSecret(value)
        setHasSecret(true)
        setInput('')
      } else {
        setError('Invalid secret')
      }
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  if (hasSecret === null) {
    return <div className="min-h-screen" />
  }

  if (hasSecret) return <>{children}</>

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="glass-violet rounded-2xl p-8 w-full max-w-sm space-y-4"
      >
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-white">Enter API secret</h1>
          <p className="text-sm text-slate-500">
            Required to upload documents and run searches.
          </p>
        </div>
        <input
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="API_SECRET"
          autoFocus
          className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40"
        />
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="btn-primary w-full px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </main>
  )
}
