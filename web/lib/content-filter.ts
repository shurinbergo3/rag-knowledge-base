import OpenAI from 'openai'
import type { Chunk } from './types'

const MODEL = 'gpt-4o-mini'
const BATCH_SIZE = 12
const MAX_CHARS_PER_ITEM = 600
const MAX_RETRIES = 2

let cachedClient: OpenAI | null = null

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  if (cachedClient) return cachedClient
  cachedClient = new OpenAI({ apiKey: key })
  return cachedClient
}

const SYSTEM_PROMPT = `You are a content classifier for a knowledge base.

For each numbered text chunk, decide if it contains substantive informational content that would be useful in a searchable knowledge base.

KEEP (true) — actual subject-matter content:
- Facts, definitions, instructions, procedures, requirements
- Lists of documents/conditions/steps with real information
- Explanations, descriptions, data, prices, dates, addresses
- Article body text, FAQ answers, official notices

DROP (false) — boilerplate / system text / noise:
- Navigation menus, breadcrumbs, "skip to content"
- Cookie notices, GDPR / privacy banners
- Login/register prompts, "JavaScript required" messages
- Footer copyright, "all rights reserved", legal disclaimers
- Ads, "advertisement", promotional CTAs ("buy now", "subscribe")
- Social share buttons text ("share on Facebook", "follow us")
- Related-articles teasers (just titles + dates with no body)
- Pagination ("page 1 of 10", "next page")
- Generic UI labels ("search", "menu", "back to top")
- 404/error page text, "page not found"
- Author/byline boxes with no biographical substance
- Comment-section UI text

Respond ONLY with JSON: {"decisions":[true,false,true,...]}
The array length MUST equal the number of input chunks. No prose, no explanation.`

interface FilterResult {
  kept: Chunk[]
  dropped: number
  totalScanned: number
}

async function classifyBatch(texts: string[]): Promise<boolean[]> {
  const client = getClient()
  const numbered = texts.map((t, i) => `[${i + 1}] ${t.slice(0, MAX_CHARS_PER_ITEM)}`).join('\n\n')

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: numbered },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      })

      const content = resp.choices[0]?.message?.content ?? '{}'
      const parsed = JSON.parse(content)
      const decisions: unknown[] | null = Array.isArray(parsed.decisions) ? parsed.decisions : null
      if (!decisions || decisions.length !== texts.length) {
        throw new Error(`Bad decisions array (got ${decisions?.length}, expected ${texts.length})`)
      }
      return decisions.map(Boolean)
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        // fall back: keep everything if classifier fails
        console.error('[content-filter] giving up, keeping all:', err)
        return texts.map(() => true)
      }
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  return texts.map(() => true)
}

export async function filterChunks(
  chunks: Chunk[],
  onProgress?: (done: number, total: number) => void,
): Promise<FilterResult> {
  if (chunks.length === 0) {
    return { kept: [], dropped: 0, totalScanned: 0 }
  }

  const decisions: boolean[] = []
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE).map(c => c.text)
    const batchDecisions = await classifyBatch(batch)
    decisions.push(...batchDecisions)
    onProgress?.(Math.min(i + BATCH_SIZE, chunks.length), chunks.length)
  }

  const kept = chunks.filter((_, i) => decisions[i])
  return {
    kept,
    dropped: chunks.length - kept.length,
    totalScanned: chunks.length,
  }
}
