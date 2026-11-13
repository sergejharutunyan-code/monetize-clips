// Instagram Reels publishing through the Instagram API with Instagram Login
// (Business Login). Needs a Meta app with the Instagram product and an Instagram
// professional (Business or Creator) account.
//
// Flow: create a REELS container -> Instagram ingests the video -> publish it.
// The video reaches Instagram either by public URL (`video_url`, which needs this
// server to be reachable over public HTTPS) or by a resumable upload.

import { openAsBlob } from 'node:fs'
import { call, clip, fileSize, pollUntil, PlatformError } from './http.mjs'
import { isPublicHttps } from '../config.mjs'

const AUTH_URL = () => process.env.INSTAGRAM_AUTH_URL || 'https://www.instagram.com/oauth/authorize'
const API_BASE = () => (process.env.INSTAGRAM_API_BASE || 'https://api.instagram.com').replace(/\/+$/, '')
const GRAPH = () => (process.env.INSTAGRAM_GRAPH_BASE || 'https://graph.instagram.com').replace(/\/+$/, '')
const VERSION = () => process.env.INSTAGRAM_API_VERSION ?? 'v23.0'
const graph = (path) => `${GRAPH()}${VERSION() ? `/${VERSION()}` : ''}${path}`
const SCOPES = 'instagram_business_basic,instagram_business_content_publish'
const POLL_MS = () => Number(process.env.CLIPFORGE_POLL_MS || 5000)

export const label = 'Instagram'

export function isConfigured() {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET)
}

export function authUrl(state, redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
  })
  return `${AUTH_URL()}?${params}`
}

function igError(r, fallback) {
  const e = r.json?.error
  const msg = e?.error_user_msg || e?.message || r.json?.error_message || `${fallback} (HTTP ${r.status}).`
  const expired = e?.code === 190
  return new PlatformError(expired ? 'Instagram access has expired or was revoked. Reconnect Instagram in Accounts.' : `Instagram: ${msg}`, {
    code: expired ? 'reconnect' : e?.code,
    status: r.status,
  })
}

export async function exchangeCode(code, redirectUri) {
  // Instagram appends "#_" to the code it redirects back with.
  const clean = String(code).replace(/#_$/, '')
  const short = await call(`${API_BASE()}/oauth/access_token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID,
      client_secret: process.env.INSTAGRAM_APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code: clean,
    }),
  })
  // The response is either flat or wrapped in { data: [ ... ] }.
  const s = short.json?.data?.[0] ?? short.json
  if (!short.ok || !s?.access_token) throw igError(short, 'Instagram sign-in failed')

  // Swap the 1-hour token for a 60-day one.
  const long = await call(
    `${GRAPH()}/access_token?${new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: process.env.INSTAGRAM_APP_SECRET,
      access_token: s.access_token,
    })}`,
  )
  if (!long.ok || !long.json?.access_token) throw igError(long, 'Instagram long-lived token exchange failed')
  const access_token = long.json.access_token

  const me = await call(`${graph('/me')}?${new URLSearchParams({ fields: 'user_id,username', access_token })}`)
  if (!me.ok) throw igError(me, 'Could not read the Instagram account')
  // Candidate ids for the publishing endpoints, most specific first.
  const ids = [...new Set([me.json?.user_id, me.json?.id, s.user_id].filter(Boolean).map(String))]
  return {
    access_token,
    obtained_at: Date.now(),
    expires_at: Date.now() + (Number(long.json.expires_in) || 60 * 86400) * 1000,
    account: { id: ids[0] || 'me', name: me.json?.username ? `@${me.json.username}` : 'Instagram account' },
    ig_ids: ids,
    scope: Array.isArray(s.permissions) ? s.permissions.join(',') : s.permissions,
  }
}

const DAY = 86400 * 1000

// Long-lived tokens last 60 days and can be refreshed once they are a day old.
export const needsRefresh = (t) =>
  Boolean(t.expires_at) && t.expires_at - Date.now() < 15 * DAY && Date.now() - (t.obtained_at || 0) > DAY

export async function refresh(t) {
  if (t.expires_at && t.expires_at < Date.now()) {
    throw new PlatformError('Your Instagram connection has expired. Reconnect Instagram in Accounts.', { code: 'reconnect' })
  }
  const r = await call(
    `${GRAPH()}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: t.access_token })}`,
  )
  if (!r.ok || !r.json?.access_token) throw igError(r, 'Instagram token refresh failed')
  return {
    ...t,
    access_token: r.json.access_token,
    obtained_at: Date.now(),
    expires_at: Date.now() + (Number(r.json.expires_in) || 60 * 86400) * 1000,
  }
}

const post = (url, token, params) =>
  call(url, { method: 'POST', body: new URLSearchParams({ ...params, access_token: token }) })

/** Create the Reels container, trying each known id for the account. */
async function createContainer(tokens, params) {
  const ids = [...new Set([...(tokens.ig_ids || []), tokens.account?.id, 'me'].filter(Boolean))]
  let last
  for (const id of ids) {
    const r = await post(graph(`/${id}/media`), tokens.access_token, params)
    if (r.ok && r.json?.id) return { igId: id, container: r.json }
    last = r
    // Only a "no such object" answer is worth retrying with another id.
    const e = r.json?.error
    const unknownObject = e?.code === 100 && (e?.error_subcode === 33 || /does not exist|unsupported (post|get) request/i.test(e?.message || ''))
    if (!unknownObject) break
  }
  throw igError(last, 'Instagram would not create the Reel')
}

async function waitForContainer(tokens, containerId, onProgress) {
  onProgress?.('Instagram is processing the video')
  return pollUntil(
    async () => {
      const r = await call(
        `${graph(`/${containerId}`)}?${new URLSearchParams({ fields: 'status_code,status', access_token: tokens.access_token })}`,
      )
      if (!r.ok) throw igError(r, 'Could not check the Reel status')
      const code = r.json?.status_code
      if (code === 'FINISHED' || code === 'PUBLISHED') return code
      if (code === 'ERROR' || code === 'EXPIRED') {
        throw new PlatformError(
          `Instagram could not process the video${r.json?.status ? `: ${r.json.status}` : '.'} ` +
            'Reels need an MP4 (H.264 + AAC), 3 seconds to 15 minutes long.',
          { code: 'container_error' },
        )
      }
      return undefined
    },
    { everyMs: POLL_MS(), timeoutMs: 15 * 60 * 1000, what: 'Instagram' },
  )
}

/**
 * Publish a clip as a Reel.
 * @param {{access_token:string, account?:{id:string}, ig_ids?:string[]}} tokens
 * @param {{caption?:string, shareToFeed?:boolean}} opts
 * @param {{path:string, mime:string, publicUrl?:string}} media
 */
export async function publish(tokens, opts, media, { onProgress } = {}) {
  if (media.mime !== 'video/mp4' && media.mime !== 'video/quicktime') {
    throw new PlatformError(
      'Instagram only accepts MP4 or MOV (H.264 + AAC). Install ffmpeg on the backend so clips are converted automatically.',
    )
  }
  const base = {
    media_type: 'REELS',
    caption: clip(opts.caption || '', 2200),
    share_to_feed: opts.shareToFeed === false ? 'false' : 'true',
  }
  const canPull = isPublicHttps(media.publicUrl)
  const setting = process.env.INSTAGRAM_UPLOAD_MODE || 'auto'
  const modes = setting === 'url' ? ['url'] : setting === 'resumable' ? ['resumable'] : canPull ? ['url', 'resumable'] : ['resumable']
  if (setting === 'url' && !canPull) {
    throw new PlatformError('Instagram needs to download the clip, so this backend must be reachable at a public HTTPS URL (set CLIPFORGE_PUBLIC_URL).')
  }

  let igId
  let containerId
  let lastError
  for (const mode of modes) {
    try {
      if (mode === 'url') {
        onProgress?.('Sending the clip to Instagram')
        const c = await createContainer(tokens, { ...base, video_url: media.publicUrl })
        igId = c.igId
        containerId = c.container.id
      } else {
        onProgress?.('Uploading the clip to Instagram')
        const c = await createContainer(tokens, { ...base, upload_type: 'resumable' })
        igId = c.igId
        containerId = c.container.id
        const size = await fileSize(media.path)
        const uploadUrl = c.container.uri || `https://rupload.facebook.com/ig-api-upload/${VERSION() || 'v23.0'}/${containerId}`
        const up = await call(uploadUrl, {
          method: 'POST',
          headers: { Authorization: `OAuth ${tokens.access_token}`, offset: '0', file_size: String(size) },
          body: await openAsBlob(media.path, { type: media.mime }),
          timeoutMs: 30 * 60 * 1000,
        })
        if (!up.ok || up.json?.success === false) throw igError(up, 'Instagram upload failed')
      }
      await waitForContainer(tokens, containerId, onProgress)
      lastError = undefined
      break
    } catch (e) {
      lastError = e
      containerId = undefined
      if (e.code === 'reconnect') break
    }
  }
  if (lastError) {
    // Only an upload problem is helped by switching to URL hand-off; a format problem is not.
    if (!canPull && lastError.code !== 'reconnect' && lastError.code !== 'container_error') {
      lastError.message +=
        ' (Tip: run the backend at a public HTTPS URL and set CLIPFORGE_PUBLIC_URL so Instagram can fetch the clip directly.)'
    }
    throw lastError
  }

  onProgress?.('Publishing the Reel')
  const pub = await post(graph(`/${igId}/media_publish`), tokens.access_token, { creation_id: containerId })
  if (!pub.ok || !pub.json?.id) throw igError(pub, 'Instagram would not publish the Reel')
  const mediaId = pub.json.id

  // The permalink is a nicety: the Reel is live even if this lookup fails.
  let url
  try {
    const link = await call(`${graph(`/${mediaId}`)}?${new URLSearchParams({ fields: 'permalink', access_token: tokens.access_token })}`)
    url = link.json?.permalink
  } catch {
    // ignore
  }
  return { id: mediaId, url }
}
