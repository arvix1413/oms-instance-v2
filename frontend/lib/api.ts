export const API = process.env.NEXT_PUBLIC_API_URL || 'https://oms-backend.arvix1413.workers.dev'

export function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('oms_token')
}

export function setToken(t: string) { localStorage.setItem('oms_token', t) }
export function clearToken() { localStorage.removeItem('oms_token') }

/** Get the current user's full signature URL (handles relative paths) */
export function getSignatureUrl(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const user = JSON.parse(localStorage.getItem('oms_user') || 'null')
    if (!user?.signature_url) return null
    return user.signature_url.startsWith('http') ? user.signature_url : `${API}${user.signature_url}`
  } catch { return null }
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken()
  // Don't set Content-Type for FormData (let browser set multipart boundary)
  const isFormData = opts.body instanceof FormData
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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
