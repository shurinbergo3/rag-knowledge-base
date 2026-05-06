import { NextRequest, NextResponse } from 'next/server'
import { embedTexts } from '@/lib/embeddings'
import { ensureCollection, upsertChunks, isValidProjectName } from '@/lib/qdrant'
import { isAuthorized } from '@/lib/auth'
import type { Chunk } from '@/lib/types'

export const maxDuration = 60

const MAX_CHUNKS = 10_000
const MAX_CHARS_PER_CHUNK = 24_000

interface CommitBody {
  project?: unknown
  chunks?: unknown
}

function sanitizeChunk(raw: unknown): Chunk | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { text?: unknown; metadata?: unknown }
  const text = typeof r.text === 'string' ? r.text.slice(0, MAX_CHARS_PER_CHUNK) : ''
  if (text.trim().length < 5) return null

  const meta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>
  const source = typeof meta.source === 'string' ? meta.source : 'unknown'

  const out: Chunk = { text, metadata: { source } }
  if (typeof meta.sheet === 'string') out.metadata.sheet = meta.sheet
  if (typeof meta.page === 'number') out.metadata.page = meta.page
  if (typeof meta.row === 'number') out.metadata.row = meta.row
  return out
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as CommitBody | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const project = String(body.project ?? '').trim()
  if (!isValidProjectName(project)) {
    return NextResponse.json({ error: 'Invalid project name' }, { status: 400 })
  }

  if (!Array.isArray(body.chunks)) {
    return NextResponse.json({ error: 'chunks must be an array' }, { status: 400 })
  }

  const chunks = body.chunks
    .map(sanitizeChunk)
    .filter((c): c is Chunk => c !== null)

  if (chunks.length === 0) {
    return NextResponse.json({ error: 'No valid chunks to commit' }, { status: 400 })
  }
  if (chunks.length > MAX_CHUNKS) {
    return NextResponse.json({ error: `Too many chunks (${chunks.length} > ${MAX_CHUNKS})` }, { status: 413 })
  }

  try {
    const vectors = await embedTexts(chunks.map(c => c.text))
    await ensureCollection(project)
    await upsertChunks(project, chunks, vectors)
    return NextResponse.json({ ok: true, chunkCount: chunks.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Commit failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
