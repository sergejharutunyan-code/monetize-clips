// Clip storage: uploads are streamed to disk, then normalized with ffmpeg into
// the one format every platform accepts (MP4, H.264 + AAC, yuv420p, faststart).

import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import crypto from 'node:crypto'
import { db } from '../db.mjs'
import { MEDIA_DIR, MAX_UPLOAD_BYTES } from '../config.mjs'

mkdirSync(MEDIA_DIR, { recursive: true })

const works = (bin) => {
  try {
    return spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
}
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'
export const HAS_FFMPEG = works(FFMPEG) && works(FFPROBE)

const EXT_BY_MIME = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv' }
const MIME_BY_EXT = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska' }

export const mediaPath = (file) => join(MEDIA_DIR, file)

// The URL is known as soon as the upload lands (it 404s until conversion is
// done), so the client can store it right away.
function urlFor(row) {
  const file = row.file || row.src_file
  if (!file) return undefined
  const ext = HAS_FFMPEG || file.endsWith('.mp4') ? 'mp4' : file.split('.').pop()
  return `/media/${row.token}/clip.${ext}`
}

/** Shape sent to the client. `url` is relative to the backend's base URL. */
export function publicMedia(row) {
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    error: row.error || undefined,
    progress: row.status === 'processing' ? (progress.get(row.id) ?? 0) : undefined,
    url: urlFor(row),
    mime: row.mime || undefined,
    size: row.size ?? undefined,
    duration: row.duration ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    normalized: Boolean(row.normalized),
    createdAt: row.created_at,
  }
}

export const getMedia = (id, userId) =>
  db.prepare('SELECT * FROM media WHERE id = ? AND user_id = ?').get(id, userId) || null

export const getMediaByToken = (token) => db.prepare('SELECT * FROM media WHERE token = ?').get(token) || null

/** Stream the request body to disk and register it. Resolves to the media row. */
export function receiveUpload(req, userId) {
  return new Promise((resolve, reject) => {
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    if (!mime.startsWith('video/')) {
      return reject(Object.assign(new Error('Send the clip as the raw request body with a video/* content-type.'), { status: 400 }))
    }
    const declared = Number(req.headers['content-length'] || 0)
    if (declared > MAX_UPLOAD_BYTES) {
      return reject(Object.assign(new Error('That file is larger than this server accepts.'), { status: 413 }))
    }
    const id = `m_${crypto.randomBytes(9).toString('base64url')}`
    const ext = EXT_BY_MIME[mime] || 'bin'
    const srcFile = `${id}.src.${ext}`
    const out = createWriteStream(mediaPath(srcFile))
    let bytes = 0
    let failed = false
    const fail = (err) => {
      if (failed) return
      failed = true
      out.destroy()
      unlink(mediaPath(srcFile)).catch(() => {})
      reject(err)
    }
    req.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_UPLOAD_BYTES) {
        req.unpipe(out)
        fail(Object.assign(new Error('That file is larger than this server accepts.'), { status: 413 }))
      }
    })
    req.on('error', fail)
    req.on('aborted', () => fail(Object.assign(new Error('Upload was interrupted.'), { status: 400 })))
    out.on('error', fail)
    out.on('finish', () => {
      if (failed) return
      if (bytes === 0) return fail(Object.assign(new Error('The upload was empty.'), { status: 400 }))
      db.prepare(
        `INSERT INTO media (id, user_id, token, status, src_file, mime, size, created_at)
         VALUES (?, ?, ?, 'processing', ?, ?, ?, ?)`,
      ).run(id, userId, crypto.randomBytes(24).toString('base64url'), srcFile, mime, bytes, new Date().toISOString())
      enqueue(id)
      resolve(db.prepare('SELECT * FROM media WHERE id = ?').get(id))
    })
    req.pipe(out)
  })
}

export async function deleteMedia(row) {
  for (const f of [row.file, row.src_file]) if (f) await unlink(mediaPath(f)).catch(() => {})
  db.prepare('DELETE FROM media WHERE id = ?').run(row.id)
  progress.delete(row.id)
}

// ---- ffmpeg ----

function run(bin, args, onStdout) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => {
      const s = d.toString()
      if (onStdout) onStdout(s)
      else out += s
    })
    p.stderr.on('data', (d) => {
      err = (err + d.toString()).slice(-4000)
    })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim().split('\n').slice(-3).join(' ') || `${bin} exited ${code}`))))
  })
}

const rate = (s) => {
  const [n, d] = String(s || '0/1').split('/').map(Number)
  return d ? n / d : 0
}

export async function probe(path) {
  const raw = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path])
  const j = JSON.parse(raw)
  const v = (j.streams || []).find((s) => s.codec_type === 'video')
  const a = (j.streams || []).find((s) => s.codec_type === 'audio')
  const rotated = Math.abs(Number(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation || 0)) % 180 === 90
  return {
    format: j.format?.format_name || '',
    duration: Number(j.format?.duration) || Number(v?.duration) || 0,
    video: v
      ? {
          codec: v.codec_name,
          width: rotated ? v.height : v.width,
          height: rotated ? v.width : v.height,
          pixFmt: v.pix_fmt,
          fps: rate(v.avg_frame_rate),
          rFps: rate(v.r_frame_rate),
          rotated,
        }
      : null,
    audio: a ? { codec: a.codec_name, sampleRate: Number(a.sample_rate) || 0, channels: a.channels || 0 } : null,
  }
}

/** A file is "clean" when it is already what the platforms want and can be remuxed untouched. */
function isClean(info) {
  const v = info.video
  if (!v) return false
  const steady = v.fps > 0 && Math.abs(v.fps - v.rFps) < 0.5 && v.fps >= 23 && v.fps <= 60.5
  return (
    /mp4|mov/.test(info.format) &&
    v.codec === 'h264' &&
    v.pixFmt === 'yuv420p' &&
    !v.rotated &&
    Math.max(v.width, v.height) <= 1920 &&
    v.width % 2 === 0 &&
    v.height % 2 === 0 &&
    steady &&
    info.audio?.codec === 'aac' &&
    info.audio.sampleRate <= 48000
  )
}

async function normalize(id, src, dst, info) {
  const common = ['-hide_banner', '-loglevel', 'error', '-y', '-nostdin']
  const tail = ['-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', dst]
  let args
  if (process.env.CLIPFORGE_NORMALIZE !== 'always' && isClean(info)) {
    // Already platform-ready: just rewrite the container with the index up front.
    args = [...common, '-i', src, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', ...tail]
  } else {
    // Long side capped at 1920, even dimensions, constant 30fps, closed 2s GOP,
    // and standard (limited-range) 4:2:0 colour — browser recordings come in
    // full range, which some platform encoders reject or wash out.
    const vf =
      "scale=w='if(gt(iw,ih),min(1920,iw),-2)':h='if(gt(iw,ih),-2,min(1920,ih))'," +
      'scale=trunc(iw/2)*2:trunc(ih/2)*2:out_range=tv,fps=30,format=yuv420p'
    const inputs = ['-i', src]
    const maps = ['-map', '0:v:0']
    if (info.audio) maps.push('-map', '0:a:0')
    else {
      // Some platform pipelines reject files with no audio track: add silence.
      inputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
      maps.push('-map', '1:a:0', '-shortest')
    }
    args = [
      ...common, ...inputs, ...maps,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', process.env.CLIPFORGE_X264_PRESET || 'veryfast', '-crf', '20',
      '-profile:v', 'high', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
      '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      '-max_muxing_queue_size', '1024',
      ...tail,
    ]
  }
  const total = info.duration > 0 ? info.duration * 1e6 : 0
  await run(FFMPEG, args, (s) => {
    const m = /out_time_(?:us|ms)=(\d+)/.exec(s)
    if (m && total) progress.set(id, Math.min(0.99, Number(m[1]) / total))
  })
}

// ---- processing queue (one at a time: ffmpeg is the heavy part) ----

const progress = new Map()
const pending = []
let busy = false

function enqueue(id) {
  pending.push(id)
  void drain()
}

async function drain() {
  if (busy) return
  busy = true
  try {
    while (pending.length) await processOne(pending.shift())
  } finally {
    busy = false
  }
}

async function processOne(id) {
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id)
  if (!row || row.status !== 'processing' || !row.src_file) return
  const src = mediaPath(row.src_file)
  const ext = row.src_file.split('.').pop()
  try {
    if (!HAS_FFMPEG) {
      // No ffmpeg on this machine: keep the upload as-is. MP4 uploads still publish.
      const file = `${id}.${ext}`
      await rename(src, mediaPath(file))
      db.prepare(`UPDATE media SET status = 'ready', file = ?, src_file = NULL, normalized = 0 WHERE id = ?`).run(file, id)
      return
    }
    const info = await probe(src)
    if (!info.video) throw new Error('That file has no video track.')
    const file = `${id}.mp4`
    await normalize(id, src, mediaPath(file), info)
    const out = await probe(mediaPath(file))
    const { size } = await stat(mediaPath(file))
    db.prepare(
      `UPDATE media SET status = 'ready', file = ?, src_file = NULL, mime = 'video/mp4', size = ?, duration = ?,
         width = ?, height = ?, vcodec = ?, acodec = ?, normalized = 1 WHERE id = ?`,
    ).run(file, size, out.duration, out.video?.width ?? null, out.video?.height ?? null, out.video?.codec ?? null, out.audio?.codec ?? null, id)
    await unlink(src).catch(() => {})
  } catch (e) {
    await unlink(mediaPath(`${id}.mp4`)).catch(() => {})
    await unlink(src).catch(() => {})
    db.prepare(`UPDATE media SET status = 'failed', error = ?, src_file = NULL WHERE id = ?`).run(
      `Could not process the video: ${e?.message || e}`.slice(0, 500), id,
    )
  } finally {
    progress.delete(id)
  }
}

/** Resume anything that was mid-processing when the server last stopped. */
export function resumeProcessing() {
  for (const row of db.prepare(`SELECT id, src_file FROM media WHERE status = 'processing'`).all()) {
    if (row.src_file && existsSync(mediaPath(row.src_file))) enqueue(row.id)
    else db.prepare(`UPDATE media SET status = 'failed', error = 'The upload was lost before it could be processed.' WHERE id = ?`).run(row.id)
  }
}

export const mimeForFile = (file) => MIME_BY_EXT[String(file).split('.').pop()] || 'application/octet-stream'
