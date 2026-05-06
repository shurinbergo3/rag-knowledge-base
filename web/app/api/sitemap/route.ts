import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { isAuthorized } from '@/lib/auth'

export const maxDuration = 30

const MAX_URLS = 500
const MAX_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const MAX_INDEX_DEPTH = 3
const MAX_INDEX_CHILDREN = 10

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RAGBuilder/1.0)',
        'Accept': 'application/xml,text/xml,*/*;q=0.5',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    const text = await res.text()
    if (text.length > MAX_BYTES) throw new Error(`Sitemap too large (>${MAX_BYTES / 1024 / 1024} MB)`)
    return text
  } finally {
    clearTimeout(timeout)
  }
}

async function discoverSitemapCandidates(input: URL): Promise<string[]> {
  if (input.pathname.endsWith('.xml') || input.pathname.includes('sitemap')) {
    return [input.toString()]
  }

  const candidates = new Set<string>()
  const origin = `${input.protocol}//${input.host}`

  try {
    const robots = await fetchText(`${origin}/robots.txt`)
    const matches = robots.matchAll(/^\s*Sitemap:\s*(\S+)/gim)
    for (const m of matches) candidates.add(m[1].trim())
  } catch { /* ignore */ }

  candidates.add(`${origin}/sitemap.xml`)
  candidates.add(`${origin}/sitemap_index.xml`)
  candidates.add(`${origin}/sitemap-index.xml`)

  return Array.from(candidates)
}

async function parseSitemap(
  xml: string,
  depth: number,
  accumulator: Set<string>,
  pathPrefix: string | null,
): Promise<void> {
  if (accumulator.size >= MAX_URLS) return

  const $ = cheerio.load(xml, { xmlMode: true })

  const indexLocs: string[] = []
  $('sitemapindex > sitemap > loc, sitemap > loc').each((_, el) => {
    const t = $(el).text().trim()
    if (t) indexLocs.push(t)
  })

  if (indexLocs.length > 0 && depth < MAX_INDEX_DEPTH) {
    const filtered = pathPrefix
      ? indexLocs.filter(u => {
          try {
            const p = new URL(u).pathname
            return p.includes(pathPrefix) || p.endsWith('.xml')
          } catch { return false }
        })
      : indexLocs

    const toFetch = (filtered.length ? filtered : indexLocs).slice(0, MAX_INDEX_CHILDREN)

    for (const childUrl of toFetch) {
      if (accumulator.size >= MAX_URLS) break
      try {
        const childXml = await fetchText(childUrl)
        await parseSitemap(childXml, depth + 1, accumulator, pathPrefix)
      } catch { /* ignore */ }
    }
    return
  }

  $('urlset > url > loc, url > loc').each((_, el) => {
    if (accumulator.size >= MAX_URLS) return
    const u = $(el).text().trim()
    if (u) accumulator.add(u)
  })
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as { url?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const raw = String(body.url ?? '').trim()
  if (!raw) return NextResponse.json({ error: 'URL required' }, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // If user provided a path like gov.pl/web/udsc, only keep URLs matching that prefix
  const pathPrefix = parsed.pathname.length > 1 && !parsed.pathname.endsWith('.xml')
    ? parsed.pathname.replace(/\/$/, '')
    : null

  try {
    const candidates = await discoverSitemapCandidates(parsed)
    const urls = new Set<string>()
    const triedSitemaps: string[] = []
    let usedSitemap: string | null = null

    for (const sm of candidates) {
      if (urls.size >= MAX_URLS) break
      triedSitemaps.push(sm)
      try {
        const xml = await fetchText(sm)
        await parseSitemap(xml, 0, urls, pathPrefix)
        if (urls.size > 0) {
          usedSitemap = sm
          break
        }
      } catch { /* try next */ }
    }

    if (urls.size === 0) {
      return NextResponse.json(
        { error: `No sitemap found for ${parsed.host}${pathPrefix ?? ''}. Tried: ${triedSitemaps.slice(0, 3).join(', ')}` },
        { status: 404 },
      )
    }

    const sameHost = Array.from(urls).filter(u => {
      try { return new URL(u).host === parsed.host } catch { return false }
    })

    const filtered = pathPrefix
      ? sameHost.filter(u => {
          try { return new URL(u).pathname.startsWith(pathPrefix) } catch { return false }
        })
      : sameHost

    const final = (filtered.length ? filtered : sameHost).slice(0, MAX_URLS)
    final.sort()

    return NextResponse.json({
      sitemap: usedSitemap,
      pathPrefix,
      urls: final,
      total: final.length,
      truncated: filtered.length > MAX_URLS || sameHost.length > MAX_URLS,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch sitemap'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
