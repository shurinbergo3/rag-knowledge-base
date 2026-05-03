export const CHUNK_SIZE = 800
export const CHUNK_OVERLAP = 100
export const HARD_LIMIT = 4000

export function splitParagraph(p: string, hardLimit = HARD_LIMIT): string[] {
  if (p.length <= hardLimit) return [p]
  const out: string[] = []
  for (let i = 0; i < p.length; i += hardLimit) {
    out.push(p.slice(i, i + hardLimit))
  }
  return out
}

export function chunkParagraphs(
  paragraphs: string[],
  options: { chunkSize?: number; overlap?: number; minLen?: number; joiner?: string } = {},
): string[] {
  const chunkSize = options.chunkSize ?? CHUNK_SIZE
  const overlap = options.overlap ?? CHUNK_OVERLAP
  const minLen = options.minLen ?? 10
  const joiner = options.joiner ?? '\n\n'

  const chunks: string[] = []
  let current = ''

  const push = () => {
    const trimmed = current.trim()
    if (trimmed.length >= minLen) chunks.push(trimmed)
  }

  for (const raw of paragraphs) {
    for (const para of splitParagraph(raw)) {
      if (current.length + para.length > chunkSize && current.length > 0) {
        push()
        const tail = overlap > 0 ? current.slice(-overlap) : ''
        current = tail ? tail + joiner + para : para
      } else {
        current += (current ? joiner : '') + para
      }
    }
  }

  push()
  return chunks
}
