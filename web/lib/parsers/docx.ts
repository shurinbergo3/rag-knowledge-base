import type { Chunk } from '../types'
import { chunkParagraphs } from './chunking'

export async function parseDocx(buffer: Buffer, filename: string): Promise<Chunk[]> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  const paragraphs = result.value
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 20)

  return chunkParagraphs(paragraphs, { joiner: '\n', minLen: 20 }).map(text => ({
    text,
    metadata: { source: filename },
  }))
}
