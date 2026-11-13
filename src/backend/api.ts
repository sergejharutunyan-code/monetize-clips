import type { Clip, Platform } from '../types'

export interface BackendSettings {
  apiUrl: string
  token: string
  email: string
}

const KEY = 'clipforge.backend.v1'
const DEFAULTS: BackendSettings = { apiUrl: '', token: '', email: '' }
const CHANGED = 'clipforge:backend-changed'

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
  window.dispatchEvent(new Event(CHANGED))
}

/** Subscribe to sign-in / sign-out / URL changes made anywhere in the app. */
export function onBackendChange(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn)
  return () => window.removeEventListener(CHANGED, fn)
}

export const isSignedIn = (s: BackendSettings) => Boolean(s.apiUrl && s.token)

const base = (apiUrl: string) => apiUrl.trim().replace(/\/+$/, '')

/** Turn a backend-relative path (e.g. a clip's /media/… URL) into a full URL. */
export const absoluteUrl = (apiUrl: string, path: string) => (/^https?:/.test(path) ? path : `${base(apiUrl)}${path}`)

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function api<T>(
  apiUrl: string,
  path: string,
  opts: RequestInit & { token?: string; timeoutMs?: number } = {},
): Promise<T> {
  const { token, headers, timeoutMs, ...rest } = opts
  let res: Response
  try {
    res = await fetch(`${base(apiUrl)}${path}`, {
      ...rest,
      headers: {
        ...(headers || {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      // Generous: a sleeping free-tier host can take a minute to wake up.
      signal: AbortSignal.timeout(timeoutMs ?? 75_000),
    })
  } catch {
    throw new ApiError('Could not reach the backend. Check the URL and that it is running (a sleeping host can take a minute to wake).', 0)
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      res.status === 401 && token
        ? 'Your backend session has expired. Sign in again in Accounts.'
        : (json as { error?: string }).error || `Request failed (${res.status}).`
    throw new ApiError(msg, res.status)
  }
  return json as T
}

const jsonBody = (data: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
})

// ---- service ----

export interface Health {
  ok: boolean
  app?: string
  ffmpeg?: boolean
  anthropic?: boolean
  youtubeTrending?: boolean
  publish?: Record<Platform, boolean>
}

export const health = (apiUrl: string, timeoutMs = 75_000) => api<Health>(apiUrl, '/health', { timeoutMs })

// ---- accounts ----

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

// ---- platform connections ----

export interface PlatformConnection {
  label: string
  /** The backend has this platform's app credentials. */
  configured: boolean
  /** You have linked your account on this platform. */
  connected: boolean
  account?: string
  scopes?: string[]
  /** The redirect URI to register in the platform's developer console. */
  redirectUri: string
  setup?: string
}

export interface ConnectionsInfo {
  platforms: Record<Platform, PlatformConnection>
  server: { ffmpeg: boolean; publicUrl: string; reachable: boolean }
}

export const getConnections = (apiUrl: string, token: string) => api<ConnectionsInfo>(apiUrl, '/api/connections', { token })

/** The platform's sign-in page; send the browser there, it comes back to `returnUrl`. */
export const connectUrl = (apiUrl: string, token: string, platform: Platform, returnUrl: string) =>
  api<{ url: string }>(apiUrl, `/api/connections/${platform}/start?return=${encodeURIComponent(returnUrl)}`, { token }).then((r) => r.url)

export const disconnect = (apiUrl: string, token: string, platform: Platform) =>
  api<{ ok: boolean }>(apiUrl, `/api/connections/${platform}`, { method: 'DELETE', token })

// ---- clip video storage ----

export interface ServerMedia {
  id: string
  status: 'processing' | 'ready' | 'failed'
  error?: string
  /** 0…1 while converting. */
  progress?: number
  /** Path relative to the backend URL. */
  url?: string
  mime?: string
  size?: number
  duration?: number
  width?: number
  height?: number
  normalized: boolean
}

/** Upload a rendered clip. Uses XHR for upload progress. */
export function uploadMedia(apiUrl: string, token: string, blob: Blob, onProgress?: (fraction: number) => void): Promise<ServerMedia> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${base(apiUrl)}/api/media`)
    xhr.setRequestHeader('authorization', `Bearer ${token}`)
    xhr.setRequestHeader('content-type', (blob.type || 'video/webm').split(';')[0])
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onerror = () => reject(new ApiError('Upload failed — could not reach the backend.', 0))
    xhr.ontimeout = () => reject(new ApiError('Upload timed out.', 0))
    xhr.onload = () => {
      let json: { media?: ServerMedia; error?: string } = {}
      try {
        json = JSON.parse(xhr.responseText)
      } catch {
        // ignore
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.media) resolve(json.media)
      else if (xhr.status === 401) reject(new ApiError('Your backend session has expired. Sign in again in Accounts.', 401))
      else reject(new ApiError(json.error || `Upload failed (${xhr.status}).`, xhr.status))
    }
    xhr.send(blob)
  })
}

export const getMedia = (apiUrl: string, token: string, id: string) =>
  api<{ media: ServerMedia }>(apiUrl, `/api/media/${encodeURIComponent(id)}`, { token }).then((r) => r.media)

export const deleteMedia = (apiUrl: string, token: string, id: string) =>
  api<{ ok: boolean }>(apiUrl, `/api/media/${encodeURIComponent(id)}`, { method: 'DELETE', token })

// ---- publishing ----

export type YouTubePrivacy = 'private' | 'unlisted' | 'public'
export type TikTokPrivacy = 'SELF_ONLY' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'PUBLIC_TO_EVERYONE'

export type PublishTarget =
  | { platform: 'youtube'; privacy: YouTubePrivacy }
  | { platform: 'instagram'; shareToFeed: boolean }
  | { platform: 'tiktok'; mode: 'direct' | 'inbox'; privacy: TikTokPrivacy }

export interface PublishJob {
  id: string
  clipId?: string
  mediaId: string
  platform: Platform
  status: 'queued' | 'running' | 'published' | 'failed' | 'canceled'
  runAt: string
  progress?: string
  url?: string
  externalId?: string
  /** Delivered but not live (TikTok inbox draft). */
  draft?: boolean
  note?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export interface PublishRequest {
  mediaId: string
  clipId?: string
  title: string
  caption: string
  tags?: string[]
  /** ISO time; omit to publish now. */
  scheduledAt?: string
  targets: PublishTarget[]
}

export const createPublish = (apiUrl: string, token: string, req: PublishRequest) =>
  api<{ jobs: PublishJob[] }>(apiUrl, '/api/publish', { ...jsonBody(req), token }).then((r) => r.jobs)

export const getJobs = (apiUrl: string, token: string, ids: string[]) =>
  api<{ jobs: PublishJob[] }>(apiUrl, `/api/jobs?ids=${ids.map(encodeURIComponent).join(',')}`, { token, timeoutMs: 20_000 }).then((r) => r.jobs)

export const cancelJob = (apiUrl: string, token: string, id: string) =>
  api<{ job: PublishJob }>(apiUrl, `/api/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST', token }).then((r) => r.job)

export const retryJob = (apiUrl: string, token: string, id: string) =>
  api<{ job: PublishJob }>(apiUrl, `/api/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST', token }).then((r) => r.job)
