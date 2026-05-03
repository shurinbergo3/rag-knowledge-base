import type { Chunk } from '../types'
import { chunkParagraphs } from './chunking'

export async function parsePdf(buffer: Buffer, filename: string): Promise<Chunk[]> {
  // Dynamic import avoids pdf-parse's test-file require() at module load time
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)

  const paragraphs = data.text
    .split(/\n{2,}/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 20)

  return chunkParagraphs(paragraphs).map(text => ({
    text,
    metadata: { source: filename },
  }))
}
