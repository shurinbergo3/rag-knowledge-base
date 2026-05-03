import { NextRequest, NextResponse } from 'next/server'
import { embedTexts } from '@/lib/embeddings'
import { searchQdrant, defaultProject, isValidProjectName } from '@/lib/qdrant'
import { isAuthorized } from '@/lib/auth'

export const maxDuration = 30

const MAX_QUERY_LEN = 1000

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const query = searchParams.get('q')?.trim() ?? ''
  const topK = Math.min(Math.max(Number(searchParams.get('top') ?? '5') || 5, 1), 20)
  const project = (searchParams.get('project')?.trim() || defaultProject())

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 })
  }
  if (query.length > MAX_QUERY_LEN) {
    return NextResponse.json({ error: `Query exceeds ${MAX_QUERY_LEN} characters` }, { status: 400 })
  }
  if (!isValidProjectName(project)) {
    return NextResponse.json({ error: 'Invalid project name' }, { status: 400 })
  }

  try {
    const [queryVector] = await embedTexts([query])
    const results = await searchQdrant(project, queryVector, topK)
    return NextResponse.json({ results, query, count: results.length, project })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
