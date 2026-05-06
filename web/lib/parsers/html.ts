import * as cheerio from 'cheerio'
import type { Chunk } from '../types'
import { chunkParagraphs } from './chunking'

const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'video', 'audio',
  'nav', 'header', 'footer', 'aside', 'form', 'button', 'menu',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="search"]', '[role="dialog"]',
  '[aria-hidden="true"]',
  '.cookie', '.cookies', '.consent', '.banner-cookies', '.cookie-banner', '.gdpr',
  '#cookie', '#cookies', '#consent', '#gdpr',
  '.advert', '.advertisement', '.ads', '.ad', '.adsense', '.adsbygoogle', '[class*="advert"]', '[id*="advert"]',
  '.sidebar', '.side-bar', '.breadcrumb', '.breadcrumbs', '.pagination',
  '.share', '.share-buttons', '.social', '.social-share', '.social-links',
  '.related', '.related-posts', '.related-articles', '.recommendations',
  '.comments', '.comment-section', '#comments', '#disqus_thread',
  '.newsletter', '.subscribe', '.popup', '.modal', '.overlay',
  '.cta', '.banner', '.promo',
  '.menu', '.main-menu', '.nav-menu', '.navigation',
  '.skip-link', '.screen-reader', '.sr-only', '.visually-hidden',
  '.search-form', '.search-box',
  '.author-box', '.author-bio', '.byline-box',
  '.tags', '.tag-list', '.categories',
  '.print-only', '.no-print',
].join(', ')

const BOILERPLATE_PATTERNS: RegExp[] = [
  /^(home|главная|strona\s*główna|menu|search|поиск|szukaj|skip\s*to\s*(main\s*)?content|jump\s*to)$/i,
  /^(login|sign\s*in|sign\s*up|register|войти|регистрация|zaloguj|zarejestruj)$/i,
  /^(cookie|cookies|we\s*use\s*cookies|this\s*site\s*uses\s*cookies|по\s*cookie|polityka\s*cookies)/i,
  /^(privacy\s*policy|terms\s*of\s*(service|use)|политика\s*конфиденциальности|polityka\s*prywatności)/i,
  /^(©|copyright|all\s*rights\s*reserved|wszelkie\s*prawa\s*zastrzeżone)/i,
  /^(share\s*(this)?|share\s*on|поделиться|udostępnij)/i,
  /^(subscribe|newsletter|подпис|zapisz\s*się)/i,
  /^(follow\s*us|подпишитесь|śledź\s*nas)/i,
  /^(read\s*more|читать\s*далее|czytaj\s*więcej|подробнее)\.?$/i,
  /^(loading|загрузка|ładowanie)\.{0,3}$/i,
  /^(javascript|js)\s*(is\s*)?(required|disabled|enabled)/i,
  /^(404|page\s*not\s*found|страница\s*не\s*найдена)/i,
  /^(advertisement|реклама|reklama)$/i,
]

function isLikelyBoilerplate(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 30) return true
  for (const re of BOILERPLATE_PATTERNS) {
    if (re.test(trimmed)) return true
  }
  // a paragraph that is mostly link-like: many short words separated by " | " or " · "
  const separators = (trimmed.match(/\s[|·•‣▪]\s/g) ?? []).length
  if (separators >= 3 && trimmed.length < 200) return true
  // very low alpha-to-symbol ratio (e.g., "© 2024 · About · Contact · Privacy")
  const letters = (trimmed.match(/\p{L}/gu) ?? []).length
  if (letters / trimmed.length < 0.5) return true
  return false
}

const MAIN_SELECTORS = [
  'main', 'article', '[role="main"]',
  '#main', '#content', '#main-content',
  '.main', '.content', '.main-content', '.post', '.article',
]

function pickRoot($: cheerio.CheerioAPI) {
  for (const sel of MAIN_SELECTORS) {
    const el = $(sel).first()
    if (el.length && el.text().trim().length > 200) return el
  }
  return $('body')
}

function clean(text: string): string {
  return text
    .replace(/ /g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface HtmlParseResult {
  title: string
  chunks: Chunk[]
}

export function parseHtml(html: string, source: string): HtmlParseResult {
  const $ = cheerio.load(html)

  const title = clean($('title').first().text() || $('h1').first().text() || source).slice(0, 200)

  $(NOISE_SELECTORS).remove()
  $('*').contents().each(function () {
    if (this.type === 'comment') $(this).remove()
  })

  const root = pickRoot($)

  // turn block-level breaks into paragraph separators so .text() doesn't smash everything together
  root.find('br').replaceWith('\n')
  root.find('p, li, h1, h2, h3, h4, h5, h6, tr, blockquote, pre, div').each(function () {
    const $el = $(this)
    $el.append('\n\n')
  })

  const text = clean(root.text())

  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 30 && !isLikelyBoilerplate(p))

  const chunks = chunkParagraphs(paragraphs).map(t => ({
    text: t,
    metadata: { source },
  }))

  return { title, chunks }
}
