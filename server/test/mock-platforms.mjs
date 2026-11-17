// A stand-in for the YouTube, Instagram and TikTok APIs, used by the tests.
// It follows each platform's documented request/response shapes and rejects
// requests that break their rules (auth header format, chunk maths, sequential
// byte ranges, ...), so the publishers are exercised end to end without real
// credentials.

import express from 'express'

const MB = 1024 * 1024

export async function startMockPlatforms() {
  const app = express()
  const state = {
    youtube: { sessions: new Map(), videos: [] },
    instagram: { containers: new Map(), published: [], uploads: 0 },
    tiktok: { posts: new Map(), failNext: null, privacyOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'] },
    tokenCalls: [],
  }
  let base = ''
  let seq = 0
  const next = (p) => `${p}${++seq}`

  const form = express.urlencoded({ extended: false })
  const json = express.json()
  const raw = express.raw({ type: () => true, limit: '300mb' })
  const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '')

  // ---------- Consent screens ----------
  // Each platform's sign-in page, reduced to its outcome: straight back to the
  // app's redirect URI with a code and the untouched state.
  const consent = (suffix = '') => (req, res) => {
    const { redirect_uri: back, state: st } = req.query
    if (!back || !st || req.query.response_type !== 'code') return res.status(400).send('bad authorize request')
    if (!(req.query.client_id || req.query.client_key) || !req.query.scope) return res.status(400).send('missing client or scope')
    res.redirect(`${back}?code=mock-code&state=${encodeURIComponent(st)}${suffix}`)
  }
  app.get('/google/auth', consent())
  app.get('/ig/authorize', consent('#_'))
  app.get('/tt/authorize/', consent())
  // Test control: flip platform behaviour (e.g. { "unaudited": true } for TikTok).
  app.post('/__set', express.json(), (req, res) => {
    Object.assign(state.tiktok, req.body || {})
    res.json({ ok: true })
  })
  app.get('/__state', (_req, res) =>
    res.json({
      youtube: state.youtube.videos,
      instagram: state.instagram.published,
      tiktok: [...state.tiktok.posts.values()],
    }),
  )

  // ---------- Google / YouTube ----------
  app.post('/google/token', form, (req, res) => {
    state.tokenCalls.push({ platform: 'youtube', ...req.body })
    if (!req.body.client_id || !req.body.client_secret) return res.status(400).json({ error: 'invalid_client' })
    if (req.body.grant_type === 'authorization_code') {
      if (!req.body.code || !req.body.redirect_uri) return res.status(400).json({ error: 'invalid_request' })
      return res.json({ access_token: 'yt-access-1', refresh_token: 'yt-refresh', expires_in: 3600, scope: 'https://www.googleapis.com/auth/youtube.upload' })
    }
    if (req.body.grant_type === 'refresh_token' && req.body.refresh_token === 'yt-refresh') {
      return res.json({ access_token: 'yt-access-2', expires_in: 3600 })
    }
    res.status(400).json({ error: 'invalid_grant', error_description: 'Bad refresh token' })
  })

  app.post('/yt/upload/youtube/v3/videos', json, (req, res) => {
    if (!bearer(req).startsWith('yt-access')) return res.status(401).json({ error: { code: 401, message: 'Invalid Credentials', errors: [{ reason: 'authError' }] } })
    if (req.query.uploadType !== 'resumable' || !String(req.query.part).includes('snippet')) return res.status(400).json({ error: { message: 'bad params' } })
    const length = Number(req.headers['x-upload-content-length'])
    if (!length || !req.headers['x-upload-content-type']) return res.status(400).json({ error: { message: 'missing upload headers' } })
    if (!req.body?.snippet?.title || !req.body?.status?.privacyStatus) return res.status(400).json({ error: { message: 'missing metadata' } })
    const id = next('ytsession')
    state.youtube.sessions.set(id, { metadata: req.body, length })
    res.set('Location', `${base}/yt/session/${id}`).status(200).end()
  })

  app.put('/yt/session/:id', raw, (req, res) => {
    const s = state.youtube.sessions.get(req.params.id)
    if (!s) return res.status(404).json({ error: { message: 'no session' } })
    if (req.body.length !== s.length) return res.status(400).json({ error: { message: `expected ${s.length} bytes, got ${req.body.length}` } })
    const video = { id: next('ytvid'), bytes: req.body.length, head: req.body.subarray(4, 8).toString(), ...s.metadata }
    state.youtube.videos.push(video)
    res.json({ kind: 'youtube#video', id: video.id, snippet: { ...s.metadata.snippet, channelId: 'UCmock', channelTitle: 'Mock Channel' }, status: s.metadata.status })
  })

  // ---------- Instagram ----------
  app.post('/igapi/oauth/access_token', form, (req, res) => {
    state.tokenCalls.push({ platform: 'instagram', ...req.body })
    const b = req.body
    if (!b.client_id || !b.client_secret || b.grant_type !== 'authorization_code' || !b.redirect_uri || !b.code) {
      return res.status(400).json({ error_type: 'OAuthException', code: 400, error_message: 'Invalid request' })
    }
    if (b.code.includes('#')) return res.status(400).json({ error_type: 'OAuthException', code: 400, error_message: 'Invalid code' })
    res.json({ data: [{ access_token: 'ig-short', user_id: '999', permissions: 'instagram_business_basic,instagram_business_content_publish' }] })
  })

  const ig = express.Router()
  ig.get('/access_token', (req, res) => {
    if (req.query.grant_type !== 'ig_exchange_token' || req.query.access_token !== 'ig-short' || !req.query.client_secret) {
      return res.status(400).json({ error: { message: 'Invalid exchange', type: 'OAuthException', code: 100 } })
    }
    res.json({ access_token: 'ig-long', token_type: 'bearer', expires_in: 5184000 })
  })
  ig.get('/refresh_access_token', (req, res) => {
    if (req.query.grant_type !== 'ig_refresh_token') return res.status(400).json({ error: { message: 'bad grant', code: 100 } })
    res.json({ access_token: 'ig-long-2', token_type: 'bearer', expires_in: 5184000 })
  })
  const igAuth = (req, res, nextFn) => {
    const token = req.query.access_token || req.body?.access_token || bearer(req)
    if (!String(token).startsWith('ig-long')) {
      return res.status(400).json({ error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 } })
    }
    nextFn()
  }
  ig.get('/:v/me', igAuth, (_req, res) => res.json({ user_id: '17841400000000001', username: 'clipforge_test', id: '999' }))
  ig.post('/:v/:igId/media', form, igAuth, (req, res) => {
    // Only the professional-account id is a real object here: other ids 404 like the Graph API.
    if (req.params.igId !== '17841400000000001') {
      return res.status(400).json({ error: { message: `Unsupported post request. Object with ID '${req.params.igId}' does not exist`, type: 'GraphMethodException', code: 100, error_subcode: 33 } })
    }
    const b = req.body
    if (b.media_type !== 'REELS') return res.status(400).json({ error: { message: 'media_type must be REELS', code: 100 } })
    const id = next('igcontainer')
    const c = { id, caption: b.caption, shareToFeed: b.share_to_feed, polls: 0, bytes: 0, mode: null }
    if (b.upload_type === 'resumable') {
      c.mode = 'resumable'
      state.instagram.containers.set(id, c)
      return res.json({ id, uri: `${base}/igrupload/ig-api-upload/${req.params.v}/${id}` })
    }
    if (!/^https:\/\//.test(b.video_url || '')) return res.status(400).json({ error: { message: 'video_url must be a public https URL', code: 100 } })
    c.mode = 'url'
    c.videoUrl = b.video_url
    c.bytes = 1
    state.instagram.containers.set(id, c)
    res.json({ id })
  })
  ig.post('/:v/:igId/media_publish', form, igAuth, (req, res) => {
    const c = state.instagram.containers.get(req.body.creation_id)
    if (!c) return res.status(400).json({ error: { message: 'Invalid creation_id', code: 100 } })
    if (c.polls < 2 || !c.bytes) return res.status(400).json({ error: { message: 'Media ID is not available', code: 9007, error_subcode: 2207027 } })
    const id = next('igmedia')
    state.instagram.published.push({ ...c, id })
    res.json({ id })
  })
  ig.get('/:v/:id', igAuth, (req, res) => {
    const { id } = req.params
    if (id.startsWith('igmedia')) return res.json({ permalink: `https://www.instagram.com/reel/${id}/`, id })
    const c = state.instagram.containers.get(id)
    if (!c) return res.status(400).json({ error: { message: 'Unsupported get request', code: 100, error_subcode: 33 } })
    c.polls++
    if (c.fail) return res.json({ status_code: 'ERROR', status: 'Error: Unsupported video format (2207026)', id })
    res.json({ status_code: c.polls >= 2 && c.bytes ? 'FINISHED' : 'IN_PROGRESS', id })
  })
  app.use('/iggraph', ig)

  app.post('/igrupload/ig-api-upload/:v/:id', raw, (req, res) => {
    const c = state.instagram.containers.get(req.params.id)
    if (!c) return res.status(404).json({ debug_info: { message: 'no container' } })
    if (!/^OAuth ig-long/.test(req.headers.authorization || '')) return res.status(401).json({ debug_info: { message: 'bad auth' } })
    if (req.headers.offset !== '0' || Number(req.headers.file_size) !== req.body.length) {
      return res.status(400).json({ debug_info: { message: 'offset/file_size mismatch' } })
    }
    c.bytes = req.body.length
    state.instagram.uploads++
    res.json({ success: true, message: 'Upload successful.' })
  })

  // ---------- TikTok ----------
  const ok = { code: 'ok', message: '', log_id: 'mocklog' }
  const ttErr = (res, status, code, message = code) => res.status(status).json({ data: {}, error: { code, message, log_id: 'mocklog' } })
  const tt = express.Router()

  tt.post('/v2/oauth/token/', form, (req, res) => {
    state.tokenCalls.push({ platform: 'tiktok', ...req.body })
    const b = req.body
    if (!b.client_key || !b.client_secret) return res.status(400).json({ error: 'invalid_client', error_description: 'Client key or secret is incorrect.', log_id: 'x' })
    const tokens = { open_id: 'tt-open-id', scope: 'user.info.basic,video.publish,video.upload', expires_in: 86400, refresh_expires_in: 31536000, token_type: 'Bearer' }
    if (b.grant_type === 'authorization_code' && b.code && b.redirect_uri) return res.json({ ...tokens, access_token: 'tt-access-1', refresh_token: 'tt-refresh' })
    if (b.grant_type === 'refresh_token' && b.refresh_token === 'tt-refresh') return res.json({ ...tokens, access_token: 'tt-access-2', refresh_token: 'tt-refresh' })
    res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code is expired.', log_id: 'x' })
  })

  const ttAuth = (req, res, nextFn) => (bearer(req).startsWith('tt-access') ? nextFn() : ttErr(res, 401, 'access_token_invalid'))

  tt.post('/v2/post/publish/creator_info/query/', json, ttAuth, (_req, res) =>
    res.json({
      data: {
        creator_avatar_url: 'https://example.com/a.jpg', creator_username: 'clipforge', creator_nickname: 'ClipForge',
        privacy_level_options: state.tiktok.privacyOptions, comment_disabled: false, duet_disabled: false, stitch_disabled: true,
        max_video_post_duration_sec: 600,
      },
      error: ok,
    }),
  )

  const initPost = (kind) => (req, res) => {
    const s = req.body?.source_info
    if (s?.source !== 'FILE_UPLOAD') return ttErr(res, 400, 'invalid_params', 'source must be FILE_UPLOAD')
    const { video_size: size, chunk_size: chunk, total_chunk_count: count } = s
    if (![size, chunk, count].every((n) => Number.isInteger(n) && n > 0)) return ttErr(res, 400, 'invalid_params', 'sizes must be positive integers')
    // Media transfer rules: whole-file upload for small files, otherwise 5-64 MB
    // chunks, the count rounded down so the final chunk carries the remainder.
    const whole = chunk === size && count === 1
    if (!whole && (chunk < 5 * MB || chunk > 64 * MB)) return ttErr(res, 400, 'invalid_params', 'chunk_size out of range')
    if (!whole && count !== Math.floor(size / chunk)) return ttErr(res, 400, 'invalid_params', 'total_chunk_count is invalid')
    if (whole && size > 64 * MB) return ttErr(res, 400, 'invalid_params', 'file too large for a single chunk')
    if (count > 1000) return ttErr(res, 400, 'invalid_params', 'too many chunks')
    if (kind === 'direct') {
      const p = req.body.post_info
      if (!p || !state.tiktok.privacyOptions.includes(p.privacy_level)) return ttErr(res, 400, 'privacy_level_option_mismatch')
      if (state.tiktok.unaudited && p.privacy_level !== 'SELF_ONLY') return ttErr(res, 403, 'unaudited_client_can_only_post_to_private_accounts')
    }
    const id = next('ttpub')
    state.tiktok.posts.set(id, { id, kind, size, chunk, count, received: 0, chunks: 0, polls: 0, post: req.body.post_info, fail: state.tiktok.failNext })
    state.tiktok.failNext = null
    res.json({ data: { publish_id: id, upload_url: `${base}/ttupload/${id}` }, error: ok })
  }
  tt.post('/v2/post/publish/video/init/', json, ttAuth, initPost('direct'))
  tt.post('/v2/post/publish/inbox/video/init/', json, ttAuth, initPost('inbox'))

  tt.post('/v2/post/publish/status/fetch/', json, ttAuth, (req, res) => {
    const p = state.tiktok.posts.get(req.body?.publish_id)
    if (!p) return ttErr(res, 400, 'invalid_publish_id')
    p.polls++
    if (p.received < p.size || p.polls < 2) return res.json({ data: { status: 'PROCESSING_UPLOAD', uploaded_bytes: p.received }, error: ok })
    if (p.fail) return res.json({ data: { status: 'FAILED', fail_reason: p.fail }, error: ok })
    if (p.kind === 'inbox') return res.json({ data: { status: 'SEND_TO_USER_INBOX' }, error: ok })
    const data = { status: 'PUBLISH_COMPLETE', uploaded_bytes: p.size }
    if (p.post.privacy_level !== 'SELF_ONLY') data.publicaly_available_post_id = [7300000000000000001n.toString()]
    res.json({ data, error: ok })
  })
  app.use('/tt', tt)

  app.put('/ttupload/:id', raw, (req, res) => {
    const p = state.tiktok.posts.get(req.params.id)
    if (!p) return res.status(404).end()
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(req.headers['content-range'] || '')
    if (!m) return res.status(400).json({ error: { code: 'invalid_params', message: 'bad Content-Range' } })
    const [start, end, total] = m.slice(1).map(Number)
    if (total !== p.size || start !== p.received || end - start + 1 !== req.body.length) return res.status(416).json({ error: { code: 'invalid_params', message: 'range not satisfiable' } })
    const last = p.chunks === p.count - 1
    if (!last && req.body.length !== p.chunk) return res.status(400).json({ error: { code: 'invalid_params', message: 'chunk has the wrong size' } })
    if (last && end !== p.size - 1) return res.status(400).json({ error: { code: 'invalid_params', message: 'final chunk must end the file' } })
    if (!/^video\/(mp4|quicktime|webm)$/.test(req.headers['content-type'] || '')) return res.status(415).end()
    p.received = end + 1
    p.chunks++
    res.status(p.received === p.size ? 201 : 206).end()
  })

  // ---------- Anthropic Messages API (just enough for the studio) ----------
  state.claude = { calls: [], plotAnswersInProse: true, trendsPause: true }
  app.post('/anthropic/v1/messages', json, (req, res) => {
    const b = req.body
    const betas = String(req.headers['anthropic-beta'] || '')
    const key = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer /, '')
    state.claude.calls.push({ body: b, betas, version: req.headers['anthropic-version'], key })
    if (key !== 'sk-ant-test') {
      return res.status(401).json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })
    }
    const names = (b.tools || []).map((t) => t.name)
    const msg = (content, stop_reason) =>
      res.json({ id: next('msg_'), type: 'message', role: 'assistant', model: b.model, content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } })
    const turns = b.messages.filter((m) => m.role === 'assistant').length
    if (names.includes('report_trends')) {
      if (state.claude.trendsPause && turns === 0) {
        return msg([
          { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'trending this week' } },
          { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://news.example.com/sleep', title: 'Why everyone is trying sleepy girl mocktails', encrypted_content: 'x', page_age: null }] },
        ], 'pause_turn')
      }
      return msg([
        { type: 'text', text: 'Here is what I found.' },
        { type: 'tool_use', id: 'toolu_t', name: 'report_trends', input: { trends: [
          { title: 'Bedtime mocktails', summary: 'A drink people make before bed to sleep better.', why_now: 'Searches tripled this week after a viral post.', niche: 'Wellness', freshness: 'this_week',
            angles: [{ format: 'myth', idea: 'Does a bedtime mocktail really help you sleep?' }, { format: 'howto', idea: 'Make the 3-ingredient version' }],
            sources: [{ title: 'Why everyone is trying sleepy girl mocktails', url: 'https://news.example.com/sleep' }], caution: '' },
          { title: 'Leap second debate', summary: 'Clocks might stop adding leap seconds.', why_now: 'A standards vote is this week.', niche: 'Science', freshness: 'this_week',
            angles: [{ format: 'explainer', idea: 'Why the Earth makes clocks wrong' }], sources: [], caution: '' },
        ] } },
      ], 'tool_use')
    }
    if (names.includes('submit_plot')) {
      if (state.claude.plotAnswersInProse && turns === 0) return msg([{ type: 'text', text: 'Here is a plot idea in prose…' }], 'end_turn')
      const scenes = [
        ['Mo yawns at 3 a.m., staring at the ceiling', 'close-up, slow push in', 'It is 3 a.m. and Mo has tried everything.', '3 A.M. AGAIN', 'clock ticking'],
        ['Mo scrolls a giant glowing phone, eyes wide', 'medium shot', 'Then the internet says: drink this before bed.', 'THE INTERNET SAYS', 'phone buzz'],
        ['Mo mixes cherry juice and sparkling water in a tall glass', 'overhead shot', 'Cherry juice, magnesium, a splash of bubbles.', '3 INGREDIENTS', 'fizz'],
        ['Mo lies down, glass empty, waiting dramatically', 'wide shot, static', 'Mo waits. And waits.', 'WAITING…', 'cricket chirps'],
        ['Mo snores peacefully as the moon winks', 'wide shot, slow pull out', 'Does it work? A little. The routine helps more than the drink.', 'ROUTINE > DRINK', 'soft snore'],
      ]
      return msg([{ type: 'tool_use', id: 'toolu_p', name: 'submit_plot', input: {
        title: 'Does the bedtime mocktail work?', hook: 'It is 3 a.m. and Mo has tried everything.', logline: 'Mo tests the viral bedtime drink.',
        beats: ['Hook', 'Setup', 'Test', 'Wait', 'Verdict'], characters: [{ name: 'Mo', look: 'a chunky tangerine-orange blob with stubby arms' }],
        scenes: scenes.map(([visual, camera, narration, on_screen_text, sfx]) => ({ duration_sec: 6, visual, camera, narration, on_screen_text, sfx })),
        caption: 'Would you try it?', hashtags: ['sleep', '#mocktail', 'bedtime routine'], fact_notes: 'Tart cherry has some evidence for sleep; modest effect.',
      } }], 'tool_use')
    }
    res.status(400).json({ type: 'error', error: { type: 'invalid_request_error', message: 'unexpected request' } })
  })

  // ---------- Higgsfield ----------
  state.hf = { submits: [], polls: {}, videoFile: null }
  app.post(/^\/hf\/([a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+)$/i, json, (req, res) => {
    const path = req.params[0]
    if (req.headers.authorization !== 'Key hf-id:hf-secret') return res.status(401).json({ detail: 'Not authenticated' })
    if (path.startsWith('requests/')) return res.status(404).json({ detail: 'Not Found' })
    if (!path.includes('text-to-video')) return res.status(404).json({ detail: 'Model not found' })
    const b = req.body || {}
    if (!b.prompt || !Number.isInteger(b.duration) || b.duration < 4 || b.duration > 30) return res.status(422).json({ detail: [{ msg: 'duration must be 4-30' }] })
    const id = next('hfreq_')
    state.hf.submits.push({ id, model: path, body: b })
    state.hf.polls[id] = 0
    res.json({ status: 'queued', request_id: id, status_url: `${base}/hf/requests/${id}/status`, cancel_url: `${base}/hf/requests/${id}/cancel` })
  })
  app.get('/hf/requests/:id/status', (req, res) => {
    if (req.headers.authorization !== 'Key hf-id:hf-secret') return res.status(401).json({ detail: 'Not authenticated' })
    const sub = state.hf.submits.find((x) => x.id === req.params.id)
    if (!sub) return res.status(404).json({ detail: 'Not Found' })
    const n = ++state.hf.polls[sub.id]
    if (/NSFWTEST/.test(sub.body.prompt)) return res.json({ status: 'nsfw', request_id: sub.id })
    if (n < 2) return res.json({ status: 'queued', request_id: sub.id })
    if (n < 3) return res.json({ status: 'in_progress', request_id: sub.id })
    res.json({ status: 'completed', request_id: sub.id, video: { url: `${base}/hf-files/${sub.id}.mp4` } })
  })
  app.post('/hf/requests/:id/cancel', (_req, res) => res.status(202).json({ ok: true }))
  app.get('/hf-files/:name', (_req, res) => (state.hf.videoFile ? res.type('video/mp4').sendFile(state.hf.videoFile) : res.status(404).end()))

  // ---------- Google Trends RSS ----------
  app.get('/google-trends/rss', (req, res) => {
    res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss"><channel>
<item><title>northern lights tonight</title><ht:approx_traffic>500K+</ht:approx_traffic><ht:picture>https://img.example.com/a.jpg</ht:picture>
<ht:news_item><ht:news_item_title>Aurora could be visible as far south as Texas</ht:news_item_title><ht:news_item_url>https://news.example.com/aurora</ht:news_item_url><ht:news_item_source>Example News</ht:news_item_source></ht:news_item></item>
<item><title><![CDATA[daylight saving &amp; you]]></title><ht:approx_traffic>100K+</ht:approx_traffic></item>
</channel></rss>`.replace('?geo', ''))
  })

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    state,
    env: {
      GOOGLE_TOKEN_URL: `${base}/google/token`,
      GOOGLE_AUTH_URL: `${base}/google/auth`,
      YOUTUBE_API_BASE: `${base}/yt`,
      INSTAGRAM_AUTH_URL: `${base}/ig/authorize`,
      INSTAGRAM_API_BASE: `${base}/igapi`,
      INSTAGRAM_GRAPH_BASE: `${base}/iggraph`,
      TIKTOK_AUTH_URL: `${base}/tt/authorize`,
      TIKTOK_API_BASE: `${base}/tt`,
      ANTHROPIC_BASE_URL: `${base}/anthropic`,
      HIGGSFIELD_API_BASE: `${base}/hf`,
      GOOGLE_TRENDS_RSS: `${base}/google-trends/rss`,
    },
    close: () => new Promise((r) => server.close(r)),
  }
}

// Run standalone for manual / browser testing:  node test/mock-platforms.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = await startMockPlatforms()
  console.log(JSON.stringify(mock.env))
}
