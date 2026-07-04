// YouTube Data API: server-side trending + publishing (OAuth + resumable upload).

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

const OAUTH = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  scope: 'https://www.googleapis.com/auth/youtube.upload',
}

export function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI)
}

export function authUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: OAUTH.scope,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${OAUTH.auth}?${params}`
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  })
  const res = await fetch(OAUTH.token, { method: 'POST', body })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description || 'Token exchange failed.')
  return json // { access_token, refresh_token, expires_in, ... }
}

export async function refreshToken(refresh_token) {
  const body = new URLSearchParams({
    refresh_token,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  })
  const res = await fetch(OAUTH.token, { method: 'POST', body })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description || 'Token refresh failed.')
  return json.access_token
}

/**
 * Upload a video buffer to YouTube as a Short via the resumable protocol.
 * @param {string} accessToken
 * @param {{title?:string, description?:string, tags?:string[], privacyStatus?:string}} meta
 * @param {Buffer} bytes
 */
export async function uploadVideo(accessToken, meta, bytes) {
  const metadata = {
    snippet: {
      title: (meta.title || 'Untitled clip').slice(0, 100),
      description: `${meta.description || ''}\n#Shorts`.trim(),
      tags: meta.tags || [],
    },
    status: { privacyStatus: meta.privacyStatus || 'private', selfDeclaredMadeForKids: false },
  }
  // 1) start a resumable session
  const start = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/*',
        'X-Upload-Content-Length': String(bytes.length),
      },
      body: JSON.stringify(metadata),
    },
  )
  if (!start.ok) {
    const t = await start.text().catch(() => '')
    throw new Error(`Failed to start upload (${start.status}): ${t.slice(0, 300)}`)
  }
  const uploadUrl = start.headers.get('location')
  if (!uploadUrl) throw new Error('No upload URL returned by YouTube.')

  // 2) send the bytes
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/*', 'Content-Length': String(bytes.length) },
    body: bytes,
  })
  const json = await put.json().catch(() => ({}))
  if (!put.ok) throw new Error(json.error?.message || `Upload failed (${put.status}).`)
  return { id: json.id, url: json.id ? `https://youtube.com/shorts/${json.id}` : undefined }
}
