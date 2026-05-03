import { NextRequest, NextResponse } from 'next/server'
import { ensureCollection, listProjects, deleteProject, isValidProjectName } from '@/lib/qdrant'
import { isAuthorized } from '@/lib/auth'

export const maxDuration = 30

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const projects = await listProjects()
    return NextResponse.json({ projects })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list projects'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name ?? '').trim()
    if (!isValidProjectName(name)) {
      return NextResponse.json(
        { error: 'Invalid name. Use 1–48 chars: letters, digits, "-", "_".' },
        { status: 400 },
      )
    }
    await ensureCollection(name)
    return NextResponse.json({ ok: true, name })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create project'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const name = request.nextUrl.searchParams.get('name')?.trim() ?? ''
    if (!isValidProjectName(name)) {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 })
    }
    await deleteProject(name)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete project'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
