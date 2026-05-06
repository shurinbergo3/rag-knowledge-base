import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { isAuthorized } from '@/lib/auth'

export const maxDuration = 30

const MAX_URLS = 500
const MAX_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const MAX_INDEX_DEPTH = 3
const MAX_INDEX_CHILDREN = 10

async function fetchText(url: string, expectXml = false): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RAGBuilder/1.0)',
        'Accept': expectXml ? 'application/xml,text/xml,*/*;q=0.5' : 'text/html,*/*;q=0.5',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)

    if (expectXml) {
      const ct = res.headers.get('content-type') ?? ''
      if (ct && !/xml/i.test(ct) && !/text\/plain/i.test(ct)) {
        throw new Error(`Not XML (content-type: ${ct})`)
      }
    }

    const text = await res.text()
    if (text.length > MAX_BYTES) throw new Error(`Response too large (>${MAX_BYTES / 1024 / 1024} MB)`)

    if (expectXml) {
      // Reject HTML masquerading as XML (SPA fallback returns the homepage)
      const head = text.slice(0, 500).toLowerCase()
      if (head.includes('<!doctype html') || head.includes('<html')) {
        throw new Error('Not a sitemap (got HTML)')
      }
    }
    return text
  } finally {
    clearTimeout(timeout)
  }
}

async function crawlLinksFromPage(input: URL, pathPrefix: string | null): Promise<string[]> {
  const html = await fetchText(input.toString(), false)
  const $ = cheerio.load(html)
  $('script, style, noscript, svg').remove()

  const found = new Set<string>()
  const baseHost = input.host

  $('a[href]').each((_, el) => {
    if (found.size >= MAX_URLS) return
    const href = ($(el).attr('href') ?? '').trim()
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return

    try {
      const abs = new URL(href, input)
      if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return
      if (abs.host !== baseHost) return
      if (/\.(pdf|jpe?g|png|gif|svg|webp|mp4|mp3|zip|rar|doc|docx|xls|xlsx|ppt|pptx)$/i.test(abs.pathname)) return
      if (pathPrefix && !abs.pathname.startsWith(pathPrefix)) return

      abs.hash = ''
      abs.search = ''
      found.add(abs.toString())
    } catch { /* ignore */ }
  })

  return Array.from(found).sort()
}

async function discoverSitemapCandidates(input: URL): Promise<string[]> {
  if (input.pathname.endsWith('.xml') || input.pathname.includes('sitemap')) {
    return [input.toString()]
  }

  const candidates = new Set<string>()
  const origin = `${input.protocol}//${input.host}`

  try {
    const robots = await fetchText(`${origin}/robots.txt`, false)
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
        const childXml = await fetchText(childUrl, true)
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
        const xml = await fetchText(sm, true)
        await parseSitemap(xml, 0, urls, pathPrefix)
        if (urls.size > 0) {
          usedSitemap = sm
          break
        }
      } catch { /* try next */ }
    }

    let method: 'sitemap' | 'crawl' = 'sitemap'

    if (urls.size === 0) {
      // Fallback: crawl the input page for same-host links (depth 1)
      method = 'crawl'
      try {
        const links = await crawlLinksFromPage(parsed, pathPrefix)
        for (const u of links) {
          if (urls.size >= MAX_URLS) break
          urls.add(u)
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : 'crawl failed'
        return NextResponse.json(
          {
            error: `No sitemap found for ${parsed.host}${pathPrefix ?? ''}. Link-crawl fallback also failed: ${m}. Try a more specific section URL.`,
            triedSitemaps: triedSitemaps.slice(0, 3),
          },
          { status: 404 },
        )
      }

      if (urls.size === 0) {
        return NextResponse.json(
          {
            error: `No sitemap found and no internal links discovered on ${parsed.toString()}. The page may be JS-rendered, or you may need to point to a specific section like /web/udsc.`,
            triedSitemaps: triedSitemaps.slice(0, 3),
          },
          { status: 404 },
        )
      }
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
      method,
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
