import { NextRequest, NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
