import type { NextRequest } from 'next/server'

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.API_SECRET
  if (!expected) return false

  const header = request.headers.get('x-api-secret') ?? ''
  if (header && timingSafeEqual(header, expected)) return true

  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) {
    return timingSafeEqual(auth.slice(7), expected)
  }

  return false
}
