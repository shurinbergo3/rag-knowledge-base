import type { Chunk } from '../types'

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100

function splitText(text: string, source: string): Chunk[] {
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 20)
  const chunks: Chunk[] = []
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length > CHUNK_SIZE && current.length > 0) {
      chunks.push({ text: current.trim(), metadata: { source } })
      current = current.slice(-CHUNK_OVERLAP) + '\n' + para
    } else {
      current += (current ? '\n' : '') + para
    }
  }

  if (current.trim().length > 20) {
    chunks.push({ text: current.trim(), metadata: { source } })
  }

  return chunks
}

export async function parseDocx(buffer: Buffer, filename: string): Promise<Chunk[]> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return splitText(result.value, filename)
}
