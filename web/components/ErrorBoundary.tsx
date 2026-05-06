'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[RAG Builder] React error:', error)
    console.error('[RAG Builder] component stack:', info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    const message = this.state.error.message || String(this.state.error)
    const stack = this.state.error.stack ?? ''

    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-xl w-full rounded-2xl border border-red-500/20 bg-red-500/5 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.7-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-red-200">Client-side error</p>
              <p className="text-xs text-red-400/70">The UI threw an exception. Your data in Qdrant is safe.</p>
            </div>
          </div>

          <pre className="text-xs font-mono text-red-300 bg-black/40 border border-white/[0.05] rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap">
            {message}
          </pre>

          {stack && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer hover:text-slate-300">Stack trace</summary>
              <pre className="mt-2 text-[10px] font-mono bg-black/40 border border-white/[0.05] rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap text-slate-400">
                {stack}
              </pre>
            </details>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t border-white/[0.05]">
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/[0.1]"
            >
              Reload page
            </button>
            <button
              onClick={this.reset}
              className="btn-primary text-xs font-semibold text-white px-4 py-1.5 rounded-lg"
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    )
  }
}
