import type { Chunk } from '../types'

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100

function splitIntoChunks(text: string, source: string): Chunk[] {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20)
  const chunks: Chunk[] = []
  let current = ''
  let pageEstimate = 1

  for (const para of paragraphs) {
    if (current.length + para.length > CHUNK_SIZE && current.length > 0) {
      chunks.push({ text: current.trim(), metadata: { source, page: pageEstimate } })
      current = current.slice(-CHUNK_OVERLAP) + '\n' + para
      pageEstimate++
    } else {
      current += (current ? '\n\n' : '') + para
    }
  }

  if (current.trim().length > 20) {
    chunks.push({ text: current.trim(), metadata: { source, page: pageEstimate } })
  }

  return chunks
}

export async function parsePdf(buffer: Buffer, filename: string): Promise<Chunk[]> {
  // Dynamic import avoids pdf-parse's test-file require() at module load time
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return splitIntoChunks(data.text, filename)
}
