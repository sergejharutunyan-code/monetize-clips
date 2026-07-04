import type { Clip } from '../types'

export interface BackendSettings {
  apiUrl: string
  token: string
  email: string
}

const KEY = 'clipforge.backend.v1'
const DEFAULTS: BackendSettings = { apiUrl: '', token: '', email: '' }

export function loadBackend(): BackendSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<BackendSettings>) }
  } catch {
    // ignore
  }
  return { ...DEFAULTS }
}

export function saveBackend(s: BackendSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

const base = (apiUrl: string) => apiUrl.replace(/\/+$/, '')

async function api<T>(apiUrl: string, path: string, opts: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = opts
  const res = await fetch(`${base(apiUrl)}${path}`, {
    ...rest,
    headers: {
      ...(headers || {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status}).`)
  return json as T
}

const jsonBody = (data: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
})

export interface AuthResult { token: string; user: { id: string; email: string } }

export const register = (apiUrl: string, email: string, password: string) =>
  api<AuthResult>(apiUrl, '/api/auth/register', jsonBody({ email, password }))

export const login = (apiUrl: string, email: string, password: string) =>
  api<AuthResult>(apiUrl, '/api/auth/login', jsonBody({ email, password }))

export const logout = (apiUrl: string, token: string) =>
  api<{ ok: boolean }>(apiUrl, '/api/auth/logout', { method: 'POST', token }).catch(() => ({ ok: true }))

export const pullClips = (apiUrl: string, token: string) =>
  api<{ clips: Clip[] }>(apiUrl, '/api/clips', { token }).then((r) => r.clips)

export const pushClips = (apiUrl: string, token: string, clips: Clip[]) =>
  api<{ ok: boolean; count: number }>(apiUrl, '/api/clips', { ...jsonBody({ clips }), method: 'PUT', token })

export const youtubeStatus = (apiUrl: string, token: string) =>
  api<{ configured: boolean; connected: boolean }>(apiUrl, '/api/publish/youtube/status', { token })

export const youtubeConnectUrl = (apiUrl: string, token: string) =>
  api<{ url: string }>(apiUrl, '/api/publish/youtube/connect', { token }).then((r) => r.url)

export async function publishYouTube(
  apiUrl: string,
  token: string,
  blob: Blob,
  meta: { title: string; privacy: string },
): Promise<{ id?: string; url?: string }> {
  const q = new URLSearchParams({ title: meta.title, privacy: meta.privacy }).toString()
  const res = await fetch(`${base(apiUrl)}/api/publish/youtube?${q}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': blob.type || 'video/webm' },
    body: blob,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error || `Publish failed (${res.status}).`)
  return json as { id?: string; url?: string }
}
