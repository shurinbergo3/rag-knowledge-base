import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { parseHtml } from '@/lib/parsers/html'
import { embedTexts } from '@/lib/embeddings'
import { ensureCollection, upsertChunks, defaultProject, isValidProjectName } from '@/lib/qdrant'
import { filterChunks } from '@/lib/content-filter'
import { isAuthorized } from '@/lib/auth'
import type { UploadProgress, Chunk } from '@/lib/types'

export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024
const MAX_CHUNKS = 10_000
const FETCH_TIMEOUT_MS = 20_000
const MAX_FOLLOW = 12
const THIN_HUB_CHUNK_THRESHOLD = 6
const THIN_HUB_CHARS_THRESHOLD = 1200

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

function extractInternalContentLinks(html: string, baseUrl: URL): string[] {
  const $ = cheerio.load(html)
  $('script, style, nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], .breadcrumb, .breadcrumbs').remove()

  let root = $('main').first()
  if (!root.length) root = $('article').first()
  if (!root.length) root = $('body')

  const inputPath = baseUrl.pathname.replace(/\/$/, '') || '/'
  // Parent path: e.g. "/web/udsc/karta-pobytu-cukr" → "/web/udsc/"
  const lastSlash = inputPath.lastIndexOf('/')
  const parentPath = lastSlash > 0 ? inputPath.slice(0, lastSlash + 1) : '/'

  const links = new Set<string>()
  root.find('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim()
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return
    try {
      const abs = new URL(href, baseUrl)
      if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return
      if (abs.host !== baseUrl.host) return
      if (!abs.pathname.startsWith(parentPath)) return
      if (abs.pathname === inputPath || abs.pathname === inputPath + '/') return
      if (/\.(pdf|jpe?g|png|gif|svg|webp|mp4|mp3|zip|rar|doc|docx|xls|xlsx|ppt|pptx)$/i.test(abs.pathname)) return
      abs.hash = ''
      abs.search = ''
      links.add(abs.toString())
    } catch { /* ignore */ }
  })

  return Array.from(links)
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

  const body = await request.json().catch(() => null) as { url?: unknown; project?: unknown; dryRun?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const rawUrl = String(body.url ?? '').trim()
  const projectField = String(body.project ?? '').trim()
  const project = projectField || defaultProject()
  const dryRun = Boolean(body.dryRun)

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
        const initial = parseHtml(html, finalUrl)
        const title = initial.title

        let allChunks: Chunk[] = [...initial.chunks]
        let followedCount = 0
        let followedTotal = 0

        const initialChars = allChunks.reduce((s, c) => s + c.text.length, 0)
        const isThinHub =
          allChunks.length < THIN_HUB_CHUNK_THRESHOLD ||
          initialChars < THIN_HUB_CHARS_THRESHOLD

        if (isThinHub) {
          const links = extractInternalContentLinks(html, new URL(finalUrl))
          const toFollow = links.slice(0, MAX_FOLLOW)
          followedTotal = toFollow.length

          if (toFollow.length > 0) {
            send({
              step: 'parse',
              status: 'running',
              chunkCount: allChunks.length,
              message: `Hub page detected — fetching ${toFollow.length} sub-page${toFollow.length === 1 ? '' : 's'}…`,
            })

            for (let i = 0; i < toFollow.length; i++) {
              const link = toFollow[i]
              try {
                const sub = await fetchHtml(new URL(link))
                const subParsed = parseHtml(sub.html, sub.finalUrl)
                allChunks.push(...subParsed.chunks)
                followedCount++
              } catch { /* skip broken sub-page */ }
              send({
                step: 'parse',
                status: 'running',
                chunkCount: allChunks.length,
                scanned: i + 1,
                message: `Following sub-pages: ${i + 1}/${toFollow.length}`,
              })
            }
          }
        }

        if (allChunks.length === 0) {
          send({ step: 'error', status: 'error', message: `No readable content found at ${finalUrl}` })
          return
        }
        if (allChunks.length > MAX_CHUNKS) {
          send({ step: 'error', status: 'error', message: `Too many chunks (${allChunks.length} > ${MAX_CHUNKS})` })
          return
        }

        const parseMessage = followedTotal > 0
          ? `${title} (+${followedCount} sub-pages)`
          : title

        send({ step: 'parse', status: 'done', chunkCount: allChunks.length, message: parseMessage })

        send({ step: 'filter', status: 'running', chunkCount: allChunks.length, scanned: 0 })
        const { kept, dropped, totalScanned } = await filterChunks(allChunks, (done, total) => {
          send({ step: 'filter', status: 'running', chunkCount: total, scanned: done })
        })
        send({ step: 'filter', status: 'done', chunkCount: kept.length, dropped, scanned: totalScanned })

        if (kept.length === 0) {
          send({ step: 'error', status: 'error', message: `All ${totalScanned} extracted chunks were classified as boilerplate/noise — nothing useful on this page.` })
          return
        }

        if (dryRun) {
          send({
            step: 'review',
            status: 'done',
            chunkCount: kept.length,
            chunks: kept,
            full: true,
            message: parseMessage,
            dropped,
            scanned: totalScanned,
          })
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
          message: parseMessage,
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
