// ClipForge backend: accounts, clip sync, Claude + YouTube proxies, publishing.
// Run:  ANTHROPIC_API_KEY=… YOUTUBE_API_KEY=… npm start   (Node 22+)

import express from 'express'
import { db } from './db.mjs'
import {
  genId, hashPassword, verifyPassword, createSession, deleteSession,
  requireAuth, userFromToken, signState, verifyState,
} from './auth.mjs'
import { analyzeVideo, MODEL } from './lib/claude.mjs'
import * as yt from './lib/youtube.mjs'

const PORT = Number(process.env.PORT || 8787)
const ALLOW_ORIGIN = process.env.CLIPFORGE_ALLOW_ORIGIN || '*'
const APP_URL = process.env.CLIPFORGE_APP_URL || ''

const app = express()
app.disable('x-powered-by')

// CORS (token-based API, so no cookies/credentials needed).
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', ALLOW_ORIGIN)
  res.set('Access-Control-Allow-Headers', 'content-type, authorization')
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({ limit: '4mb' }))

const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)

app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    model: MODEL,
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    youtubeTrending: Boolean(process.env.YOUTUBE_API_KEY),
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

// ---- Publishing: YouTube (real, gated on your Google OAuth app) ----
app.get('/api/publish/youtube/status', requireAuth, (req, res) => {
  const connected = Boolean(db.prepare('SELECT 1 FROM oauth WHERE user_id = ? AND provider = ?').get(req.user.id, 'youtube'))
  res.json({ configured: yt.isConfigured(), connected })
})

app.get('/api/publish/youtube/connect', requireAuth, (req, res) => {
  if (!yt.isConfigured()) return res.status(501).json({ error: 'YouTube publishing is not configured (set GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).' })
  const state = signState({ uid: req.user.id, n: Date.now() })
  res.json({ url: yt.authUrl(state) })
})

app.get('/api/oauth/youtube/callback', async (req, res) => {
  const st = verifyState(req.query.state)
  if (!st?.uid) return res.status(400).send('Invalid state.')
  if (req.query.error) return res.status(400).send(`OAuth error: ${req.query.error}`)
  try {
    const tokens = await yt.exchangeCode(String(req.query.code))
    db.prepare('INSERT OR REPLACE INTO oauth (user_id, provider, tokens) VALUES (?, ?, ?)').run(
      st.uid, 'youtube', JSON.stringify(tokens),
    )
    if (APP_URL) return res.redirect(`${APP_URL}#youtube=connected`)
    res.send('<h2>YouTube connected ✓</h2><p>You can close this tab and return to ClipForge.</p>')
  } catch (e) {
    res.status(502).send(`Token exchange failed: ${e.message}`)
  }
})

// POST the exported clip bytes (Content-Type: video/*). Metadata in query string.
app.post('/api/publish/youtube', requireAuth, express.raw({ type: 'video/*', limit: '512mb' }), async (req, res) => {
  if (!yt.isConfigured()) return res.status(501).json({ error: 'YouTube publishing is not configured.' })
  const row = db.prepare('SELECT tokens FROM oauth WHERE user_id = ? AND provider = ?').get(req.user.id, 'youtube')
  if (!row) return res.status(400).json({ error: 'Connect your YouTube account first.' })
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'Send the video as the raw body with a video/* content-type.' })
  try {
    const stored = JSON.parse(row.tokens)
    const accessToken = stored.refresh_token ? await yt.refreshToken(stored.refresh_token) : stored.access_token
    const result = await yt.uploadVideo(
      accessToken,
      {
        title: req.query.title,
        description: req.query.description,
        privacyStatus: req.query.privacy || 'private',
        tags: req.query.tags ? String(req.query.tags).split(',') : [],
      },
      req.body,
    )
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(502).json({ error: e?.message || 'Publish failed.' })
  }
})

// ---- Instagram / TikTok: real API shapes, gated on an approved developer app ----
for (const platform of ['instagram', 'tiktok']) {
  app.post(`/api/publish/${platform}`, requireAuth, (_req, res) =>
    res.status(501).json({
      error: `${platform} publishing requires an approved ${platform} developer app and access token. ` +
        `The integration is scaffolded — add credentials and the platform's Content Publishing flow to enable it. See BACKEND.md.`,
    }),
  )
}

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

app.listen(PORT, () => {
  console.log(`ClipForge backend on http://localhost:${PORT}`)
  console.log(`  model: ${MODEL}`)
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'missing'}`)
  console.log(`  YOUTUBE_API_KEY:   ${process.env.YOUTUBE_API_KEY ? 'set' : 'missing'}`)
  console.log(`  YouTube publish:   ${yt.isConfigured() ? 'configured' : 'not configured'}`)
})
