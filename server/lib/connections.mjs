// Connected platform accounts (OAuth tokens) per user.

import { db } from '../db.mjs'
import { redirectUri } from '../config.mjs'
import * as youtube from './youtube.mjs'
import * as instagram from './instagram.mjs'
import * as tiktok from './tiktok.mjs'
import { PlatformError } from './http.mjs'

export const PLATFORMS = { youtube, instagram, tiktok }
export const isPlatform = (p) => Object.hasOwn(PLATFORMS, p)

const SETUP_HINT = {
  youtube: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the backend.',
  instagram: 'Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET on the backend.',
  tiktok: 'Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET on the backend.',
}

export function getConnection(userId, platform) {
  const row = db.prepare('SELECT tokens FROM oauth WHERE user_id = ? AND provider = ?').get(userId, platform)
  if (!row) return null
  try {
    return JSON.parse(row.tokens)
  } catch {
    return null
  }
}

export function saveConnection(userId, platform, tokens) {
  db.prepare('INSERT OR REPLACE INTO oauth (user_id, provider, tokens) VALUES (?, ?, ?)').run(
    userId, platform, JSON.stringify(tokens),
  )
}

export function removeConnection(userId, platform) {
  db.prepare('DELETE FROM oauth WHERE user_id = ? AND provider = ?').run(userId, platform)
}

/** Status of every platform for the Accounts screen. Never includes tokens. */
export function describeConnections(userId) {
  const out = {}
  for (const [id, mod] of Object.entries(PLATFORMS)) {
    const conn = getConnection(userId, id)
    out[id] = {
      label: mod.label,
      configured: mod.isConfigured(),
      connected: Boolean(conn),
      account: conn?.account?.name || undefined,
      scopes: conn?.scope ? String(conn.scope).split(/[ ,]+/).filter(Boolean) : undefined,
      redirectUri: redirectUri(id),
      setup: mod.isConfigured() ? undefined : SETUP_HINT[id],
    }
  }
  return out
}

/** Tokens that are valid right now, refreshing (and saving) them when needed. */
export async function freshTokens(userId, platform) {
  const mod = PLATFORMS[platform]
  let tokens = getConnection(userId, platform)
  if (!tokens) throw new PlatformError(`Connect your ${mod.label} account first (Accounts tab).`, { code: 'reconnect' })
  if (mod.needsRefresh(tokens)) {
    tokens = await mod.refresh(tokens)
    saveConnection(userId, platform, tokens)
  }
  return tokens
}
