import type { AspectRatio } from './types'

export interface RenderParams {
  startSec: number
  endSec: number
  target: { w: number; h: number }
  /** Horizontal focus of the crop, 0 (left) … 1 (right). */
  focusX: number
  /** Extra zoom on top of cover-fit, >= 1. */
  zoom: number
  caption?: string
  /** Attribution burned small at the bottom, e.g. "via @creator". */
  credit?: string
}

export const TARGET_DIMS: Record<AspectRatio, { w: number; h: number }> = {
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1080, h: 1080 },
  '16:9': { w: 1280, h: 720 },
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
    const dy = (TH - dh) / 2
    ctx.drawImage(video, dx, dy, dw, dh)
  }
  if (p.caption) drawCaption(ctx, p.caption, TW, TH)
  if (p.credit) drawCredit(ctx, p.credit, TW, TH)
}

function drawCredit(ctx: CanvasRenderingContext2D, credit: string, TW: number, TH: number) {
  const text = /^via\b/i.test(credit) ? credit : `via ${credit}`
  const fontSize = Math.round(TW * 0.033)
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineWidth = Math.max(2, fontSize * 0.16)
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  const y = TH - Math.round(TH * 0.022)
  ctx.strokeText(text, TW / 2, y)
  ctx.fillText(text, TW / 2, y)
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
  ctx.strokeStyle = 'rgba(0,0,0,0.92)'
  ctx.fillStyle = '#fff'
  for (const l of lines) {
    ctx.strokeText(l, TW / 2, y)
    ctx.fillText(l, TW / 2, y)
    y += lineH
  }
}

function pickMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

export function extForMime(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm'
}

// One audio graph per element (createMediaElementSource can only run once).
const graphs = new WeakMap<HTMLVideoElement, { ctx: AudioContext; dest: MediaStreamAudioDestinationNode }>()

function audioTracks(video: HTMLVideoElement): MediaStreamTrack[] {
  try {
    let g = graphs.get(video)
    if (!g) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const src = ctx.createMediaElementSource(video)
      const dest = ctx.createMediaStreamDestination()
      src.connect(dest) // route to capture only — element stays silent to speakers
      g = { ctx, dest }
      graphs.set(video, g)
    }
    if (g.ctx.state === 'suspended') void g.ctx.resume()
    return g.dest.stream.getAudioTracks()
  } catch {
    return []
  }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = t
  })
}

/**
 * Render the trimmed, reframed segment to a real video file by drawing frames to
 * a canvas and recording canvas + audio in real time. Returns the encoded blob.
 */
export async function recordClip(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  p: RenderParams,
  onProgress?: (t: number) => void,
): Promise<Blob> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available.')
  canvas.width = p.target.w
  canvas.height = p.target.h

  const fps = 30
  const stream = canvas.captureStream(fps)
  for (const track of audioTracks(video)) stream.addTrack(track)

  const mime = pickMime()
  let rec: MediaRecorder
  try {
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  } catch {
    throw new Error('Recording is not supported in this browser.')
  }

  const chunks: BlobPart[] = []
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data)
  }
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime || 'video/webm' }))
  })

  video.pause()
  await seek(video, p.startSec)

  let raf = 0
  const span = Math.max(0.1, p.endSec - p.startSec)
  const tick = () => {
    drawFrame(ctx, video, p)
    const done = video.currentTime >= p.endSec || video.ended
    onProgress?.(clamp((video.currentTime - p.startSec) / span, 0, 1))
    if (done) {
      cancelAnimationFrame(raf)
      video.pause()
      if (rec.state !== 'inactive') rec.stop()
      return
    }
    raf = requestAnimationFrame(tick)
  }

  rec.start(100)
  try {
    await video.play()
  } catch {
    // Tainted (cross-origin) source or autoplay block.
    if (rec.state !== 'inactive') rec.stop()
    throw new Error('Could not play the source for export. Use an uploaded file (cross-origin URLs are blocked from export).')
  }
  raf = requestAnimationFrame(tick)

  // Safety stop in case the timeupdate/ended never crosses the boundary.
  const guardMs = (span + 1) * 1000 + 2000
  const guard = setTimeout(() => {
    if (rec.state !== 'inactive') {
      cancelAnimationFrame(raf)
      video.pause()
      rec.stop()
    }
  }, guardMs)

  const blob = await done
  clearTimeout(guard)
  if (blob.size === 0) throw new Error('Export produced no data — the source may be protected (CORS).')
  return blob
}
