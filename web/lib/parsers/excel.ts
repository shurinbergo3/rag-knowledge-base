import type { Chunk } from '../types'

export async function parseExcel(buffer: Buffer, filename: string): Promise<Chunk[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const chunks: Chunk[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws || !ws['!ref']) continue
    chunks.push(...rowsFromSheet(XLSX, ws, sheetName, filename))
  }

  return chunks
}

function rowsFromSheet(
  XLSX: typeof import('xlsx'),
  ws: import('xlsx').WorkSheet,
  sheetName: string | null,
  filename: string,
): Chunk[] {
  const range = XLSX.utils.decode_range(ws['!ref'] as string)
  const headers: string[] = []
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })]
    headers.push(cell && cell.v != null ? String(cell.v).trim() : '')
  }

  const out: Chunk[] = []
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
    out.push({
      text: parts.join('\n'),
      metadata: {
        source: filename,
        ...(sheetName ? { sheet: sheetName } : {}),
        row: r + 1,
      },
    })
  }
  return out
}

export const __test__ = { rowsFromSheet }
