import type { Chunk } from '../types'
import { parseExcel } from './excel'
import { parsePdf } from './pdf'
import { parseDocx } from './docx'
import { parseTxt } from './txt'
import { parseCsv } from './csv'
import { parseMarkdown } from './md'

export async function parseFile(buffer: Buffer, filename: string): Promise<Chunk[]> {
  const name = filename.toLowerCase()

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseExcel(buffer, filename)
  }
  if (name.endsWith('.csv')) {
    return parseCsv(buffer, filename)
  }
  if (name.endsWith('.pdf')) {
    return parsePdf(buffer, filename)
  }
  if (name.endsWith('.docx') || name.endsWith('.doc')) {
    return parseDocx(buffer, filename)
  }
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    return parseMarkdown(buffer, filename)
  }
  if (name.endsWith('.txt')) {
    return parseTxt(buffer, filename)
  }

  throw new Error(`Unsupported file type: ${filename}`)
}
