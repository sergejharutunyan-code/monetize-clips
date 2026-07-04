import crypto from 'node:crypto'
import { db } from './db.mjs'

export function genId(prefix = 'u') {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`
}

/** scrypt password hashing (built-in crypto — no native deps). */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const dk = crypto.scryptSync(pw, salt, 64).toString('hex')
  return `${salt}:${dk}`
}

export function verifyPassword(pw, stored) {
  const [salt, dk] = String(stored).split(':')
  if (!salt || !dk) return false
  const test = crypto.scryptSync(pw, salt, 64).toString('hex')
  const a = Buffer.from(dk, 'hex')
  const b = Buffer.from(test, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function createSession(userId) {
  const token = crypto.randomBytes(24).toString('base64url')
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    new Date().toISOString(),
  )
  return token
}

export function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function userFromToken(token) {
  if (!token) return null
  const s = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token)
  if (!s) return null
  return db.prepare('SELECT id, email FROM users WHERE id = ?').get(s.user_id) || null
}

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

/** Express middleware — 401 unless a valid session token is present. */
export function requireAuth(req, res, next) {
  const user = userFromToken(bearer(req))
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  req.user = user
  next()
}

/** Signed state for OAuth round-trips (survives the redirect without a cookie). */
export function signState(payload) {
  const secret = process.env.CLIPFORGE_SECRET || 'dev-secret-change-me'
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyState(state) {
  try {
    const secret = process.env.CLIPFORGE_SECRET || 'dev-secret-change-me'
    const [body, sig] = String(state).split('.')
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url')
    if (!sig || sig.length !== expected.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    return JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return null
  }
}
