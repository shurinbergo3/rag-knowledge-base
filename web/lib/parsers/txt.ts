import type { Chunk } from '../types'
import { chunkParagraphs } from './chunking'

export function parseTxt(buffer: Buffer, filename: string): Chunk[] {
  const text = buffer.toString('utf-8')
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 10)
  return chunkParagraphs(paragraphs).map(t => ({
    text: t,
    metadata: { source: filename },
  }))
}
