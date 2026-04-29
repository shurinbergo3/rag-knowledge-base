import { NextRequest, NextResponse } from 'next/server'
import { embedTexts } from '@/lib/embeddings'
import { searchQdrant } from '@/lib/qdrant'

export const maxDuration = 30

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('q')?.trim()
  const topK = Math.min(Math.max(Number(searchParams.get('top') ?? '5'), 1), 20)

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 })
  }

  try {
    const [queryVector] = await embedTexts([query])
    const results = await searchQdrant(queryVector, topK)
    return NextResponse.json({ results, query, count: results.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
