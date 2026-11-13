// TikTok publishing through the Content Posting API (Login Kit for Web OAuth v2).
//
// Two modes:
//   direct - posts straight to the profile (scope video.publish)
//   inbox  - sends the video to the creator's TikTok inbox as a draft to finish
//            in the TikTok app (scope video.upload)
//
// Until TikTok has audited your app, direct posts can only be private
// ("Only me"); inbox drafts work for unaudited apps.

import { call, clip, fileSize, pollUntil, readRange, PlatformError } from './http.mjs'

const AUTH_URL = () => process.env.TIKTOK_AUTH_URL || 'https://www.tiktok.com/v2/auth/authorize/'
const API = () => (process.env.TIKTOK_API_BASE || 'https://open.tiktokapis.com').replace(/\/+$/, '')
const SCOPES = () => process.env.TIKTOK_SCOPES || 'user.info.basic,video.publish,video.upload'
const POLL_MS = () => Number(process.env.CLIPFORGE_POLL_MS || 5000)

const MB = 1024 * 1024
/** Files up to this size go up in a single request; larger ones are chunked. */
const SINGLE_MAX = 64 * MB
const CHUNK = 10 * MB

export const label = 'TikTok'
export const PRIVACY = ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'PUBLIC_TO_EVERYONE']

export function isConfigured() {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)
}

export function authUrl(state, redirectUri) {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope: SCOPES(),
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  })
  return `${AUTH_URL()}?${params}`
}

const FRIENDLY = {
  unaudited_client_can_only_post_to_private_accounts:
    'TikTok has not audited this app yet, so it can only post privately. Choose “Only me” as the privacy (your TikTok account may also need to be private), or use “Send to TikTok drafts”.',
  privacy_level_option_mismatch: 'TikTok does not allow that privacy setting for this account. Pick another one.',
  spam_risk_too_many_posts: 'TikTok says this account has posted too many times today through the API. Try again tomorrow.',
  spam_risk_too_many_pending_share: 'TikTok says there are too many unfinished drafts in this account’s inbox. Post or delete some in the TikTok app first.',
  spam_risk_user_banned_from_posting: 'TikTok has blocked this account from posting.',
  reached_active_user_cap: 'This TikTok app has reached its daily cap of active creators.',
  scope_not_authorized: 'This TikTok connection is missing a permission. Reconnect TikTok in Accounts and approve everything it asks for.',
  access_token_invalid: 'TikTok access has expired or was revoked. Reconnect TikTok in Accounts.',
  url_ownership_unverified: 'TikTok needs the video domain to be verified for URL pulls.',
  file_format_check_failed: 'TikTok rejected the file format. It needs MP4 (H.264) or WebM.',
  duration_check_failed: 'TikTok rejected the clip length for this account.',
  frame_rate_check_failed: 'TikTok rejected the clip frame rate (needs 23–60 fps).',
  picture_size_check_failed: 'TikTok rejected the clip resolution.',
  video_pull_failed: 'TikTok could not download the video.',
  publish_cancelled: 'The post was cancelled in TikTok.',
}

function ttError(r, fallback) {
  const e = r.json?.error
  const code = (typeof e === 'string' ? e : e?.code) || undefined
  const msg = FRIENDLY[code] || (typeof e === 'object' ? e?.message : r.json?.error_description) || `${fallback} (HTTP ${r.status}).`
  const reconnect = code === 'access_token_invalid' || code === 'scope_not_authorized' || code === 'invalid_grant'
  return new PlatformError(FRIENDLY[code] ? msg : `TikTok: ${msg}`, { code: reconnect ? 'reconnect' : code, status: r.status })
}

const okBody = (r) => r.ok && (!r.json?.error || r.json.error.code === 'ok' || !r.json.error.code)

const api = (path, token, body) =>
  call(`${API()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body ?? {}),
  })

async function tokenRequest(params, what) {
  const r = await call(`${API()}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      ...params,
    }),
  })
  // Token errors come back as { error, error_description } (sometimes with HTTP 200).
  if (!r.ok || !r.json?.access_token) {
    const reason = r.json?.error_description || (typeof r.json?.error === 'string' ? r.json.error : r.json?.error?.message) || `HTTP ${r.status}`
    throw new PlatformError(`TikTok ${what} failed: ${reason}`, { code: typeof r.json?.error === 'string' ? r.json.error : undefined })
  }
  return r.json
}

const fromTokenResponse = (j, prev = {}) => ({
  ...prev,
  access_token: j.access_token,
  refresh_token: j.refresh_token || prev.refresh_token,
  expires_at: Date.now() + (Number(j.expires_in) || 86400) * 1000,
  refresh_expires_at: j.refresh_expires_in ? Date.now() + Number(j.refresh_expires_in) * 1000 : prev.refresh_expires_at,
  scope: j.scope || prev.scope,
  open_id: j.open_id || prev.open_id,
})

const hasScope = (t, scope) => !t.scope || String(t.scope).split(/[ ,]+/).includes(scope)

async function creatorInfo(tokens) {
  const r = await api('/v2/post/publish/creator_info/query/', tokens.access_token)
  if (!okBody(r)) throw ttError(r, 'Could not read the TikTok account')
  return r.json?.data || {}
}

export async function exchangeCode(code, redirectUri) {
  const j = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri }, 'sign-in')
  const tokens = fromTokenResponse(j)
  // A display name is a nicety: never fail the connection over it.
  let name
  try {
    if (hasScope(tokens, 'video.publish')) {
      const info = await creatorInfo(tokens)
      name = info.creator_username ? `@${info.creator_username}` : info.creator_nickname
    }
    if (!name) {
      const r = await call(`${API()}/v2/user/info/?fields=open_id,display_name`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      name = r.json?.data?.user?.display_name
    }
  } catch {
    // ignore
  }
  return { ...tokens, account: { id: tokens.open_id || '', name: name || 'TikTok account' } }
}

export const needsRefresh = (t) => !t.expires_at || t.expires_at - Date.now() < 10 * 60 * 1000

export async function refresh(t) {
  if (!t.refresh_token || (t.refresh_expires_at && t.refresh_expires_at < Date.now())) {
    throw new PlatformError('Your TikTok connection has expired. Reconnect TikTok in Accounts.', { code: 'reconnect' })
  }
  try {
    return fromTokenResponse(await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token }, 'token refresh'), t)
  } catch (e) {
    if (e.code === 'invalid_grant' || e.code === 'invalid_request') {
      throw new PlatformError('TikTok access was revoked or expired. Reconnect TikTok in Accounts.', { code: 'reconnect' })
    }
    throw e
  }
}

/** How to split a file for TikTok's FILE_UPLOAD transfer. The last chunk carries the remainder. */
export function chunkPlan(size) {
  if (size <= SINGLE_MAX) return { chunkSize: size, count: 1 }
  return { chunkSize: CHUNK, count: Math.floor(size / CHUNK) }
}

async function uploadFile(uploadUrl, media, size, plan, onProgress) {
  for (let i = 0; i < plan.count; i++) {
    const start = i * plan.chunkSize
    const end = i === plan.count - 1 ? size - 1 : start + plan.chunkSize - 1
    const body = await readRange(media.path, start, end - start + 1)
    const r = await call(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': media.mime,
        'Content-Length': String(body.length),
        'Content-Range': `bytes ${start}-${end}/${size}`,
      },
      body,
      timeoutMs: 10 * 60 * 1000,
    })
    if (!r.ok) throw ttError(r, `TikTok upload failed on part ${i + 1} of ${plan.count}`)
    if (plan.count > 1) onProgress?.(`Uploading to TikTok (${Math.round(((i + 1) / plan.count) * 100)}%)`)
  }
}

/**
 * Publish a clip to TikTok.
 * @param {{access_token:string, scope?:string, account?:{name?:string}}} tokens
 * @param {{caption?:string, mode?:'direct'|'inbox', privacy?:string, disableComment?:boolean, disableDuet?:boolean, disableStitch?:boolean}} opts
 * @param {{path:string, mime:string}} media
 */
export async function publish(tokens, opts, media, { onProgress } = {}) {
  if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(media.mime)) {
    throw new PlatformError('TikTok needs an MP4, MOV or WebM file.')
  }
  const mode = opts.mode === 'inbox' ? 'inbox' : 'direct'
  const need = mode === 'inbox' ? 'video.upload' : 'video.publish'
  if (!hasScope(tokens, need)) {
    throw new PlatformError(
      mode === 'inbox'
        ? 'This TikTok connection cannot send drafts (the video.upload permission is missing). Use direct posting or reconnect TikTok.'
        : 'This TikTok connection cannot post directly (the video.publish permission is missing). Use “Send to TikTok drafts” or reconnect TikTok.',
      { code: 'scope' },
    )
  }

  const size = await fileSize(media.path)
  const plan = chunkPlan(size)
  const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: plan.chunkSize, total_chunk_count: plan.count }

  let init
  let username = tokens.account?.name?.startsWith('@') ? tokens.account.name.slice(1) : undefined
  if (mode === 'inbox') {
    onProgress?.('Starting TikTok draft upload')
    init = await api('/v2/post/publish/inbox/video/init/', tokens.access_token, { source_info })
  } else {
    onProgress?.('Checking TikTok posting options')
    const info = await creatorInfo(tokens)
    if (info.creator_username) username = info.creator_username
    const allowed = Array.isArray(info.privacy_level_options) ? info.privacy_level_options : []
    const privacy = PRIVACY.includes(opts.privacy) ? opts.privacy : 'SELF_ONLY'
    if (allowed.length && !allowed.includes(privacy)) {
      throw new PlatformError(
        `TikTok does not allow “${privacy}” for this account. Allowed: ${allowed.join(', ')}.`,
        { code: 'privacy_level_option_mismatch' },
      )
    }
    onProgress?.('Starting TikTok upload')
    init = await api('/v2/post/publish/video/init/', tokens.access_token, {
      post_info: {
        title: clip(opts.caption || '', 2200),
        privacy_level: privacy,
        disable_comment: Boolean(opts.disableComment) || Boolean(info.comment_disabled),
        disable_duet: Boolean(opts.disableDuet) || Boolean(info.duet_disabled),
        disable_stitch: Boolean(opts.disableStitch) || Boolean(info.stitch_disabled),
        video_cover_timestamp_ms: 1000,
      },
      source_info,
    })
  }
  if (!okBody(init) || !init.json?.data?.publish_id) throw ttError(init, 'TikTok would not start the upload')
  const { publish_id, upload_url } = init.json.data
  if (!upload_url) throw new PlatformError('TikTok did not return an upload URL.')

  onProgress?.('Uploading video to TikTok')
  await uploadFile(upload_url, media, size, plan, onProgress)

  onProgress?.('TikTok is processing the video')
  const done = await pollUntil(
    async () => {
      const r = await api('/v2/post/publish/status/fetch/', tokens.access_token, { publish_id })
      if (!okBody(r)) throw ttError(r, 'Could not check the TikTok post status')
      const d = r.json?.data || {}
      if (d.status === 'FAILED') {
        throw new PlatformError(FRIENDLY[d.fail_reason] || `TikTok could not publish the video: ${d.fail_reason || 'unknown reason'}.`, {
          code: d.fail_reason,
        })
      }
      if (d.status === 'PUBLISH_COMPLETE' || d.status === 'SEND_TO_USER_INBOX') return d
      return undefined
    },
    { everyMs: POLL_MS(), timeoutMs: 15 * 60 * 1000, what: 'TikTok' },
  )

  if (done.status === 'SEND_TO_USER_INBOX') {
    return {
      id: publish_id,
      draft: true,
      note: 'Sent to your TikTok inbox. Open the TikTok app and tap the notification to add the caption and post it.',
    }
  }
  // (sic) the field is spelled "publicaly" in TikTok's API.
  const postId = [done.publicaly_available_post_id, done.publicly_available_post_id].flat().filter(Boolean)[0]
  return {
    id: String(postId || publish_id),
    url: postId && username ? `https://www.tiktok.com/@${username}/video/${postId}` : username ? `https://www.tiktok.com/@${username}` : undefined,
    note: postId ? undefined : 'Posted. Private posts and posts still in TikTok’s review do not get a public link.',
  }
}
