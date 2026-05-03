import type { Chunk } from '../types'
import { chunkParagraphs } from './chunking'

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
  return chunkParagraphs(paragraphs).map(t => ({
    text: t,
    metadata: { source: filename },
  }))
}
