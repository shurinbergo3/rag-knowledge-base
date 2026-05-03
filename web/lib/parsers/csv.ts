import type { Chunk } from '../types'

export async function parseCsv(buffer: Buffer, filename: string): Promise<Chunk[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]
  if (!ws || !ws['!ref']) return []

  const range = XLSX.utils.decode_range(ws['!ref'])
  const headers: string[] = []
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })]
    headers.push(cell && cell.v != null ? String(cell.v).trim() : '')
  }

  const chunks: Chunk[] = []
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const parts: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = headers[c - range.s.c]
      if (!header) continue
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell || cell.v === null || cell.v === undefined || cell.v === '') continue
      const v = String(cell.v).trim()
      if (!v) continue
      parts.push(`${header}: ${v}`)
    }
    if (parts.length === 0) continue
    chunks.push({
      text: parts.join('\n'),
      metadata: { source: filename, row: r + 1 },
    })
  }

  return chunks
}
