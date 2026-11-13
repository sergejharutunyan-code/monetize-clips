// Publish jobs: one clip -> one platform, now or at a scheduled time. A small
// in-process worker picks up due jobs, so scheduled posts go out on their own
// for as long as this server is running.

import crypto from 'node:crypto'
import { db } from '../db.mjs'
import { PUBLIC_URL } from '../config.mjs'
import { PLATFORMS, freshTokens, getConnection, saveConnection } from './connections.mjs'
import { mediaPath, publicMedia } from './media.mjs'

const MAX_PARALLEL = 2
const TICK_MS = Number(process.env.CLIPFORGE_TICK_MS || 4000)
const running = new Set()

const now = () => new Date().toISOString()

export function publicJob(row) {
  let result = {}
  try {
    result = row.result ? JSON.parse(row.result) : {}
  } catch {
    // ignore
  }
  return {
    id: row.id,
    clipId: row.clip_id || undefined,
    mediaId: row.media_id,
    platform: row.platform,
    status: row.status,
    runAt: row.run_at,
    progress: row.progress || undefined,
    url: result.url,
    externalId: result.id,
    draft: result.draft || undefined,
    note: result.note,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createJob({ userId, clipId, mediaId, platform, runAt, options }) {
  const id = `j_${crypto.randomBytes(9).toString('base64url')}`
  const t = now()
  db.prepare(
    `INSERT INTO jobs (id, user_id, clip_id, media_id, platform, status, run_at, options, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
  ).run(id, userId, clipId || null, mediaId, platform, runAt, JSON.stringify(options || {}), t, t)
  setImmediate(tick)
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id)
}

export const getJob = (id, userId) => db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(id, userId) || null

export function listJobs(userId, ids) {
  if (ids?.length) {
    const marks = ids.map(() => '?').join(',')
    return db.prepare(`SELECT * FROM jobs WHERE user_id = ? AND id IN (${marks})`).all(userId, ...ids)
  }
  return db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').all(userId)
}

const set = (id, patch) => {
  const keys = Object.keys(patch)
  db.prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
    ...keys.map((k) => patch[k]), now(), id,
  )
}

export function cancelJob(row) {
  if (row.status !== 'queued') return false
  set(row.id, { status: 'canceled', progress: null })
  return true
}

export function retryJob(row) {
  if (row.status !== 'failed' && row.status !== 'canceled') return false
  set(row.id, { status: 'queued', run_at: now(), error: null, progress: null })
  setImmediate(tick)
  return true
}

async function runJob(job) {
  const mod = PLATFORMS[job.platform]
  const media = db.prepare('SELECT * FROM media WHERE id = ? AND user_id = ?').get(job.media_id, job.user_id)
  if (!media) throw new Error('The clip video is no longer on the server. Open the clip and publish again.')
  if (media.status !== 'ready') throw new Error(media.error || 'The clip video could not be processed.')

  const tokens = await freshTokens(job.user_id, job.platform)
  const options = JSON.parse(job.options || '{}')
  const result = await mod.publish(
    tokens,
    options,
    {
      path: mediaPath(media.file),
      mime: media.mime,
      width: media.width ?? undefined,
      height: media.height ?? undefined,
      duration: media.duration ?? undefined,
      publicUrl: `${PUBLIC_URL}${publicMedia(media).url}`,
    },
    { onProgress: (progress) => set(job.id, { progress }) },
  )
  // Platforms that only reveal the account name on upload (YouTube): remember it.
  if (result.account?.name) {
    const conn = getConnection(job.user_id, job.platform)
    if (conn && conn.account?.name !== result.account.name) saveConnection(job.user_id, job.platform, { ...conn, account: result.account })
  }
  return result
}

export async function tick() {
  if (running.size >= MAX_PARALLEL) return
  const due = db
    .prepare(`SELECT * FROM jobs WHERE status = 'queued' AND run_at <= ? ORDER BY run_at ASC LIMIT 10`)
    .all(now())
  for (const job of due) {
    if (running.size >= MAX_PARALLEL) break
    if (running.has(job.id)) continue
    // The clip may still be converting: leave the job queued until it is ready.
    const media = db.prepare('SELECT status FROM media WHERE id = ?').get(job.media_id)
    if (media?.status === 'processing') {
      if (job.progress !== 'Converting the video') set(job.id, { progress: 'Converting the video' })
      continue
    }
    running.add(job.id)
    set(job.id, { status: 'running', progress: 'Starting' })
    runJob(job)
      .then((result) => {
        const { account: _account, ...rest } = result
        set(job.id, { status: 'published', progress: null, error: null, result: JSON.stringify(rest) })
      })
      .catch((e) => {
        console.error(`[publish] ${job.platform} job ${job.id} failed:`, e?.message || e)
        set(job.id, { status: 'failed', progress: null, error: String(e?.message || e).slice(0, 600) })
      })
      .finally(() => running.delete(job.id))
  }
}

let timer
export function startWorker() {
  // A job caught mid-flight by a restart may or may not have gone out: never
  // re-send it automatically, surface it so the person can check and retry.
  db.prepare(
    `UPDATE jobs SET status = 'failed', progress = NULL, updated_at = ?,
       error = 'The server restarted while this was publishing. Check the platform, then retry if it did not go out.'
     WHERE status = 'running'`,
  ).run(now())
  timer = setInterval(() => void tick(), TICK_MS)
  timer.unref?.()
  void tick()
}

export function stopWorker() {
  clearInterval(timer)
}
