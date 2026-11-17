// The assembly engine: plays generated clips in order onto a canvas, burns in
// captions and the hook title, mixes in the clips' sound and a voiceover, and
// records the result (canvas + Web Audio + MediaRecorder) into one video file.

import type { AspectRatio } from './types'
import type { CaptionStyle } from '../shared/studio.mjs'

export type Quality = '1080p' | '720p'

/** Output frame size. 1080p is what the platforms recommend for vertical video. */
export function targetDims(ratio: AspectRatio, quality: Quality = '1080p'): { w: number; h: number } {
  const short = quality === '1080p' ? 1080 : 720
  const long = quality === '1080p' ? 1920 : 1280
  if (ratio === '9:16') return { w: short, h: long }
  if (ratio === '16:9') return { w: long, h: short }
  return { w: short, h: short }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// ---------------------------------------------------------------- drawing

export interface CaptionCue {
  start: number
  end: number
  text: string
}

export interface Overlay {
  captions: CaptionCue[]
  hook?: { text: string; until: number } | null
  style: CaptionStyle
}

const FONTS: Record<CaptionStyle['font'], string> = {
  block: '900 {s}px "Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif',
  rounded: '800 {s}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif',
  marker: '700 {s}px "Marker Felt", "Chalkboard SE", "Comic Sans MS", system-ui, sans-serif',
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** One block of text in the house caption style. `pop` (0…1) animates it in. */
function drawText(
  ctx: CanvasRenderingContext2D,
  raw: string,
  cx: number,
  cy: number,
  size: number,
  maxW: number,
  s: CaptionStyle,
  pop: number,
  boxColor?: string,
) {
  const text = s.uppercase ? raw.toUpperCase() : raw
  ctx.save()
  ctx.font = FONTS[s.font].replace('{s}', String(Math.round(size)))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const lines = wrap(ctx, text, maxW)
  const lineH = size * 1.18
  const blockH = lines.length * lineH
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
  const scale = 0.82 + 0.18 * clamp(pop, 0, 1)
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  if (s.box !== 'none' || boxColor) {
    const padX = size * 0.5
    const padY = size * 0.32
    ctx.fillStyle = boxColor ?? (s.box === 'paper' ? '#fffdf5' : s.stroke)
    ctx.globalAlpha = s.box === 'paper' || boxColor ? 1 : 0.92
    roundRect(ctx, -widest / 2 - padX, -blockH / 2 - padY, widest + padX * 2, blockH + padY * 2, s.box === 'paper' ? size * 0.12 : size * 0.6)
    ctx.fill()
    ctx.globalAlpha = 1
    if (s.box === 'paper') {
      ctx.lineWidth = Math.max(2, size * 0.06)
      ctx.strokeStyle = s.fill
      ctx.stroke()
    }
  }
  let y = -blockH / 2 + lineH / 2
  for (const l of lines) {
    if (s.box === 'none' && !boxColor) {
      ctx.lineWidth = Math.max(4, size * 0.16)
      ctx.strokeStyle = s.stroke
      ctx.strokeText(l, 0, y)
    }
    ctx.fillStyle = boxColor ? '#ffffff' : s.box === 'paper' ? s.fill : s.box === 'pill' ? s.fill : s.fill
    ctx.fillText(l, 0, y)
    y += lineH
  }
  ctx.restore()
}

/** Draw one composited frame: the video (cover-fit), then the hook and caption for time `t`. */
export function drawComposite(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource | null,
  srcW: number,
  srcH: number,
  t: number,
  o: Overlay,
) {
  const { width: W, height: H } = ctx.canvas
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  if (source && srcW && srcH) {
    const k = Math.max(W / srcW, H / srcH)
    ctx.drawImage(source, (W - srcW * k) / 2, (H - srcH * k) / 2, srcW * k, srcH * k)
  }
  if (o.hook?.text && t < o.hook.until) {
    drawText(ctx, o.hook.text, W / 2, H * 0.17, W * 0.072, W * 0.84, o.style, (t / 0.18) as number, o.style.accent)
  }
  const cue = o.captions.find((c) => t >= c.start && t < c.end)
  if (cue?.text) {
    // Lower-middle: clear of the platforms' own buttons and captions at the bottom.
    drawText(ctx, cue.text, W / 2, H * 0.66, W * 0.068, W * 0.84, o.style, (t - cue.start) / 0.14)
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

// ---------------------------------------------------------------- recording format

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

/** True when a recording holds H.264 + AAC in MP4 (accepted everywhere as-is). */
export function isPlatformReady(requested: string, recorded: string): boolean {
  const both = `${requested} ${recorded}`.toLowerCase()
  if (!both.includes('mp4') || /webm|vp0?9|vp0?8|av01|opus|vorbis|flac/.test(both)) return false
  return /mp4a|aac/.test(both) || isWebKit()
}

// ---------------------------------------------------------------- audio
//
// Every element's sound goes through one Web Audio graph: a per-element volume,
// then both the recorder (capture) and the speakers (monitor, mutable without
// touching the recording). Elements are never `muted`: a muted element feeds
// silence into Web Audio too.

interface Graph {
  ctx: AudioContext
  capture: MediaStreamAudioDestinationNode
  monitor: GainNode
}

let graph: Graph | null | undefined
const routed = new WeakMap<HTMLMediaElement, GainNode | null>()

function audioGraph(): Graph | null {
  if (graph !== undefined) return graph
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return (graph = null)
  try {
    const ctx = new Ctor()
    const capture = ctx.createMediaStreamDestination()
    const monitor = ctx.createGain()
    monitor.connect(ctx.destination)
    graph = { ctx, capture, monitor }
  } catch {
    graph = null
  }
  return graph
}

/** Send an element's sound into the mix at `volume` (0…1). Call from a tap. */
export function route(el: HTMLMediaElement, volume: number): boolean {
  const g = audioGraph()
  if (!g) return false
  let gain = routed.get(el)
  if (gain === undefined) {
    try {
      const src = g.ctx.createMediaElementSource(el)
      gain = g.ctx.createGain()
      src.connect(gain)
      gain.connect(g.capture)
      gain.connect(g.monitor)
    } catch {
      gain = null
    }
    routed.set(el, gain)
  }
  if (!gain) return false
  el.muted = false
  gain.gain.value = clamp(volume, 0, 2)
  if (g.ctx.state === 'suspended') void g.ctx.resume()
  return true
}

/** Hear the preview or not. Never affects the exported file. */
export function setMonitor(on: boolean) {
  const g = audioGraph()
  if (g) g.monitor.gain.value = on ? 1 : 0
}

function seek(el: HTMLMediaElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(el.currentTime - t) < 0.02 && el.readyState >= 2) return resolve()
    const done = () => {
      el.removeEventListener('seeked', done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, 5000)
    el.addEventListener('seeked', done)
    el.currentTime = t
  })
}

function whenReady(el: HTMLMediaElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (el.readyState >= 1) return resolve()
    const ok = () => {
      cleanup()
      resolve()
    }
    const bad = () => {
      cleanup()
      reject(new Error('A clip could not be loaded.'))
    }
    const cleanup = () => {
      el.removeEventListener('loadedmetadata', ok)
      el.removeEventListener('error', bad)
      clearTimeout(timer)
    }
    const timer = setTimeout(bad, 20_000)
    el.addEventListener('loadedmetadata', ok)
    el.addEventListener('error', bad)
  })
}

// ---------------------------------------------------------------- the sequence

export interface SequenceClip {
  video: HTMLVideoElement
  inSec: number
  outSec: number
}

export interface Sequence {
  clips: SequenceClip[]
  voiceover?: HTMLAudioElement | null
  overlay: Overlay
  clipVolume: number
  voiceVolume: number
  /** Keep the last frame on screen until the voiceover finishes. */
  holdForVoiceover: boolean
}

/** Where each clip sits on the final timeline, and the total length. */
export function timeline(seq: Pick<Sequence, 'clips' | 'voiceover' | 'holdForVoiceover'>) {
  let t = 0
  const offsets = seq.clips.map((c) => {
    const at = t
    t += Math.max(0.1, c.outSec - c.inSec)
    return at
  })
  const vo = seq.voiceover && Number.isFinite(seq.voiceover.duration) ? seq.voiceover.duration : 0
  return { offsets, clipsEnd: t, total: seq.holdForVoiceover ? Math.max(t, vo) : t }
}

/**
 * Prepare every element for playback. Must be called synchronously inside the
 * tap that starts playback or export: phones only allow sound to start from a
 * tap, and an element started once inside one can be started again later.
 */
let priming: Promise<void> = Promise.resolve()

export function primeFromTap(seq: Sequence) {
  setMonitor(false)
  const all: HTMLMediaElement[] = [...seq.clips.map((c) => c.video), ...(seq.voiceover ? [seq.voiceover] : [])]
  const plays = all.map((el) => {
    route(el, el === seq.voiceover ? seq.voiceVolume : seq.clipVolume)
    // play() must be called right here, in the tap; it is paused again once it settles.
    return Promise.resolve(el.play())
      .catch(() => {})
      .then(() => el.pause())
  })
  // Playback waits for this, so a late pause can never land on the real playback.
  priming = Promise.all(plays).then(() => undefined)
}

/** Show the frame at time `t` without playing (for scrubbing). */
export async function drawAt(ctx: CanvasRenderingContext2D, seq: Sequence, t: number) {
  const { offsets } = timeline(seq)
  let i = offsets.findIndex((o, k) => t >= o && t < o + (seq.clips[k].outSec - seq.clips[k].inSec))
  if (i < 0) i = seq.clips.length - 1
  const c = seq.clips[i]
  if (!c) return drawComposite(ctx, null, 0, 0, t, seq.overlay)
  await whenReady(c.video)
  await seek(c.video, clamp(c.inSec + (t - offsets[i]), c.inSec, Math.max(c.inSec, c.outSec - 0.04)))
  drawComposite(ctx, c.video, c.video.videoWidth, c.video.videoHeight, t, seq.overlay)
}

export interface ExportResult {
  blob: Blob
  /** Full recorded type including codecs, e.g. video/mp4;codecs=avc1… */
  mime: string
  ext: string
  hasAudio: boolean
  /** MP4 (H.264 + AAC): accepted by every platform without conversion. */
  platformReady: boolean
  thumb?: string
  seconds: number
}

/**
 * Play the whole sequence onto the canvas, optionally recording it. Call
 * primeFromTap(seq) in the tap that triggers this. With `record`, resolves to
 * the finished file; without, resolves when playback ends or is stopped.
 */
export async function playSequence(
  canvas: HTMLCanvasElement,
  seq: Sequence,
  opts: { record: boolean; monitor: boolean; onProgress?: (t: number, total: number) => void; signal?: AbortSignal },
): Promise<ExportResult | null> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available.')
  if (!seq.clips.length) throw new Error('Add at least one clip.')
  if (opts.record && (typeof MediaRecorder === 'undefined' || !canvas.captureStream)) {
    throw new Error('This browser cannot record video. Use a current Chrome, Edge, Safari or Firefox.')
  }

  await Promise.race([priming, new Promise((r) => setTimeout(r, 3000))])
  await Promise.all([...seq.clips.map((c) => whenReady(c.video)), seq.voiceover ? whenReady(seq.voiceover) : Promise.resolve()])
  for (const c of seq.clips) c.video.pause()
  seq.voiceover?.pause()
  await Promise.all(seq.clips.map((c) => seek(c.video, c.inSec)))
  if (seq.voiceover) await seek(seq.voiceover, 0)
  const { offsets, clipsEnd, total } = timeline(seq)

  const g = audioGraph()
  for (const c of seq.clips) route(c.video, seq.clipVolume)
  if (seq.voiceover) route(seq.voiceover, seq.voiceVolume)
  setMonitor(opts.monitor)

  drawComposite(ctx, seq.clips[0].video, seq.clips[0].video.videoWidth, seq.clips[0].video.videoHeight, 0, seq.overlay)
  const thumb = makeThumb(canvas)

  let rec: MediaRecorder | null = null
  let mime = ''
  const chunks: BlobPart[] = []
  let stopped: Promise<void> = Promise.resolve()
  if (opts.record) {
    const stream = canvas.captureStream(30)
    const audioTracks = g ? g.capture.stream.getAudioTracks() : []
    for (const tr of audioTracks) stream.addTrack(tr)
    mime = pickMime()
    const pixels = canvas.width * canvas.height
    try {
      rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: pixels >= 1920 * 1080 ? 10_000_000 : 6_000_000,
        audioBitsPerSecond: 160_000,
      })
    } catch {
      throw new Error('Recording is not supported in this browser.')
    }
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data)
    }
    const r = rec
    stopped = new Promise<void>((resolve, reject) => {
      r.onstop = () => resolve()
      r.onerror = () => reject(new Error('The recorder stopped unexpectedly.'))
    })
  }

  let i = 0
  let raf = 0
  let finished = false
  let cancelled = false
  let holdStart = 0
  let resolveDone: () => void = () => {}
  const done = new Promise<void>((r) => (resolveDone = r))

  const finish = () => {
    if (finished) return
    finished = true
    cancelAnimationFrame(raf)
    clearInterval(watchdog)
    opts.signal?.removeEventListener('abort', onAbort)
    for (const c of seq.clips) c.video.pause()
    seq.voiceover?.pause()
    if (rec && rec.state !== 'inactive') rec.stop()
    resolveDone()
  }
  const onAbort = () => {
    cancelled = true
    finish()
  }
  opts.signal?.addEventListener('abort', onAbort)

  const now = (): number => {
    if (i >= seq.clips.length) {
      // Holding the last frame for the voiceover: its clock drives the timeline.
      const vo = seq.voiceover
      return vo && !vo.paused ? Math.max(clipsEnd, vo.currentTime) : clipsEnd + (performance.now() - holdStart) / 1000
    }
    const c = seq.clips[i]
    return offsets[i] + (c.video.currentTime - c.inSec)
  }

  let started = false
  const advance = () => {
    const vo = seq.voiceover
    // Something else paused playback (a background tab, the OS): carry on.
    if (started && !finished && vo && vo.paused && !vo.ended && vo.currentTime < vo.duration - 0.05) void vo.play().catch(() => {})
    const c = seq.clips[i]
    if (!c) return
    if (started && !finished && c.video.paused && !c.video.ended && c.video.currentTime < c.outSec - 0.03) void c.video.play().catch(() => {})
    if (c.video.currentTime >= c.outSec - 0.03 || c.video.ended) {
      c.video.pause()
      i++
      if (i < seq.clips.length) void seq.clips[i].video.play().catch(() => {})
      else holdStart = performance.now()
    }
  }

  const paint = () => {
    if (finished) return
    advance()
    const t = now()
    const shown = seq.clips[Math.min(i, seq.clips.length - 1)].video
    drawComposite(ctx, shown, shown.videoWidth, shown.videoHeight, Math.min(t, total), seq.overlay)
    opts.onProgress?.(Math.min(t, total), total)
    if (t >= total - 0.02 || (i >= seq.clips.length && t >= total)) finish()
  }
  const loop = () => {
    paint()
    if (!finished) raf = requestAnimationFrame(loop)
  }
  // Timers keep the sequence moving when frames do not (hidden tab, end of a clip).
  const watchdog = setInterval(() => {
    advance()
    if (now() >= total - 0.02) finish()
  }, 100)

  rec?.start(1000)
  try {
    await seq.clips[0].video.play()
    if (seq.voiceover) await seq.voiceover.play()
  } catch {
    finish()
    throw new Error('Playback was blocked. Tap the button again.')
  }
  started = true
  loop()
  await done
  await stopped
  setMonitor(true)
  if (cancelled && opts.record) throw new Error('Export cancelled.')
  if (!opts.record) return null

  const type = rec?.mimeType || mime || 'video/webm'
  const blob = new Blob(chunks, { type })
  if (blob.size === 0) throw new Error('Export produced no data — a clip may be from a site that blocks this (CORS).')
  return {
    blob,
    mime: type,
    ext: extForMime(type),
    hasAudio: Boolean(g),
    platformReady: isPlatformReady(mime, type),
    thumb,
    seconds: total,
  }
}

/** Captions on the final timeline, from the plot's scenes scaled to the actual length. */
export function captionsFromScenes(
  scenes: { start: number; duration: number; onScreenText: string }[],
  plotSeconds: number,
  actualSeconds: number,
): CaptionCue[] {
  const k = plotSeconds > 0 ? actualSeconds / plotSeconds : 1
  return scenes
    .filter((s) => s.onScreenText.trim())
    .map((s) => ({ start: s.start * k, end: (s.start + s.duration) * k, text: s.onScreenText.trim() }))
}
