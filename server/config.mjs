// Central place for environment-derived settings.

import { dirname, join, resolve } from 'node:path'

const strip = (s) => String(s || '').trim().replace(/\/+$/, '')

export const PORT = Number(process.env.PORT || 8787)
export const ALLOW_ORIGIN = process.env.CLIPFORGE_ALLOW_ORIGIN || '*'
export const APP_URL = strip(process.env.CLIPFORGE_APP_URL)

export const DB_PATH = process.env.CLIPFORGE_DB || './data/clipforge.db'
const dataDir = DB_PATH === ':memory:' ? './data' : dirname(DB_PATH)
export const MEDIA_DIR = resolve(process.env.CLIPFORGE_MEDIA_DIR || join(dataDir, 'media'))
export const MAX_UPLOAD_BYTES = Number(process.env.CLIPFORGE_MAX_UPLOAD_MB || 1024) * 1024 * 1024

const originOf = (u) => {
  try {
    return new URL(u).origin
  } catch {
    return ''
  }
}

/**
 * The URL this backend is reachable at from the internet. Used to build OAuth
 * redirect URIs and the video URL Instagram fetches. Render sets
 * RENDER_EXTERNAL_URL automatically; elsewhere set CLIPFORGE_PUBLIC_URL.
 */
export const PUBLIC_URL =
  strip(process.env.CLIPFORGE_PUBLIC_URL) ||
  strip(process.env.RENDER_EXTERNAL_URL) ||
  originOf(process.env.GOOGLE_REDIRECT_URI) ||
  `http://localhost:${PORT}`

/** True when a URL can be fetched by a platform's servers (public HTTPS, not localhost). */
export function isPublicHttps(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return !/^(localhost|127\.|10\.|192\.168\.|\[?::1)/.test(u.hostname)
  } catch {
    return false
  }
}

const REDIRECT_ENV = {
  youtube: 'GOOGLE_REDIRECT_URI',
  instagram: 'INSTAGRAM_REDIRECT_URI',
  tiktok: 'TIKTOK_REDIRECT_URI',
}

/** The OAuth redirect URI to register in each platform's developer console. */
export function redirectUri(platform) {
  return strip(process.env[REDIRECT_ENV[platform]]) || `${PUBLIC_URL}/api/oauth/${platform}/callback`
}

/** Where the browser may be sent back to after OAuth (prevents open redirects). */
export function isAllowedReturn(url) {
  const origin = originOf(url)
  if (!origin) return false
  if (origin === PUBLIC_URL || origin === originOf(APP_URL)) return true
  if (ALLOW_ORIGIN !== '*') return ALLOW_ORIGIN.split(',').map((s) => strip(s)).includes(origin)
  // Open CORS is the local-dev default: only bounce back to a local page.
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}
