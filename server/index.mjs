// ClipForge backend: accounts, clip sync, clip storage + conversion, and
// publishing to YouTube, Instagram and TikTok (now or on a schedule). It also
// serves the built web app when one is present, so one process is the whole app.
// Run:  npm start   (Node 22+)

import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './db.mjs'
import { PORT, ALLOW_ORIGIN, APP_URL, PUBLIC_URL, isAllowedReturn, isPublicHttps, redirectUri } from './config.mjs'
import {
  genId, hashPassword, verifyPassword, createSession, deleteSession,
  requireAuth, userFromToken, signState, verifyState,
} from './auth.mjs'
import { analyzeVideo, MODEL } from './lib/claude.mjs'
import * as yt from './lib/youtube.mjs'
import {
  HAS_FFMPEG, receiveUpload, getMedia, getMediaByToken, deleteMedia, publicMedia, mediaPath, mimeForFile, resumeProcessing,
} from './lib/media.mjs'
import {
  PLATFORMS, isPlatform, describeConnections, getConnection, saveConnection, removeConnection,
} from './lib/connections.mjs'
import { createJob, getJob, listJobs, cancelJob, retryJob, publicJob, startWorker } from './lib/publisher.mjs'
import { PRIVACY as TIKTOK_PRIVACY } from './lib/tiktok.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function createApp() {
  const app = express()
  app.disable('x-powered-by')

  // CORS (token-based API, so no cookies/credentials needed).
  app.use((req, res, next) => {
    const origin = req.headers.origin
    const allowed = ALLOW_ORIGIN === '*' ? '*' : ALLOW_ORIGIN.split(',').map((s) => s.trim().replace(/\/+$/, ''))
    if (allowed === '*') res.set('Access-Control-Allow-Origin', '*')
    else if (origin && allowed.includes(origin)) res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' })
    res.set('Access-Control-Allow-Headers', 'content-type, authorization')
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.set('Access-Control-Max-Age', '600')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.use(express.json({ limit: '4mb' }))

  app.get('/health', (_req, res) =>
    res.json({
      ok: true,
      app: 'clipforge',
      model: MODEL,
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      youtubeTrending: Boolean(process.env.YOUTUBE_API_KEY),
      ffmpeg: HAS_FFMPEG,
      publish: Object.fromEntries(Object.entries(PLATFORMS).map(([id, mod]) => [id, mod.isConfigured()])),
      // Kept for older frontends.
      youtubePublish: yt.isConfigured(),
    }),
  )

  // ---- Auth ----
  app.post('/api/auth/register', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email.' })
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
      return res.status(409).json({ error: 'That email is already registered.' })
    const id = genId('u')
    db.prepare('INSERT INTO users (id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)').run(
      id, email, hashPassword(password), new Date().toISOString(),
    )
    res.json({ token: createSession(id), user: { id, email } })
  })

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (!u || !verifyPassword(password, u.pass_hash))
      return res.status(401).json({ error: 'Wrong email or password.' })
    res.json({ token: createSession(u.id), user: { id: u.id, email: u.email } })
  })

  app.post('/api/auth/logout', (req, res) => {
    const h = req.headers.authorization || ''
    if (h.startsWith('Bearer ')) deleteSession(h.slice(7))
    res.json({ ok: true })
  })

  app.get('/api/auth/me', (req, res) => {
    const h = req.headers.authorization || ''
    const user = userFromToken(h.startsWith('Bearer ') ? h.slice(7) : null)
    res.json({ user: user || null })
  })

  // ---- Clip sync (full-set pull/push) ----
  app.get('/api/clips', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT data FROM clips WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id)
    res.json({ clips: rows.map((r) => JSON.parse(r.data)) })
  })

  app.put('/api/clips', requireAuth, (req, res) => {
    const clips = Array.isArray(req.body?.clips) ? req.body.clips : null
    if (!clips) return res.status(400).json({ error: 'Expected { clips: [...] }.' })
    const now = new Date().toISOString()
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM clips WHERE user_id = ?').run(req.user.id)
      const ins = db.prepare('INSERT INTO clips (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)')
      for (const c of clips) {
        if (!c || !c.id) continue
        ins.run(String(c.id), req.user.id, JSON.stringify(c), now)
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      return res.status(500).json({ error: 'Failed to save clips.' })
    }
    res.json({ ok: true, count: clips.length })
  })

  // ---- Claude proxy (open; uses the server's key) ----
  app.post('/api/analyze', async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' })
    const { title, creator, niche } = req.body || {}
    if (!title) return res.status(400).json({ error: 'Missing "title".' })
    try {
      res.json(await analyzeVideo({ title, creator, niche }))
    } catch (e) {
      res.status(502).json({ error: e?.message || 'Analysis failed.' })
    }
  })

  // ---- YouTube trending (open; server's key) ----
  app.get('/api/trending', async (req, res) => {
    try {
      const videos = await yt.fetchTrending({ region: req.query.region, categoryId: req.query.categoryId || '' })
      res.json({ videos, live: true })
    } catch (e) {
      res.status(e?.status || 502).json({ error: e?.message || 'Trending fetch failed.' })
    }
  })

  // ---- Clip video storage ----
  // POST the rendered clip as the raw body (Content-Type: video/*). It is
  // streamed to disk, then converted in the background to a platform-ready MP4.
  app.post('/api/media', requireAuth, async (req, res) => {
    try {
      res.json({ media: publicMedia(await receiveUpload(req, req.user.id)) })
    } catch (e) {
      res.status(e?.status || 500).json({ error: e?.message || 'Upload failed.' })
    }
  })

  app.get('/api/media/:id', requireAuth, (req, res) => {
    const row = getMedia(req.params.id, req.user.id)
    if (!row) return res.status(404).json({ error: 'Clip video not found on the server.' })
    res.json({ media: publicMedia(row) })
  })

  app.delete('/api/media/:id', requireAuth, async (req, res) => {
    const row = getMedia(req.params.id, req.user.id)
    if (row) {
      const active = db.prepare(`SELECT 1 FROM jobs WHERE media_id = ? AND status IN ('queued', 'running')`).get(row.id)
      if (active) return res.status(409).json({ error: 'This video still has posts waiting to go out.' })
      await deleteMedia(row)
    }
    res.json({ ok: true })
  })

  // The file itself. The long random token in the path is the access control,
  // which lets the in-app player and Instagram's servers fetch it without a login.
  app.get('/media/:token/:name', (req, res) => {
    const row = getMediaByToken(req.params.token)
    if (!row || !row.file || row.status !== 'ready') return res.status(404).json({ error: 'Not found' })
    res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'private, max-age=3600' })
    res.type(mimeForFile(row.file))
    res.sendFile(mediaPath(row.file), { acceptRanges: true }, (err) => {
      if (err && !res.headersSent) res.status(err.status || 500).end()
    })
  })

  // ---- Platform connections (OAuth) ----
  app.get('/api/connections', requireAuth, (req, res) => {
    res.json({
      platforms: describeConnections(req.user.id),
      server: { ffmpeg: HAS_FFMPEG, publicUrl: PUBLIC_URL, reachable: isPublicHttps(PUBLIC_URL) },
    })
  })

  app.get('/api/connections/:platform/start', requireAuth, (req, res) => {
    const { platform } = req.params
    if (!isPlatform(platform)) return res.status(404).json({ error: 'Unknown platform.' })
    const mod = PLATFORMS[platform]
    if (!mod.isConfigured()) {
      return res.status(501).json({ error: `${mod.label} publishing is not set up on this backend yet. See BACKEND.md.` })
    }
    const back = String(req.query.return || '')
    const state = signState({ uid: req.user.id, p: platform, r: isAllowedReturn(back) ? back : '' })
    res.json({ url: mod.authUrl(state, redirectUri(platform)) })
  })

  app.delete('/api/connections/:platform', requireAuth, (req, res) => {
    if (!isPlatform(req.params.platform)) return res.status(404).json({ error: 'Unknown platform.' })
    removeConnection(req.user.id, req.params.platform)
    res.json({ ok: true })
  })

  app.get('/api/oauth/:platform/callback', async (req, res) => {
    const { platform } = req.params
    if (!isPlatform(platform)) return res.status(404).send('Unknown platform.')
    const mod = PLATFORMS[platform]
    const st = verifyState(req.query.state)
    if (!st?.uid || st.p !== platform) {
      return res.status(400).send('This sign-in link is invalid or has expired. Go back to ClipForge and press Connect again.')
    }
    const back = st.r || APP_URL
    const finish = (ok, message) => {
      if (back) {
        const hash = ok ? `connected=${platform}` : `connect_error=${platform}:${encodeURIComponent(message)}`
        return res.redirect(`${back.split('#')[0]}#${hash}`)
      }
      res
        .status(ok ? 200 : 400)
        .send(`<h2>${ok ? `${esc(mod.label)} connected ✓` : `Could not connect ${esc(mod.label)}`}</h2><p>${esc(ok ? 'You can close this tab and return to ClipForge.' : message)}</p>`)
    }
    if (req.query.error || !req.query.code) {
      return finish(false, String(req.query.error_description || req.query.error_reason || req.query.error || 'No authorization code was returned.'))
    }
    try {
      const tokens = await mod.exchangeCode(String(req.query.code), redirectUri(platform))
      // Keep an earlier refresh token if this grant did not include a new one.
      const prev = getConnection(st.uid, platform)
      saveConnection(st.uid, platform, { ...tokens, refresh_token: tokens.refresh_token || prev?.refresh_token })
      finish(true)
    } catch (e) {
      finish(false, e?.message || 'Token exchange failed.')
    }
  })

  // ---- Publishing ----
  // { mediaId, clipId?, title, caption, tags?, scheduledAt?, targets: [{ platform, ...options }] }
  app.post('/api/publish', requireAuth, (req, res) => {
    const b = req.body || {}
    const media = getMedia(String(b.mediaId || ''), req.user.id)
    if (!media) return res.status(400).json({ error: 'Upload the clip video first.' })
    if (media.status === 'failed') return res.status(400).json({ error: media.error || 'That video could not be processed.' })
    const targets = Array.isArray(b.targets) ? b.targets : []
    if (!targets.length) return res.status(400).json({ error: 'Pick at least one platform.' })

    let runAt = new Date()
    if (b.scheduledAt) {
      runAt = new Date(b.scheduledAt)
      if (Number.isNaN(runAt.getTime())) return res.status(400).json({ error: 'That schedule time is not valid.' })
    }

    const problems = []
    for (const t of targets) {
      if (!isPlatform(t?.platform)) problems.push(`Unknown platform “${t?.platform}”.`)
      else if (!PLATFORMS[t.platform].isConfigured()) problems.push(`${PLATFORMS[t.platform].label} is not set up on this backend.`)
      else if (!getConnection(req.user.id, t.platform)) problems.push(`Connect your ${PLATFORMS[t.platform].label} account first.`)
      else if (t.platform === 'instagram' && media.status === 'ready' && media.mime !== 'video/mp4' && media.mime !== 'video/quicktime')
        problems.push('Instagram needs an MP4. Install ffmpeg on the backend so clips are converted automatically.')
    }
    if (problems.length) return res.status(400).json({ error: problems.join(' ') })

    const title = String(b.title || '').trim()
    const caption = String(b.caption || '').trim()
    const tags = Array.isArray(b.tags) ? b.tags.map(String).slice(0, 30) : []
    const jobs = targets.map((t) => {
      const options = { title, caption, tags }
      if (t.platform === 'youtube') options.privacy = ['private', 'unlisted', 'public'].includes(t.privacy) ? t.privacy : 'private'
      if (t.platform === 'instagram') options.shareToFeed = t.shareToFeed !== false
      if (t.platform === 'tiktok') {
        options.mode = t.mode === 'inbox' ? 'inbox' : 'direct'
        options.privacy = TIKTOK_PRIVACY.includes(t.privacy) ? t.privacy : 'SELF_ONLY'
        options.disableComment = Boolean(t.disableComment)
        options.disableDuet = Boolean(t.disableDuet)
        options.disableStitch = Boolean(t.disableStitch)
      }
      return createJob({
        userId: req.user.id,
        clipId: b.clipId ? String(b.clipId) : undefined,
        mediaId: media.id,
        platform: t.platform,
        runAt: runAt.toISOString(),
        options,
      })
    })
    res.json({ jobs: jobs.map(publicJob) })
  })

  app.get('/api/jobs', requireAuth, (req, res) => {
    const ids = req.query.ids ? String(req.query.ids).split(',').filter(Boolean).slice(0, 200) : null
    res.json({ jobs: listJobs(req.user.id, ids).map(publicJob) })
  })

  app.post('/api/jobs/:id/cancel', requireAuth, (req, res) => {
    const row = getJob(req.params.id, req.user.id)
    if (!row) return res.status(404).json({ error: 'Post not found.' })
    if (!cancelJob(row)) return res.status(409).json({ error: 'That post is already going out or finished.' })
    res.json({ job: publicJob(getJob(row.id, req.user.id)) })
  })

  app.post('/api/jobs/:id/retry', requireAuth, (req, res) => {
    const row = getJob(req.params.id, req.user.id)
    if (!row) return res.status(404).json({ error: 'Post not found.' })
    if (!retryJob(row)) return res.status(409).json({ error: 'Only failed or cancelled posts can be retried.' })
    res.json({ job: publicJob(getJob(row.id, req.user.id)) })
  })

  // ---- The web app itself (when a build is present) ----
  const staticDir = [process.env.CLIPFORGE_STATIC_DIR, join(HERE, 'public'), join(HERE, '..', 'dist')]
    .filter(Boolean)
    .map((d) => resolve(d))
    .find((d) => existsSync(join(d, 'index.html')))
  if (staticDir) app.use(express.static(staticDir, { maxAge: '1h', index: 'index.html' }))
  app.locals.staticDir = staticDir

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
  return app
}

// Start listening only when run directly (tests import createApp instead).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp()
  resumeProcessing()
  startWorker()
  app.listen(PORT, () => {
    console.log(`ClipForge on http://localhost:${PORT}`)
    console.log(`  web app:      ${app.locals.staticDir ? 'served from ' + app.locals.staticDir : 'not built (run "npm run build" in the repo root)'}`)
    console.log(`  public URL:   ${PUBLIC_URL}`)
    console.log(`  ffmpeg:       ${HAS_FFMPEG ? 'found (clips are converted to MP4)' : 'MISSING: install ffmpeg so clips can be converted for Instagram/TikTok'}`)
    for (const [id, mod] of Object.entries(PLATFORMS)) {
      console.log(`  ${(mod.label + ':').padEnd(13)} ${mod.isConfigured() ? `configured  (redirect URI: ${redirectUri(id)})` : 'not configured'}`)
    }
    console.log(`  Claude:       ${process.env.ANTHROPIC_API_KEY ? `set (${MODEL})` : 'not configured'}`)
  })
}
