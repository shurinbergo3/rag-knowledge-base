const STORAGE_KEY = 'rag_api_secret'

export function getSecret(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

export function setSecret(secret: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, secret)
}

export function clearSecret(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export class UnauthorizedError extends Error {
  constructor() { super('Unauthorized') }
}

export async function fetchWithAuth(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const secret = getSecret()
  const headers = new Headers(init.headers)
  if (secret) headers.set('x-api-secret', secret)

  const res = await fetch(input, { ...init, headers })
  if (res.status === 401) {
    clearSecret()
    window.dispatchEvent(new Event('rag:unauthorized'))
    throw new UnauthorizedError()
  }
  return res
}
