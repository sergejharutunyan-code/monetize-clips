// End-to-end test of the backend against the mock platforms:
// account -> connect all three platforms -> upload a clip -> ffmpeg converts it
// -> publish to YouTube, Instagram and TikTok -> scheduling, cancel, retry.
//
// Run:  npm test   (needs ffmpeg on PATH for the conversion checks)

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { startMockPlatforms } from './mock-platforms.mjs'

const dir = mkdtempSync(join(tmpdir(), 'clipforge-test-'))
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0

let mock, server, base, token, media, publisher, tiktok, instagram
const auth = () => ({ authorization: `Bearer ${token}` })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path, opts = {}) {
  const res = await fetch(`${base}${path}`, { ...opts, headers: { ...(opts.headers || {}), ...(opts.auth === false ? {} : auth()) } })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function until(fn, what, ms = 30_000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`)
    await sleep(60)
  }
}
const jobsDone = (ids) =>
  until(async () => {
    const { json } = await api(`/api/jobs?ids=${ids.join(',')}`)
    return json.jobs.every((j) => ['published', 'failed', 'canceled'].includes(j.status)) ? json.jobs : null
  }, 'publish jobs')

before(async () => {
  mock = await startMockPlatforms()
  Object.assign(process.env, mock.env, {
    CLIPFORGE_DB: join(dir, 'test.db'),
    CLIPFORGE_PUBLIC_URL: 'http://localhost:8787',
    CLIPFORGE_ALLOW_ORIGIN: '*',
    CLIPFORGE_POLL_MS: '20',
    CLIPFORGE_TICK_MS: '50',
    GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret',
    INSTAGRAM_APP_ID: 'ig-id', INSTAGRAM_APP_SECRET: 'ig-secret',
    TIKTOK_CLIENT_KEY: 'tt-key', TIKTOK_CLIENT_SECRET: 'tt-secret',
  })
  delete process.env.GOOGLE_REDIRECT_URI
  // Import after the environment is set: config is read at load time.
  const { createApp } = await import('../index.mjs')
  publisher = await import('../lib/publisher.mjs')
  tiktok = await import('../lib/tiktok.mjs')
  instagram = await import('../lib/instagram.mjs')
  publisher.startWorker()
  server = await new Promise((resolve) => {
    const s = createApp().listen(0, '127.0.0.1', () => resolve(s))
  })
  base = `http://127.0.0.1:${server.address().port}`

  // A short clip the way a browser hands it over: WebM (VP8 + Vorbis).
  if (hasFfmpeg) {
    const r = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=30:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
      '-c:v', 'libvpx', '-b:v', '800k', '-c:a', 'libvorbis', join(dir, 'clip.webm'),
    ])
    assert.equal(r.status, 0, 'ffmpeg could not create the test clip')
  }
})

after(async () => {
  publisher?.stopWorker()
  await new Promise((r) => server?.close(r))
  await mock?.close()
  rmSync(dir, { recursive: true, force: true })
})

test('health reports the app and what is configured', async () => {
  const { json } = await api('/health', { auth: false })
  assert.equal(json.app, 'clipforge')
  assert.deepEqual(json.publish, { youtube: true, instagram: true, tiktok: true })
  assert.equal(json.ffmpeg, hasFfmpeg)
})

test('register, then every publishing route needs the session', async () => {
  const anon = await api('/api/connections', { auth: false })
  assert.equal(anon.status, 401)
  const r = await api('/api/auth/register', {
    method: 'POST', auth: false, headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'creator@example.com', password: 'correct horse' }),
  })
  assert.equal(r.status, 200)
  token = r.json.token
  const c = await api('/api/connections')
  assert.equal(c.json.platforms.instagram.configured, true)
  assert.equal(c.json.platforms.instagram.connected, false)
  assert.equal(c.json.platforms.tiktok.redirectUri, 'http://localhost:8787/api/oauth/tiktok/callback')
})

test('OAuth: connect YouTube, Instagram and TikTok', async () => {
  for (const platform of ['youtube', 'instagram', 'tiktok']) {
    const back = 'http://localhost:5173/app/'
    const start = await api(`/api/connections/${platform}/start?return=${encodeURIComponent(back)}`)
    assert.equal(start.status, 200, JSON.stringify(start.json))
    const url = new URL(start.json.url)
    assert.equal(url.searchParams.get('redirect_uri'), `http://localhost:8787/api/oauth/${platform}/callback`)
    assert.equal(url.searchParams.get('response_type'), 'code')
    const state = url.searchParams.get('state')

    // The platform redirects the browser back with ?code&state (Instagram adds "#_").
    const code = platform === 'instagram' ? 'the-code#_' : 'the-code'
    const cb = await fetch(`${base}/api/oauth/${platform}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, { redirect: 'manual' })
    assert.equal(cb.status, 302)
    assert.equal(cb.headers.get('location'), `${back}#connected=${platform}`)
  }
  const { json } = await api('/api/connections')
  assert.equal(json.platforms.youtube.connected, true)
  assert.equal(json.platforms.instagram.account, '@clipforge_test')
  assert.equal(json.platforms.tiktok.account, '@clipforge')
  // No token ever leaves the server.
  assert.ok(!JSON.stringify(json).includes('access'))
})

test('OAuth: a forged or mismatched state is rejected, and return URLs are checked', async () => {
  const bad = await fetch(`${base}/api/oauth/youtube/callback?code=x&state=abc.def`, { redirect: 'manual' })
  assert.equal(bad.status, 400)
  // A state minted for one platform cannot be replayed on another.
  const start = await api('/api/connections/tiktok/start')
  const state = new URL(start.json.url).searchParams.get('state')
  const cross = await fetch(`${base}/api/oauth/instagram/callback?code=x&state=${encodeURIComponent(state)}`, { redirect: 'manual' })
  assert.equal(cross.status, 400)
  // An off-site return URL is dropped rather than redirected to.
  const evil = await api(`/api/connections/youtube/start?return=${encodeURIComponent('https://evil.example/steal')}`)
  const st = new URL(evil.json.url).searchParams.get('state')
  const cb = await fetch(`${base}/api/oauth/youtube/callback?code=x&state=${encodeURIComponent(st)}`, { redirect: 'manual' })
  assert.equal(cb.status, 200)
  // A user-denied consent screen comes back as a readable error.
  const denied = await api(`/api/connections/youtube/start?return=${encodeURIComponent('http://localhost:5173/')}`)
  const st2 = new URL(denied.json.url).searchParams.get('state')
  const cb2 = await fetch(`${base}/api/oauth/youtube/callback?error=access_denied&state=${encodeURIComponent(st2)}`, { redirect: 'manual' })
  assert.match(cb2.headers.get('location'), /#connect_error=youtube:access_denied$/)
})

test('upload: a WebM clip is converted to a platform-ready MP4', { skip: !hasFfmpeg }, async () => {
  const body = await readFile(join(dir, 'clip.webm'))
  const up = await api('/api/media', { method: 'POST', headers: { 'content-type': 'video/webm;codecs=vp8,vorbis' }, body })
  assert.equal(up.status, 200, JSON.stringify(up.json))
  assert.equal(up.json.media.status, 'processing')
  media = await until(async () => {
    const { json } = await api(`/api/media/${up.json.media.id}`)
    assert.notEqual(json.media.status, 'failed', json.media.error)
    return json.media.status === 'ready' ? json.media : null
  }, 'conversion')
  assert.equal(media.mime, 'video/mp4')
  assert.equal(media.normalized, true)
  assert.equal(media.width, 540)
  assert.equal(media.height, 960)
  assert.ok(Math.abs(media.duration - 4) < 0.3)

  // The file is served with range support (the in-app player and Instagram need it).
  const whole = await fetch(`${base}${media.url}`)
  assert.equal(whole.status, 200)
  assert.equal(whole.headers.get('content-type'), 'video/mp4')
  const bytes = Buffer.from(await whole.arrayBuffer())
  assert.equal(bytes.length, media.size)
  const part = await fetch(`${base}${media.url}`, { headers: { range: 'bytes=0-99' } })
  assert.equal(part.status, 206)
  assert.equal((await part.arrayBuffer()).byteLength, 100)

  // What the platforms require: H.264 + AAC, yuv420p, 30fps, index at the front.
  writeFileSync(join(dir, 'out.mp4'), bytes)
  const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', join(dir, 'out.mp4')]).stdout)
  const v = probe.streams.find((s) => s.codec_type === 'video')
  const a = probe.streams.find((s) => s.codec_type === 'audio')
  assert.equal(v.codec_name, 'h264')
  assert.equal(v.pix_fmt, 'yuv420p')
  assert.equal(v.avg_frame_rate, '30/1')
  assert.equal(a.codec_name, 'aac')
  assert.ok(bytes.indexOf('moov') < bytes.indexOf('mdat'), 'moov atom should come before mdat (faststart)')
  // The audio survived the conversion (not silence).
  const vol = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', join(dir, 'out.mp4'), '-af', 'volumedetect', '-vn', '-f', 'null', '-']).stderr.toString()
  assert.ok(Number(/mean_volume: (-?[\d.]+) dB/.exec(vol)[1]) > -40, vol)
})

test('upload: a full-range browser recording comes out as standard yuv420p', { skip: !hasFfmpeg }, async () => {
  // Canvas recordings are full ("pc") range; left alone they encode as yuvj420p.
  const src = join(dir, 'pc.webm')
  const made = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=2',
    '-vf', 'scale=out_range=pc,format=yuv420p', '-color_range', 'pc', '-c:v', 'libvpx-vp9', '-b:v', '600k', src,
  ])
  assert.equal(made.status, 0)
  const up = await api('/api/media', { method: 'POST', headers: { 'content-type': 'video/webm' }, body: await readFile(src) })
  const done = await until(async () => {
    const { json } = await api(`/api/media/${up.json.media.id}`)
    assert.notEqual(json.media.status, 'failed', json.media.error)
    return json.media.status === 'ready' ? json.media : null
  }, 'conversion')
  const out = join(dir, 'pc-out.mp4')
  writeFileSync(out, Buffer.from(await (await fetch(`${base}${done.url}`)).arrayBuffer()))
  const streams = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', out]).stdout).streams
  const v = streams.find((s) => s.codec_type === 'video')
  assert.equal(v.pix_fmt, 'yuv420p')
  assert.equal(v.color_range, 'tv')
  // A silent source still gets an (empty) AAC track, which some platforms require.
  assert.equal(streams.find((s) => s.codec_type === 'audio')?.codec_name, 'aac')
  await api(`/api/media/${done.id}`, { method: 'DELETE' })
})

test('upload: junk and non-video bodies are refused', async () => {
  const notVideo = await api('/api/media', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello' })
  assert.equal(notVideo.status, 400)
  if (!hasFfmpeg) return
  const junk = await api('/api/media', { method: 'POST', headers: { 'content-type': 'video/mp4' }, body: Buffer.alloc(2048, 7) })
  assert.equal(junk.status, 200)
  const failed = await until(async () => {
    const { json } = await api(`/api/media/${junk.json.media.id}`)
    return json.media.status !== 'processing' ? json.media : null
  }, 'junk rejection')
  assert.equal(failed.status, 'failed')
  assert.match(failed.error, /Could not process the video/)
  const pub = await post('/api/publish', { mediaId: failed.id, targets: [{ platform: 'youtube' }] })
  assert.equal(pub.status, 400)
})

test('publish now: one clip goes out to all three platforms', { skip: !hasFfmpeg }, async () => {
  const r = await post('/api/publish', {
    mediaId: media.id,
    clipId: 'clip_1',
    title: 'Buzzer-beater from half court',
    caption: 'Down by 2, 1.9 seconds left… #sports #clutch',
    tags: ['#sports', '#clutch'],
    targets: [
      { platform: 'youtube', privacy: 'unlisted' },
      { platform: 'instagram', shareToFeed: true },
      { platform: 'tiktok', mode: 'direct', privacy: 'PUBLIC_TO_EVERYONE' },
    ],
  })
  assert.equal(r.status, 200, JSON.stringify(r.json))
  assert.equal(r.json.jobs.length, 3)
  const jobs = await jobsDone(r.json.jobs.map((j) => j.id))
  const by = Object.fromEntries(jobs.map((j) => [j.platform, j]))
  for (const j of jobs) assert.equal(j.status, 'published', `${j.platform}: ${j.error}`)
  assert.equal(by.youtube.clipId, 'clip_1')

  // YouTube received the exact file and the metadata.
  const yt = mock.state.youtube.videos.at(-1)
  assert.equal(yt.bytes, media.size)
  assert.equal(yt.head, 'ftyp')
  assert.equal(yt.snippet.title, 'Buzzer-beater from half court')
  assert.match(yt.snippet.description, /#Shorts/)
  assert.deepEqual(yt.snippet.tags, ['sports', 'clutch'])
  assert.equal(yt.status.privacyStatus, 'unlisted')
  assert.equal(by.youtube.url, `https://www.youtube.com/shorts/${yt.id}`)

  // Instagram: localhost is not publicly reachable, so the bytes were uploaded.
  const ig = mock.state.instagram.published.at(-1)
  assert.equal(ig.mode, 'resumable')
  assert.equal(ig.bytes, media.size)
  assert.equal(ig.caption, 'Down by 2, 1.9 seconds left… #sports #clutch')
  assert.equal(ig.shareToFeed, 'true')
  assert.equal(by.instagram.url, `https://www.instagram.com/reel/${ig.id}/`)

  // TikTok: whole file in one chunk, caption + privacy passed through.
  const tt = [...mock.state.tiktok.posts.values()].at(-1)
  assert.equal(tt.received, media.size)
  assert.equal(tt.kind, 'direct')
  assert.equal(tt.post.title, 'Down by 2, 1.9 seconds left… #sports #clutch')
  assert.equal(tt.post.privacy_level, 'PUBLIC_TO_EVERYONE')
  assert.equal(tt.post.disable_stitch, true, 'creator-level "stitch disabled" must be respected')
  assert.equal(by.tiktok.url, 'https://www.tiktok.com/@clipforge/video/7300000000000000001')

  // YouTube only reveals the channel name on upload: it is remembered.
  const { json } = await api('/api/connections')
  assert.equal(json.platforms.youtube.account, 'Mock Channel')
})

test('TikTok drafts: inbox mode ends as a draft, not a live post', { skip: !hasFfmpeg }, async () => {
  const r = await post('/api/publish', { mediaId: media.id, caption: 'x', targets: [{ platform: 'tiktok', mode: 'inbox' }] })
  const [job] = await jobsDone(r.json.jobs.map((j) => j.id))
  assert.equal(job.status, 'published')
  assert.equal(job.draft, true)
  assert.match(job.note, /TikTok inbox/)
  assert.equal(job.url, undefined)
})

test('TikTok: an unaudited app posting publicly fails with a plain-language reason, and retry works', { skip: !hasFfmpeg }, async () => {
  mock.state.tiktok.unaudited = true
  const r = await post('/api/publish', { mediaId: media.id, caption: 'x', targets: [{ platform: 'tiktok', privacy: 'PUBLIC_TO_EVERYONE' }] })
  const [job] = await jobsDone(r.json.jobs.map((j) => j.id))
  assert.equal(job.status, 'failed')
  assert.match(job.error, /has not audited this app/)
  assert.doesNotMatch(job.error, /unaudited_client/)

  mock.state.tiktok.unaudited = false
  const retry = await api(`/api/jobs/${job.id}/retry`, { method: 'POST' })
  assert.equal(retry.status, 200)
  const [again] = await jobsDone([job.id])
  assert.equal(again.status, 'published')
  assert.equal(again.error, undefined)
})

test('TikTok: a failure during processing is reported', { skip: !hasFfmpeg }, async () => {
  mock.state.tiktok.failNext = 'frame_rate_check_failed'
  const r = await post('/api/publish', { mediaId: media.id, caption: 'x', targets: [{ platform: 'tiktok' }] })
  const [job] = await jobsDone(r.json.jobs.map((j) => j.id))
  assert.equal(job.status, 'failed')
  assert.match(job.error, /frame rate/)
})

test('Instagram: a container that fails processing surfaces Instagram’s reason', { skip: !hasFfmpeg }, async () => {
  const original = mock.state.instagram.containers.set.bind(mock.state.instagram.containers)
  mock.state.instagram.containers.set = (k, v) => original(k, { ...v, fail: true })
  try {
    const r = await post('/api/publish', { mediaId: media.id, caption: 'x', targets: [{ platform: 'instagram' }] })
    const [job] = await jobsDone(r.json.jobs.map((j) => j.id))
    assert.equal(job.status, 'failed')
    assert.match(job.error, /Unsupported video format/)
  } finally {
    mock.state.instagram.containers.set = original
  }
})

test('scheduling: a post waits for its time, and can be cancelled before it', { skip: !hasFfmpeg }, async () => {
  const before = mock.state.youtube.videos.length
  const soon = await post('/api/publish', {
    mediaId: media.id, title: 'Scheduled', scheduledAt: new Date(Date.now() + 700).toISOString(), targets: [{ platform: 'youtube' }],
  })
  const later = await post('/api/publish', {
    mediaId: media.id, title: 'Never', scheduledAt: new Date(Date.now() + 3600_000).toISOString(), targets: [{ platform: 'youtube' }],
  })
  await sleep(250)
  const mid = await api(`/api/jobs?ids=${soon.json.jobs[0].id}`)
  assert.equal(mid.json.jobs[0].status, 'queued', 'must not go out before its time')
  assert.equal(mock.state.youtube.videos.length, before)

  const cancel = await api(`/api/jobs/${later.json.jobs[0].id}/cancel`, { method: 'POST' })
  assert.equal(cancel.json.job.status, 'canceled')

  const [done] = await jobsDone([soon.json.jobs[0].id])
  assert.equal(done.status, 'published')
  assert.equal(mock.state.youtube.videos.at(-1).snippet.title, 'Scheduled')
  assert.equal(mock.state.youtube.videos.length, before + 1, 'the cancelled post must never go out')
  // A finished post cannot be cancelled.
  assert.equal((await api(`/api/jobs/${done.id}/cancel`, { method: 'POST' })).status, 409)
  // A video with a post still waiting cannot be deleted out from under it.
  const pending = await post('/api/publish', { mediaId: media.id, scheduledAt: new Date(Date.now() + 3600_000).toISOString(), targets: [{ platform: 'youtube' }] })
  assert.equal((await api(`/api/media/${media.id}`, { method: 'DELETE' })).status, 409)
  await api(`/api/jobs/${pending.json.jobs[0].id}/cancel`, { method: 'POST' })
})

test('publish validation: unknown media, no platforms, disconnected platform', { skip: !hasFfmpeg }, async () => {
  assert.equal((await post('/api/publish', { mediaId: 'nope', targets: [{ platform: 'youtube' }] })).status, 400)
  assert.equal((await post('/api/publish', { mediaId: media.id, targets: [] })).status, 400)
  assert.equal((await api('/api/connections/tiktok', { method: 'DELETE' })).status, 200)
  const r = await post('/api/publish', { mediaId: media.id, targets: [{ platform: 'tiktok' }] })
  assert.equal(r.status, 400)
  assert.match(r.json.error, /Connect your TikTok account/)
})

test('another account cannot see or publish someone else’s clip', { skip: !hasFfmpeg }, async () => {
  const other = await api('/api/auth/register', {
    method: 'POST', auth: false, headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'other@example.com', password: 'another pass' }),
  })
  const h = { authorization: `Bearer ${other.json.token}` }
  assert.equal((await fetch(`${base}/api/media/${media.id}`, { headers: h })).status, 404)
  const jobs = await (await fetch(`${base}/api/jobs`, { headers: h })).json()
  assert.equal(jobs.jobs.length, 0)
})

test('TikTok chunk plan follows the media-transfer rules', () => {
  const MB = 1024 * 1024
  assert.deepEqual(tiktok.chunkPlan(3 * MB), { chunkSize: 3 * MB, count: 1 })
  assert.deepEqual(tiktok.chunkPlan(64 * MB), { chunkSize: 64 * MB, count: 1 })
  // 75 MB -> 7 chunks of 10 MB, the last one carrying the extra 5 MB.
  assert.deepEqual(tiktok.chunkPlan(75 * MB), { chunkSize: 10 * MB, count: 7 })
  for (const size of [65 * MB + 1, 99 * MB + 12345, 640 * MB]) {
    const { chunkSize, count } = tiktok.chunkPlan(size)
    assert.equal(count, Math.floor(size / chunkSize))
    const last = size - chunkSize * (count - 1)
    assert.ok(last >= chunkSize && last < 2 * chunkSize)
  }
})

test('TikTok: a large file is sent as sequential chunks', async () => {
  const MB = 1024 * 1024
  const big = join(dir, 'big.mp4')
  writeFileSync(big, Buffer.alloc(75 * MB + 321, 1))
  const result = await tiktok.publish(
    { access_token: 'tt-access-1', scope: 'video.publish,video.upload', account: { name: '@clipforge' } },
    { caption: 'big one', privacy: 'SELF_ONLY' },
    { path: big, mime: 'video/mp4' },
  )
  const p = [...mock.state.tiktok.posts.values()].at(-1)
  assert.equal(p.chunks, 7)
  assert.equal(p.received, statSync(big).size)
  // Private posts have no public id: no made-up link.
  assert.equal(result.url, 'https://www.tiktok.com/@clipforge')
  assert.match(result.note, /Private posts/)
})

test('Instagram: with a public HTTPS backend the clip is handed over by URL', async () => {
  const f = join(dir, 'ig.mp4')
  writeFileSync(f, Buffer.alloc(4096, 2))
  const tokens = { access_token: 'ig-long', account: { id: '17841400000000001' }, ig_ids: ['999', '17841400000000001'] }
  const result = await instagram.publish(
    tokens,
    { caption: 'hello', shareToFeed: false },
    { path: f, mime: 'video/mp4', publicUrl: 'https://clips.example.com/media/tok/clip.mp4' },
  )
  const ig = mock.state.instagram.published.at(-1)
  assert.equal(ig.mode, 'url')
  assert.equal(ig.videoUrl, 'https://clips.example.com/media/tok/clip.mp4')
  assert.equal(ig.shareToFeed, 'false')
  assert.match(result.url, /instagram\.com\/reel\//)
  // WebM never reaches Instagram.
  await assert.rejects(() => instagram.publish(tokens, {}, { path: f, mime: 'video/webm' }), /only accepts MP4/)
})

test('expired access tokens are refreshed before publishing', { skip: !hasFfmpeg }, async () => {
  const { db } = await import('../db.mjs')
  const row = db.prepare(`SELECT user_id, tokens FROM oauth WHERE provider = 'youtube'`).get()
  db.prepare(`UPDATE oauth SET tokens = ? WHERE provider = 'youtube'`).run(JSON.stringify({ ...JSON.parse(row.tokens), expires_at: Date.now() - 1000 }))
  const r = await post('/api/publish', { mediaId: media.id, title: 'after refresh', targets: [{ platform: 'youtube' }] })
  const [job] = await jobsDone(r.json.jobs.map((j) => j.id))
  assert.equal(job.status, 'published', job.error)
  assert.ok(mock.state.tokenCalls.some((c) => c.platform === 'youtube' && c.grant_type === 'refresh_token'))
  const saved = JSON.parse(db.prepare(`SELECT tokens FROM oauth WHERE provider = 'youtube'`).get().tokens)
  assert.equal(saved.access_token, 'yt-access-2')
  assert.ok(saved.expires_at > Date.now())
})
