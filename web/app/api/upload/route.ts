import { NextRequest } from 'next/server'
import { parseFile } from '@/lib/parsers'
import { embedTexts } from '@/lib/embeddings'
import { ensureCollection, upsertChunks } from '@/lib/qdrant'
import type { UploadProgress } from '@/lib/types'

export const maxDuration = 60

function sse(data: UploadProgress): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: UploadProgress) => {
        controller.enqueue(encoder.encode(sse(data)))
      }

      try {
        // ── Parse form data ──
        const formData = await request.formData()
        const file = formData.get('file') as File | null

        if (!file) {
          send({ step: 'error', status: 'error', message: 'No file provided' })
          controller.close()
          return
        }

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const filename = file.name

        // ── Step 1: Parse ──
        send({ step: 'parse', status: 'running' })

        const chunks = await parseFile(buffer, filename)

        if (chunks.length === 0) {
          send({ step: 'error', status: 'error', message: 'No content could be extracted from this file.' })
          controller.close()
          return
        }

        send({ step: 'parse', status: 'done', chunkCount: chunks.length })

        // ── Step 2: Embed ──
        send({ step: 'embed', status: 'running', chunkCount: chunks.length })

        const texts = chunks.map(c => c.text)
        const vectors = await embedTexts(texts)

        send({ step: 'embed', status: 'done', chunkCount: chunks.length })

        // ── Step 3: Upload to Qdrant ──
        send({ step: 'upload', status: 'running', chunkCount: chunks.length })

        await ensureCollection()
        await upsertChunks(chunks, vectors)

        send({ step: 'upload', status: 'done', chunkCount: chunks.length })

        // ── Done ──
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
        controller.close()
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
