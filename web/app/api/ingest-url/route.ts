import { NextRequest, NextResponse } from 'next/server'
import { parseHtml } from '@/lib/parsers/html'
import { embedTexts } from '@/lib/embeddings'
import { ensureCollection, upsertChunks, defaultProject, isValidProjectName } from '@/lib/qdrant'
import { filterChunks } from '@/lib/content-filter'
import { isAuthorized } from '@/lib/auth'
import type { UploadProgress } from '@/lib/types'

export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024
const MAX_CHUNKS = 10_000
const FETCH_TIMEOUT_MS = 20_000

function sse(data: UploadProgress): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function isValidUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u
  } catch {
    return null
  }
}

async function fetchHtml(url: URL): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RAGBuilder/1.0; +https://rag-knowledge-base-zeta.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en,pl;q=0.9,ru;q=0.8',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

    const contentType = res.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      throw new Error(`Unsupported content-type: ${contentType || 'unknown'}`)
    }

    const lengthHeader = Number(res.headers.get('content-length') ?? '0')
    if (lengthHeader && lengthHeader > MAX_BYTES) {
      throw new Error(`Page too large (${(lengthHeader / 1024 / 1024).toFixed(1)} MB > ${MAX_BYTES / 1024 / 1024} MB)`)
    }

    const reader = res.body?.getReader()
    if (!reader) {
      const text = await res.text()
      if (text.length > MAX_BYTES) throw new Error('Page too large')
      return { html: text, finalUrl: res.url }
    }

    const decoder = new TextDecoder('utf-8')
    let html = ''
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BYTES) {
        try { await reader.cancel() } catch { /* ignore */ }
        throw new Error(`Page too large (> ${MAX_BYTES / 1024 / 1024} MB)`)
      }
      html += decoder.decode(value, { stream: true })
    }
    html += decoder.decode()
    return { html, finalUrl: res.url }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as { url?: unknown; project?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const rawUrl = String(body.url ?? '').trim()
  const projectField = String(body.project ?? '').trim()
  const project = projectField || defaultProject()

  if (!isValidProjectName(project)) {
    return NextResponse.json({ error: 'Invalid project name' }, { status: 400 })
  }

  const parsed = isValidUrl(rawUrl)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid URL (must be http or https)' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: UploadProgress) => {
        if (closed) return
        controller.enqueue(encoder.encode(sse(data)))
      }
      const close = () => {
        if (closed) return
        closed = true
        try { controller.close() } catch { /* already closed */ }
      }

      try {
        send({ step: 'parse', status: 'running' })

        const { html, finalUrl } = await fetchHtml(parsed)
        const { chunks, title } = parseHtml(html, finalUrl)

        if (chunks.length === 0) {
          send({ step: 'error', status: 'error', message: `No readable content found at ${finalUrl}` })
          return
        }
        if (chunks.length > MAX_CHUNKS) {
          send({ step: 'error', status: 'error', message: `Too many chunks (${chunks.length} > ${MAX_CHUNKS})` })
          return
        }

        send({ step: 'parse', status: 'done', chunkCount: chunks.length, message: title })

        send({ step: 'filter', status: 'running', chunkCount: chunks.length, scanned: 0 })
        const { kept, dropped, totalScanned } = await filterChunks(chunks, (done, total) => {
          send({ step: 'filter', status: 'running', chunkCount: total, scanned: done })
        })
        send({ step: 'filter', status: 'done', chunkCount: kept.length, dropped, scanned: totalScanned })

        if (kept.length === 0) {
          send({ step: 'error', status: 'error', message: `All ${totalScanned} extracted chunks were classified as boilerplate/noise — nothing useful on this page.` })
          return
        }

        send({ step: 'embed', status: 'running', chunkCount: kept.length })
        const vectors = await embedTexts(kept.map(c => c.text))
        send({ step: 'embed', status: 'done', chunkCount: kept.length })

        send({ step: 'upload', status: 'running', chunkCount: kept.length })
        await ensureCollection(project)
        await upsertChunks(project, kept, vectors)
        send({ step: 'upload', status: 'done', chunkCount: kept.length })

        send({
          step: 'complete',
          status: 'done',
          chunkCount: kept.length,
          chunks: kept.slice(0, 20),
          message: title,
          dropped,
          scanned: totalScanned,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error'
        send({ step: 'error', status: 'error', message })
      } finally {
        close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
