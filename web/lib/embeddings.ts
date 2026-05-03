import OpenAI from 'openai'

const MODEL = 'text-embedding-3-small'
const BATCH_SIZE = 100
// text-embedding-3-small accepts up to 8191 tokens; ~4 chars/token is a safe heuristic
const MAX_CHARS_PER_INPUT = 24_000
const MAX_RETRIES = 4
const BASE_BACKOFF_MS = 500

let cachedClient: OpenAI | null = null
let cachedKey: string | undefined

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  if (cachedClient && cachedKey === key) return cachedClient
  cachedClient = new OpenAI({ apiKey: key })
  cachedKey = key
  return cachedClient
}

function truncate(text: string): string {
  return text.length <= MAX_CHARS_PER_INPUT ? text : text.slice(0, MAX_CHARS_PER_INPUT)
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; code?: string }
  if (!e) return false
  if (e.status === 429) return true
  if (typeof e.status === 'number' && e.status >= 500) return true
  if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'EAI_AGAIN') return true
  return false
}

async function embedBatch(client: OpenAI, batch: string[]): Promise<number[][]> {
  let attempt = 0
  for (;;) {
    try {
      const response = await client.embeddings.create({ model: MODEL, input: batch })
      return response.data.map(d => d.embedding)
    } catch (err) {
      attempt++
      if (attempt > MAX_RETRIES || !isRetryable(err)) throw err
      const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 200
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const client = getClient()
  const safe = texts.map(t => truncate(t || ' '))
  const results: number[][] = []

  for (let i = 0; i < safe.length; i += BATCH_SIZE) {
    const batch = safe.slice(i, i + BATCH_SIZE)
    results.push(...(await embedBatch(client, batch)))
  }

  return results
}
