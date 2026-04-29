import type { Chunk } from '../types'

export async function parseExcel(buffer: Buffer, filename: string): Promise<Chunk[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const chunks: Chunk[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const parts = Object.entries(row)
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => `${k}: ${String(v).trim()}`)
        .filter(p => p.length > 3)

      if (parts.length === 0) continue

      chunks.push({
        text: parts.join('\n'),
        metadata: { source: filename, sheet: sheetName, row: i + 2 },
      })
    }
  }

  return chunks
}
