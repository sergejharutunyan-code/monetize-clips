import type { AspectRatio } from './types'

export interface RenderParams {
  startSec: number
  endSec: number
  target: { w: number; h: number }
  /** Horizontal focus of the crop, 0 (left) … 1 (right). */
  focusX: number
  /** Vertical focus of the crop, 0 (top) … 1 (bottom). */
  focusY?: number
  /** Extra zoom on top of cover-fit, >= 1. */
  zoom: number
  caption?: string
}

export type Quality = '1080p' | '720p'

/** Output frame size. 1080p is what the platforms recommend for vertical video. */
export function targetDims(ratio: AspectRatio, quality: Quality = '1080p'): { w: number; h: number } {
  const short = quality === '1080p' ? 1080 : 720
  const long = quality === '1080p' ? 1920 : 1280
  if (ratio === '9:16') return { w: short, h: long }
  if (ratio === '16:9') return { w: long, h: short }
  return { w: short, h: short }
}

/** Kept for callers that only need the default (1080p) sizes. */
export const TARGET_DIMS: Record<AspectRatio, { w: number; h: number }> = {
  '9:16': targetDims('9:16'),
  '1:1': targetDims('1:1'),
  '16:9': targetDims('16:9'),
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Draw one cropped, reframed video frame (plus caption) onto the canvas. */
export function drawFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, p: RenderParams) {
  const { w: TW, h: TH } = p.target
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, TW, TH)
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (vw && vh) {
    const base = Math.max(TW / vw, TH / vh) * (p.zoom || 1)
    const dw = vw * base
    const dh = vh * base
    const dx = (TW - dw) * clamp(p.focusX, 0, 1)
    const dy = (TH - dh) * clamp(p.focusY ?? 0.5, 0, 1)
    ctx.drawImage(video, dx, dy, dw, dh)
  }
  if (p.caption) drawCaption(ctx, p.caption, TW, TH)
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, TW: number, TH: number) {
  const fontSize = Math.round(TW * 0.058)
  ctx.font = `800 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const maxW = TW * 0.9
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  const lineH = fontSize * 1.2
  let y = TH * 0.86 - (lines.length - 1) * lineH
  ctx.lineWidth = Math.max(3, fontSize * 0.14)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(0,0,0,0.92)'
  ctx.fillStyle = '#fff'
  for (const l of lines) {
    ctx.strokeText(l, TW / 2, y)
    ctx.fillText(l, TW / 2, y)
    y += lineH
  }
}

/** A small JPEG poster of whatever is on the canvas right now. */
export function makeThumb(canvas: HTMLCanvasElement, width = 180): string | undefined {
  try {
    const t = document.createElement('canvas')
    t.width = width
    t.height = Math.round((canvas.height / canvas.width) * width)
    t.getContext('2d')?.drawImage(canvas, 0, 0, t.width, t.height)
    return t.toDataURL('image/jpeg', 0.7)
  } catch {
    return undefined // tainted canvas
  }
}

// ---- recording format ----

// MP4 with H.264 video AND AAC audio is the one format Instagram, TikTok and
// YouTube all accept as-is, so ask for exactly that first.
const MP4_AAC = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
]
// Safari and every iOS browser record MP4 as H.264 + AAC even when the audio
// codec is not spelled out. Elsewhere a bare "avc1" or "video/mp4" can come
// back with Opus or VP9 inside, which the platforms' apps do not take — there
// WebM is the honest fallback (the backend converts it to MP4).
const WEBKIT_MP4 = ['video/mp4;codecs=avc1', 'video/mp4']
const WEBM = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

const isWebKit = () => /AppleWebKit/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg\/|OPR\/|Android/i.test(navigator.userAgent)

export function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const order = [...MP4_AAC, ...(isWebKit() ? WEBKIT_MP4 : []), ...WEBM, 'video/mp4']
  for (const c of order) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

export function extForMime(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm'
}

/**
 * True when a recording can be handed to every platform without conversion:
 * an MP4 we know holds H.264 + AAC (we asked for it, or the browser always does).
 */
export function isPlatformReady(requested: string, recorded: string): boolean {
  const both = `${requested} ${recorded}`.toLowerCase()
  if (!both.includes('mp4') || /webm|vp0?9|vp0?8|av01|opus|vorbis|flac/.test(both)) return false
  return /mp4a|aac/.test(both) || isWebKit()
}

// ---- audio ----
//
// The source <video> is NOT muted (a muted element feeds silence into Web
// Audio, which is how exports used to come out silent). Instead its sound is
// routed through an audio graph: one branch is recorded, the other goes to the
// speakers through a gain node so the preview can be muted independently.

interface Graph {
  ctx: AudioContext
  capture: MediaStreamAudioDestinationNode
  monitor: GainNode
}

let sharedCtx: AudioContext | null = null
const graphs = new WeakMap<HTMLVideoElement, Graph | null>()
/** Whether the person wants to hear each source while editing (default: yes). */
const audible = new WeakMap<HTMLVideoElement, boolean>()

function audioContext(): AudioContext | null {
  if (sharedCtx) return sharedCtx
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    sharedCtx = new Ctor()
  } catch {
    sharedCtx = null
  }
  return sharedCtx
}

/**
 * Wire a video element's sound into the audio graph. Call from a user gesture
 * (play / export click) so the browser lets the audio context start.
 */
export function attachAudio(video: HTMLVideoElement): Graph | null {
  let g = graphs.get(video)
  if (g === undefined) {
    g = null
    const ctx = audioContext()
    if (ctx) {
      try {
        const src = ctx.createMediaElementSource(video)
        const capture = ctx.createMediaStreamDestination()
        const monitor = ctx.createGain()
        src.connect(capture)
        src.connect(monitor)
        monitor.connect(ctx.destination)
        g = { ctx, capture, monitor }
      } catch {
        g = null
      }
    }
    graphs.set(video, g)
  }
  if (g) {
    // From here on the gain node is the mute switch: the element itself must
    // stay unmuted or the recording branch would get silence too.
    video.muted = false
    g.monitor.gain.value = audible.get(video) === false ? 0 : 1
    if (g.ctx.state === 'suspended') void g.ctx.resume()
  }
  return g
}

/** Mute or unmute what you hear while editing. Never affects the exported file. */
export function setMonitor(video: HTMLVideoElement, on: boolean) {
  audible.set(video, on)
  const g = graphs.get(video)
  if (g) g.monitor.gain.value = on ? 1 : 0
  else video.muted = !on
}

function captureAudioTracks(video: HTMLVideoElement): MediaStreamTrack[] {
  const g = attachAudio(video)
  if (g) return g.capture.stream.getAudioTracks()
  // No Web Audio: fall back to capturing the element directly where supported.
  try {
    const v = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }
    const s = v.captureStream?.() ?? v.mozCaptureStream?.()
    return s ? s.getAudioTracks() : []
  } catch {
    return []
  }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 0.01 && video.readyState >= 2) return resolve()
    const done = () => {
      video.removeEventListener('seeked', done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, 4000)
    video.addEventListener('seeked', done)
    video.currentTime = t
  })
}

export interface ExportResult {
  blob: Blob
  /** Full recorded type including codecs, e.g. video/mp4;codecs=avc1…  */
  mime: string
  ext: string
  hasAudio: boolean
  /** MP4 (H.264): accepted by every platform without conversion. */
  platformReady: boolean
  thumb?: string
}

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number
  cancelVideoFrameCallback?: (id: number) => void
}

/**
 * Render the trimmed, reframed segment to a real video file by drawing frames to
 * a canvas and recording canvas + audio in real time.
 */
export async function recordClip(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  p: RenderParams,
  onProgress?: (t: number) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available.')
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
    throw new Error('This browser cannot record video. Use a current version of Chrome, Edge, Safari or Firefox.')
  }
  canvas.width = p.target.w
  canvas.height = p.target.h

  // Must happen inside the click that started the export (autoplay rules).
  const audio = captureAudioTracks(video)

  video.pause()
  await seek(video, p.startSec)
  drawFrame(ctx, video, p)
  const thumb = makeThumb(canvas)

  const fps = 30
  const stream = canvas.captureStream(fps)
  for (const track of audio) stream.addTrack(track)

  const mime = pickMime()
  const pixels = p.target.w * p.target.h
  let rec: MediaRecorder
  try {
    rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: pixels >= 1920 * 1080 ? 10_000_000 : 6_000_000,
      audioBitsPerSecond: 160_000,
    })
  } catch {
    throw new Error('Recording is not supported in this browser.')
  }

  const chunks: BlobPart[] = []
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve, reject) => {
    rec.onstop = () => resolve()
    rec.onerror = () => reject(new Error('The recorder stopped unexpectedly.'))
  })

  const v = video as FrameVideo
  const span = Math.max(0.1, p.endSec - p.startSec)
  let raf = 0
  let vfc = 0
  let finished = false
  let cancelled = false

  const finish = () => {
    if (finished) return
    finished = true
    cancelAnimationFrame(raf)
    if (vfc && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(vfc)
    clearInterval(watchdog)
    clearTimeout(guard)
    signal?.removeEventListener('abort', onAbort)
    video.pause()
    if (rec.state !== 'inactive') rec.stop()
  }
  const atEnd = () => video.currentTime >= p.endSec - 0.005 || video.ended
  const paint = () => {
    if (finished) return
    drawFrame(ctx, video, p)
    onProgress?.(clamp((video.currentTime - p.startSec) / span, 0, 1))
    if (atEnd()) finish()
  }
  // Draw once per decoded video frame where the browser can tell us; otherwise
  // once per display frame.
  const loop = () => {
    paint()
    if (finished) return
    if (v.requestVideoFrameCallback) vfc = v.requestVideoFrameCallback(loop)
    else raf = requestAnimationFrame(loop)
  }
  // Timers keep firing when frames do not (end of file, hidden tab).
  const watchdog = setInterval(() => {
    if (atEnd()) finish()
  }, 100)
  const guard = setTimeout(finish, (span + 3) * 1000 + 2000)
  const onAbort = () => {
    cancelled = true
    finish()
  }
  signal?.addEventListener('abort', onAbort)

  rec.start(1000)
  try {
    await video.play()
  } catch {
    finish()
    throw new Error('Could not play the source for export. Use an uploaded file (cross-origin URLs are blocked from export).')
  }
  loop()

  await stopped
  finish()
  if (cancelled) throw new Error('Export cancelled.')
  const type = rec.mimeType || mime || 'video/webm'
  const blob = new Blob(chunks, { type })
  if (blob.size === 0) throw new Error('Export produced no data — the source may be protected (CORS).')
  onProgress?.(1)
  return { blob, mime: type, ext: extForMime(type), hasAudio: audio.length > 0, platformReady: isPlatformReady(mime, type), thumb }
}
