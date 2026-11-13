// YouTube Data API: server-side trending + publishing (OAuth + resumable upload).

import { openAsBlob } from 'node:fs'
import { call, clip, fileSize, PlatformError } from './http.mjs'

const CATEGORY_TO_NICHE = {
  '17': 'Sports', '20': 'Gaming', '10': 'Music', '23': 'Comedy', '24': 'Comedy',
  '1': 'Comedy', '28': 'Tech', '25': 'Educational', '27': 'Educational',
  '26': 'Educational', '22': 'Podcast',
}

const firstSentence = (text, max = 140) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const cut = clean.slice(0, max)
  return cut.length < clean.length ? `${cut.trimEnd()}…` : cut
}

export function mapItems(json) {
  return (json.items ?? [])
    .filter((it) => it.id && it.snippet?.title)
    .map((it) => {
      const s = it.snippet
      const thumb = s.thumbnails?.medium?.url ?? s.thumbnails?.high?.url ?? s.thumbnails?.default?.url
      const views = it.statistics?.viewCount ? Number(it.statistics.viewCount) : undefined
      return {
        id: it.id,
        title: s.title,
        creator: s.channelTitle ?? 'YouTube',
        origin: 'youtube',
        url: `https://www.youtube.com/watch?v=${it.id}`,
        niche: CATEGORY_TO_NICHE[s.categoryId ?? ''] ?? 'Educational',
        why: firstSentence(s.description) || `Trending on ${s.channelTitle ?? 'YouTube'}.`,
        thumbGlyph: '▶',
        thumbUrl: thumb,
        views: Number.isFinite(views) ? views : undefined,
        publishedAt: s.publishedAt,
      }
    })
}

export async function fetchTrending({ region = 'US', categoryId = '' } = {}) {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw Object.assign(new Error('YOUTUBE_API_KEY is not configured on the server.'), { status: 501 })
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    maxResults: '12',
    regionCode: String(region).toUpperCase(),
    key,
  })
  if (categoryId) params.set('videoCategoryId', categoryId)
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error?.message || `YouTube error ${res.status}`), { status: 502 })
  return mapItems(json)
}

// ---- Publishing (OAuth 2.0 + resumable upload) ----

const AUTH_URL = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'
const UPLOAD_URL = () =>
  `${(process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com').replace(/\/+$/, '')}/upload/youtube/v3/videos`
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload'

export const label = 'YouTube'

export function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function authUrl(state, redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${AUTH_URL()}?${params}`
}

async function tokenRequest(params, what) {
  const r = await call(TOKEN_URL(), {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  })
  if (!r.ok || !r.json?.access_token) {
    const reason = r.json?.error_description || r.json?.error || `HTTP ${r.status}`
    throw new PlatformError(`YouTube ${what} failed: ${reason}`, { code: r.json?.error })
  }
  return r.json
}

export async function exchangeCode(code, redirectUri) {
  const j = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' }, 'sign-in')
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    scope: j.scope,
  }
}

export const needsRefresh = (t) => !t.expires_at || t.expires_at - Date.now() < 5 * 60 * 1000

export async function refresh(t) {
  if (!t.refresh_token) {
    throw new PlatformError('Your YouTube connection has expired. Reconnect YouTube in Accounts.', { code: 'reconnect' })
  }
  let j
  try {
    j = await tokenRequest({ refresh_token: t.refresh_token, grant_type: 'refresh_token' }, 'token refresh')
  } catch (e) {
    if (e.code === 'invalid_grant') {
      throw new PlatformError('YouTube access was revoked or expired. Reconnect YouTube in Accounts.', { code: 'reconnect' })
    }
    throw e
  }
  return { ...t, access_token: j.access_token, expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000 }
}

const REASONS = {
  youtubeSignupRequired: 'This Google account has no YouTube channel yet. Create a channel on youtube.com, then try again.',
  uploadLimitExceeded: 'YouTube says this channel has hit its upload limit for now. Try again later.',
  quotaExceeded: 'The YouTube API quota for this Google Cloud project is used up for today.',
  forbidden: 'YouTube refused the upload for this account.',
}

function ytError(r, fallback) {
  const err = r.json?.error
  const reason = err?.errors?.[0]?.reason
  return new PlatformError(REASONS[reason] || err?.message || `${fallback} (HTTP ${r.status}).`, { code: reason, status: r.status })
}

/**
 * Upload a clip as a YouTube video (vertical clips up to 3 minutes become Shorts).
 * @param {{access_token:string}} tokens
 * @param {{title?:string, caption?:string, tags?:string[], privacy?:string}} opts
 * @param {{path:string, mime:string, width?:number, height?:number, duration?:number}} media
 */
export async function publish(tokens, opts, media, { onProgress } = {}) {
  const size = await fileSize(media.path)
  const privacy = ['private', 'unlisted', 'public'].includes(opts.privacy) ? opts.privacy : 'private'
  const description = clip(opts.caption || '', 4900)
  // Vertical or square and up to 3 minutes is what YouTube treats as a Short.
  const isShort = (media.height ?? 1) >= (media.width ?? 0) && (media.duration ?? 0) <= 180
  const metadata = {
    snippet: {
      title: clip((opts.title || 'Untitled clip').replace(/[<>]/g, ''), 100),
      description:
        !isShort || /#shorts\b/i.test(`${opts.title} ${description}`) ? description : `${description}\n\n#Shorts`.trim(),
      tags: (opts.tags || []).map((t) => String(t).replace(/^#/, '')).filter(Boolean).slice(0, 30),
      categoryId: '22',
    },
    status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
  }

  onProgress?.('Starting YouTube upload')
  const start = await call(`${UPLOAD_URL()}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': media.mime,
      'X-Upload-Content-Length': String(size),
    },
    body: JSON.stringify(metadata),
  })
  if (!start.ok) throw ytError(start, 'YouTube would not start the upload')
  const uploadUrl = start.headers.get('location')
  if (!uploadUrl) throw new PlatformError('YouTube did not return an upload URL.')

  onProgress?.('Uploading video to YouTube')
  const put = await call(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': media.mime, 'Content-Length': String(size) },
    body: await openAsBlob(media.path, { type: media.mime }),
    timeoutMs: 30 * 60 * 1000,
  })
  if (!put.ok || !put.json?.id) throw ytError(put, 'YouTube upload failed')

  const id = put.json.id
  const actual = put.json.status?.privacyStatus
  return {
    id,
    url: isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    account: put.json.snippet?.channelTitle ? { id: put.json.snippet.channelId, name: put.json.snippet.channelTitle } : undefined,
    note:
      actual && actual !== privacy
        ? `YouTube set this video to ${actual} (unverified API projects can only upload private videos).`
        : privacy === 'public' ? undefined : `Uploaded as ${privacy}.`,
  }
}
