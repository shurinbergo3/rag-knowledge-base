import { NextRequest, NextResponse } from 'next/server'
import { parseFile } from '@/lib/parsers'
import { embedTexts } from '@/lib/embeddings'
import { ensureCollection, upsertChunks, defaultProject, isValidProjectName } from '@/lib/qdrant'
import { isAuthorized } from '@/lib/auth'
import type { UploadProgress } from '@/lib/types'

export const maxDuration = 60

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const MAX_CHUNKS = 10_000

const ALLOWED_EXT = [
  '.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc', '.md', '.markdown', '.txt',
]

function sse(data: UploadProgress): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return ALLOWED_EXT.some(ext => lower.endsWith(ext))
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit` },
      { status: 413 },
    )
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
        const formData = await request.formData()
        const file = formData.get('file')
        const projectField = String(formData.get('project') ?? '').trim()
        const project = projectField || defaultProject()

        if (!isValidProjectName(project)) {
          send({ step: 'error', status: 'error', message: 'Invalid project name' })
          return
        }

        if (!(file instanceof File)) {
          send({ step: 'error', status: 'error', message: 'No file provided' })
          return
        }

        if (file.size === 0) {
          send({ step: 'error', status: 'error', message: 'File is empty' })
          return
        }

        if (file.size > MAX_UPLOAD_BYTES) {
          send({ step: 'error', status: 'error', message: `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit` })
          return
        }

        if (!hasAllowedExtension(file.name)) {
          send({ step: 'error', status: 'error', message: 'Unsupported file type' })
          return
        }

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const filename = file.name

        send({ step: 'parse', status: 'running' })

        const chunks = await parseFile(buffer, filename)

        if (chunks.length === 0) {
          send({ step: 'error', status: 'error', message: 'No content could be extracted from this file.' })
          return
        }

        if (chunks.length > MAX_CHUNKS) {
          send({ step: 'error', status: 'error', message: `Too many chunks (${chunks.length} > ${MAX_CHUNKS})` })
          return
        }

        send({ step: 'parse', status: 'done', chunkCount: chunks.length })

        send({ step: 'embed', status: 'running', chunkCount: chunks.length })
        const texts = chunks.map(c => c.text)
        const vectors = await embedTexts(texts)
        send({ step: 'embed', status: 'done', chunkCount: chunks.length })

        send({ step: 'upload', status: 'running', chunkCount: chunks.length })
        await ensureCollection(project)
        await upsertChunks(project, chunks, vectors)
        send({ step: 'upload', status: 'done', chunkCount: chunks.length })

        send({
          step: 'complete',
          status: 'done',
          chunkCount: chunks.length,
          chunks: chunks.slice(0, 20),
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
