export const API = process.env.NEXT_PUBLIC_API_URL || 'https://oms-backend.arvix1413.workers.dev'

export function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('oms_token')
}

export function setToken(t: string) { localStorage.setItem('oms_token', t) }
export function clearToken() { localStorage.removeItem('oms_token') }

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as any).error || res.statusText)
  }
  return res.json()
}
