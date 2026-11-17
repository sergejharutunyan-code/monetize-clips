// Higgsfield render jobs: one generation per plot part. A worker submits
// queued renders, polls the running ones, and downloads finished videos into
// clip storage (Higgsfield's links expire). Renders survive a server restart:
// the request id is stored, so polling simply resumes.

import crypto from 'node:crypto'
import { db } from '../db.mjs'
import * as hf from './higgsfield.mjs'
import { ingestUrl, publicMedia } from './media.mjs'

const TICK_MS = Number(process.env.CLIPFORGE_TICK_MS || 4000)
const POLL_MS = () => Number(process.env.CLIPFORGE_RENDER_POLL_MS || 8000)
const MAX_ACTIVE_SUBMITS = 4
const GIVE_UP_MS = 45 * 60 * 1000

const now = () => new Date().toISOString()
const later = (ms) => new Date(Date.now() + ms).toISOString()

const set = (id, patch) => {
  const keys = Object.keys(patch)
  db.prepare(`UPDATE renders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
    ...keys.map((k) => patch[k]), now(), id,
  )
}

const LABEL = {
  queued: 'Waiting to start',
  submitted: 'Queued at Higgsfield',
  in_progress: 'Generating',
  downloading: 'Saving the video',
}

export function publicRender(row) {
  const media = row.media_id ? db.prepare('SELECT * FROM media WHERE id = ?').get(row.media_id) : null
  let duration
  try {
    duration = JSON.parse(row.body).duration
  } catch {
    // ignore
  }
  return {
    id: row.id,
    clipId: row.clip_id || undefined,
    partIndex: row.part_index,
    model: row.model,
    duration,
    // A render is only done once its video has been converted and is playable.
    status: row.status === 'completed' && media && media.status !== 'ready' ? (media.status === 'failed' ? 'failed' : 'downloading') : row.status,
    progress: LABEL[row.status],
    error: row.error || (media?.status === 'failed' ? media.error : undefined) || undefined,
    media: media ? publicMedia(media) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createRenders({ userId, clipId, model, parts, resolution, aspectRatio, generateAudio, extra }) {
  const t = now()
  const ins = db.prepare(
    `INSERT INTO renders (id, user_id, clip_id, part_index, model, body, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
  )
  const ids = []
  for (const p of parts) {
    const id = `r_${crypto.randomBytes(9).toString('base64url')}`
    const body = {
      ...(extra || {}),
      prompt: p.prompt,
      duration: p.duration,
      resolution,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    }
    ins.run(id, userId, clipId || null, p.index, model, JSON.stringify(body), t, t)
    ids.push(id)
  }
  setImmediate(tick)
  return ids.map((id) => db.prepare('SELECT * FROM renders WHERE id = ?').get(id))
}

export const getRender = (id, userId) => db.prepare('SELECT * FROM renders WHERE id = ? AND user_id = ?').get(id, userId) || null

export function listRenders(userId, { ids, clipId } = {}) {
  if (ids?.length) {
    return db.prepare(`SELECT * FROM renders WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`).all(userId, ...ids)
  }
  if (clipId) return db.prepare('SELECT * FROM renders WHERE user_id = ? AND clip_id = ? ORDER BY created_at DESC').all(userId, clipId)
  return db.prepare('SELECT * FROM renders WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').all(userId)
}

export async function cancelRender(row) {
  if (['completed', 'failed', 'canceled'].includes(row.status)) return false
  if (row.request_id) await hf.cancel(row.request_id, row.cancel_url).catch(() => false)
  set(row.id, { status: 'canceled', error: null })
  return true
}

export function retryRender(row) {
  if (!['failed', 'canceled'].includes(row.status)) return false
  set(row.id, { status: 'queued', request_id: null, cancel_url: null, media_id: null, error: null, attempts: 0, next_poll_at: null })
  setImmediate(tick)
  return true
}

const busy = new Set()

async function step(row) {
  if (row.status === 'queued') {
    try {
      const { requestId, cancelUrl } = await hf.submit(row.model, JSON.parse(row.body))
      set(row.id, { status: 'submitted', request_id: requestId, cancel_url: cancelUrl || null, next_poll_at: later(POLL_MS()) })
    } catch (e) {
      if (e.retryable && row.attempts < 5) set(row.id, { attempts: row.attempts + 1, next_poll_at: later(POLL_MS() * (row.attempts + 2)) })
      else set(row.id, { status: 'failed', error: String(e.message).slice(0, 500) })
    }
    return
  }
  // submitted / in_progress / downloading
  if (Date.now() - Date.parse(row.created_at) > GIVE_UP_MS) {
    set(row.id, { status: 'failed', error: 'Higgsfield did not finish this generation in time. Retry it.' })
    return
  }
  let s
  try {
    s = await hf.status(row.request_id)
  } catch (e) {
    if (e.retryable || !e.status) set(row.id, { next_poll_at: later(POLL_MS() * 2) })
    else set(row.id, { status: 'failed', error: String(e.message).slice(0, 500) })
    return
  }
  if (s.status === 'queued' || s.status === 'in_progress') {
    set(row.id, { status: s.status === 'queued' ? 'submitted' : 'in_progress', next_poll_at: later(POLL_MS()) })
    return
  }
  if (s.status === 'completed') {
    if (!s.videoUrl) {
      set(row.id, { status: 'failed', error: 'Higgsfield finished but returned no video link.' })
      return
    }
    set(row.id, { status: 'downloading' })
    try {
      const media = await ingestUrl(s.videoUrl, row.user_id)
      set(row.id, { status: 'completed', media_id: media.id, error: null })
    } catch (e) {
      set(row.id, { status: 'failed', error: String(e.message).slice(0, 500) })
    }
    return
  }
  const reason =
    s.status === 'nsfw'
      ? 'Higgsfield’s moderation rejected this generation (its credits are refunded). Reword the scene and retry.'
      : s.status === 'canceled'
        ? 'The generation was canceled at Higgsfield.'
        : `Higgsfield could not generate this part${s.error ? `: ${s.error}` : '.'}`
  set(row.id, { status: s.status === 'canceled' ? 'canceled' : 'failed', error: reason })
}

export async function tick() {
  if (!hf.isConfigured()) return
  const due = db
    .prepare(
      `SELECT * FROM renders WHERE status IN ('queued', 'submitted', 'in_progress')
         AND (next_poll_at IS NULL OR next_poll_at <= ?) ORDER BY created_at ASC LIMIT 20`,
    )
    .all(now())
  let submits = db.prepare(`SELECT COUNT(*) AS n FROM renders WHERE status IN ('submitted', 'in_progress', 'downloading')`).get().n
  for (const row of due) {
    if (busy.has(row.id)) continue
    if (row.status === 'queued') {
      if (submits >= MAX_ACTIVE_SUBMITS) continue
      submits++
    }
    busy.add(row.id)
    step(row)
      .catch((e) => console.error(`[render] ${row.id}:`, e?.message || e))
      .finally(() => busy.delete(row.id))
  }
}

let timer
export function startRenderWorker() {
  // A download interrupted by a restart is simply fetched again.
  db.prepare(`UPDATE renders SET status = 'in_progress', next_poll_at = NULL WHERE status = 'downloading'`).run()
  timer = setInterval(() => void tick(), TICK_MS)
  timer.unref?.()
  void tick()
}

export function stopRenderWorker() {
  clearInterval(timer)
}
