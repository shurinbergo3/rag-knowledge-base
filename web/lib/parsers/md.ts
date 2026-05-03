import type { Chunk } from '../types'

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
}

export function parseMarkdown(buffer: Buffer, filename: string): Chunk[] {
  const text = stripMarkdown(buffer.toString('utf-8'))
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 10)
  const chunks: Chunk[] = []
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length > CHUNK_SIZE && current.length > 0) {
      chunks.push({ text: current.trim(), metadata: { source: filename } })
      current = current.slice(-CHUNK_OVERLAP) + '\n\n' + para
    } else {
      current += (current ? '\n\n' : '') + para
    }
  }

  if (current.trim().length > 10) {
    chunks.push({ text: current.trim(), metadata: { source: filename } })
  }

  return chunks
}
