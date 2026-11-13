import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { HASHTAG_BANK, NICHES } from '../data'
import { fmtDuration } from '../utils'
import type { AspectRatio, Clip } from '../types'
import {
  attachAudio, drawFrame, recordClip, setMonitor, targetDims,
  type ExportResult, type Quality, type RenderParams,
} from '../clipeditor'
import { hasVideo, newMediaId, putBlob } from '../media'

const RATIOS: AspectRatio[] = ['9:16', '1:1', '16:9']

interface Result extends ExportResult {
  url: string
}

export function ClipEditor({ active, onPublish }: { active: boolean; onPublish: (clipId: string) => void }) {
  const { clips, addClip, updateClip } = useStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const frameRef = useRef(0)
  const paramsRef = useRef<RenderParams>({ startSec: 0, endSec: 0, target: targetDims('9:16'), focusX: 0.5, focusY: 0.5, zoom: 1 })
  const exportingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [srcName, setSrcName] = useState('')
  const [duration, setDuration] = useState(0)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [sound, setSound] = useState(true)
  const [ratio, setRatio] = useState<AspectRatio>('9:16')
  const [quality, setQuality] = useState<Quality>('1080p')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [focusX, setFocusX] = useState(0.5)
  const [focusY, setFocusY] = useState(0.5)
  const [zoom, setZoom] = useState(1)
  const [captionOn, setCaptionOn] = useState(true)
  const [caption, setCaption] = useState('')
  const [rights, setRights] = useState<Clip['rights']>('unverified')
  const [urlDraft, setUrlDraft] = useState('')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [title, setTitle] = useState('')
  const [niche, setNiche] = useState<string>(NICHES[0])
  /** '' = save as a new clip; otherwise the id of a library clip this video is for. */
  const [forClip, setForClip] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)

  // Library entries still waiting for their video (e.g. ideas from the AI workshop).
  const waiting = clips.filter((c) => !hasVideo(c))

  // Keep the render params current for the preview + export loops.
  useEffect(() => {
    paramsRef.current = {
      startSec: start,
      endSec: end || duration,
      target: targetDims(ratio, quality),
      focusX,
      focusY,
      zoom,
      caption: captionOn && caption.trim() ? caption.trim() : undefined,
    }
  }, [start, end, duration, ratio, quality, focusX, focusY, zoom, captionOn, caption])

  // Continuous WYSIWYG preview: draw the current (cropped, reframed) frame.
  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)
      const v = videoRef.current
      const c = canvasRef.current
      if (!v || !c || exportingRef.current) return
      const p = paramsRef.current
      if (c.width !== p.target.w) c.width = p.target.w
      if (c.height !== p.target.h) c.height = p.target.h
      const ctx = c.getContext('2d')
      if (ctx) drawFrame(ctx, v, p)
      if (!v.paused) {
        if (v.currentTime >= p.endSec) v.currentTime = p.startSec // loop within trim
        if (frameRef.current++ % 4 === 0) setCur(v.currentTime)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Free object URLs when they are replaced or the editor closes.
  useEffect(() => {
    return () => {
      if (srcUrl?.startsWith('blob:')) URL.revokeObjectURL(srcUrl)
    }
  }, [srcUrl])
  const resultUrl = result?.url
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl)
    }
  }, [resultUrl])
  useEffect(() => () => abortRef.current?.abort(), [])

  // Leaving the page stops playback (an export in progress keeps going).
  useEffect(() => {
    if (!active && !exportingRef.current) videoRef.current?.pause()
  }, [active])

  const resetOutput = () => {
    setResult(null)
    setSavedId(null)
    setError(null)
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    resetOutput()
    setPlaying(false)
    setSrcName(file.name)
    if (!forClip) setTitle(`Clip from ${file.name.replace(/\.[^.]+$/, '')}`)
    setSrcUrl(URL.createObjectURL(file))
  }

  const onLoadUrl = () => {
    const u = urlDraft.trim()
    if (!u) return
    resetOutput()
    setPlaying(false)
    setSrcName(u)
    if (!forClip) setTitle('Clip from source')
    setSrcUrl(u)
  }

  const onMeta = () => {
    const v = videoRef.current
    if (!v) return
    const d = Number.isFinite(v.duration) ? v.duration : 0
    setDuration(d)
    setStart(0)
    setEnd(Math.min(d, 60))
    setCur(0)
    // Prime a frame so the preview shows content before the first play.
    try {
      v.currentTime = Math.min(0.1, d / 2)
    } catch {
      // ignore
    }
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      attachAudio(v) // inside the tap, so the browser lets sound start
      setMonitor(v, sound)
      if (v.currentTime >= (end || duration) || v.currentTime < start) v.currentTime = start
      void v.play().catch(() => setPlaying(false))
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  const toggleSound = () => {
    const next = !sound
    setSound(next)
    if (videoRef.current) setMonitor(videoRef.current, next)
  }

  const scrub = (t: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = t
    setCur(t)
  }

  const doExport = async () => {
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) return
    setExporting(true)
    exportingRef.current = true
    resetOutput()
    setProgress(0)
    v.pause()
    setPlaying(false)
    setMonitor(v, sound)
    const abort = new AbortController()
    abortRef.current = abort
    try {
      const out = await recordClip(v, c, paramsRef.current, setProgress, abort.signal)
      setResult({ ...out, url: URL.createObjectURL(out.blob) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed.'
      if (msg !== 'Export cancelled.') setError(msg)
    } finally {
      exportingRef.current = false
      abortRef.current = null
      setExporting(false)
    }
  }

  /** Pick which library entry this cut is for, and pull its details in. */
  const chooseTarget = (id: string) => {
    setForClip(id)
    const c = clips.find((x) => x.id === id)
    if (!c) return
    setTitle(c.title)
    setNiche(c.niche)
    setRights(c.rights)
    if (c.hook) {
      setCaption(c.hook)
      setCaptionOn(true)
    }
  }

  const save = async () => {
    if (!result) return
    const localMediaId = newMediaId()
    await putBlob(localMediaId, result.blob)
    const durationSec = Math.max(1, Math.round((end || duration) - start))
    const target = clips.find((c) => c.id === forClip)
    if (target) {
      updateClip(target.id, {
        title: title.trim() || target.title,
        niche,
        rights,
        hook: target.hook || (captionOn ? caption.trim() : ''),
        durationSec,
        aspectRatio: ratio,
        status: target.status === 'idea' || target.status === 'editing' ? 'ready' : target.status,
        localMediaId,
        mediaId: undefined,
        videoUrl: undefined,
        thumb: result.thumb,
        validated: false,
        validatedAt: undefined,
      })
      setSavedId(target.id)
    } else {
      const created = addClip({
        title: title.trim() || `Clip from ${srcName}`,
        sourceTitle: srcName,
        sourceCreator: '',
        rights,
        hook: captionOn ? caption.trim() : '',
        caption: '',
        // A starting set for the niche; edit them when you publish.
        hashtags: [...HASHTAG_BANK.base.slice(0, 3), ...(HASHTAG_BANK[niche] ?? []).slice(0, 3)],
        niche,
        durationSec,
        aspectRatio: ratio,
        status: 'ready',
        localMediaId,
        thumb: result.thumb,
      })
      setSavedId(created.id)
    }
  }

  const trimLen = Math.max(0, (end || duration) - start)
  const dims = targetDims(ratio, quality)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Clip Editor</h1>
          <p className="page-desc">
            Turn a long video into a short clip — trim it, reframe to vertical, burn in the hook — then save it and publish to YouTube, Instagram and TikTok.
          </p>
        </div>
      </div>

      {!srcUrl ? (
        <div className="card card-pad">
          <div className="empty" style={{ padding: '48px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✂️</div>
            <div style={{ fontWeight: 650, fontSize: 16, marginBottom: 6 }}>Load a source video to start</div>
            <p className="muted" style={{ fontSize: 13.5, maxWidth: 460, margin: '0 auto 16px' }}>
              Use a video you <strong>own, licensed, or have permission for</strong>. Upload a file, or paste a
              direct video URL you host. Cutting happens on this device — the source is never uploaded.
            </p>
            <label className="btn primary" style={{ cursor: 'pointer' }}>
              ⬆ Choose a video file
              <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <div className="row" style={{ gap: 6, maxWidth: 460, margin: '14px auto 0' }}>
              <input className="player-input" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://…/source.mp4" onKeyDown={(e) => { if (e.key === 'Enter') onLoadUrl() }} aria-label="Source video URL" />
              <button className="btn" onClick={onLoadUrl}>Load URL</button>
            </div>
            <div className="callout" style={{ maxWidth: 460, margin: '14px auto 0', textAlign: 'left' }}>
              Don’t clip others’ videos (YouTube, etc.) without rights — reposting them risks takedowns and bans.
              Use footage you own, licensed, or have permission for, and transform it (your edit, commentary).
            </div>
          </div>
        </div>
      ) : (
        <div className="editor-grid">
          <div className="card card-pad" style={{ position: 'relative' }}>
            <div className="editor-stage">
              <canvas ref={canvasRef} className="editor-canvas" style={{ aspectRatio: `${dims.w} / ${dims.h}` }} />
            </div>
            {/* The source plays off-screen (not display:none, which stops some phones decoding it)
                and is NOT muted: its sound is routed through Web Audio so it reaches the export. */}
            <video
              ref={videoRef}
              src={srcUrl}
              playsInline
              preload="auto"
              crossOrigin="anonymous"
              onLoadedMetadata={onMeta}
              onPause={() => setPlaying(false)}
              onError={() => setError('Couldn’t load that video. Use a file from this device, or a direct CORS-enabled video link (an .mp4 you host) — page links like YouTube won’t load.')}
              className="editor-source"
            />
            <div className="row between" style={{ marginTop: 12, gap: 10 }}>
              <button className="btn sm" onClick={togglePlay} disabled={exporting}>
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <button className="btn sm ghost" onClick={toggleSound} title="Sound while editing (the export always keeps its audio)" aria-pressed={sound}>
                {sound ? '🔊' : '🔇'}
              </button>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.05}
                value={cur}
                onChange={(e) => scrub(Number(e.target.value))}
                disabled={exporting}
                style={{ flex: 1, minWidth: 0 }}
                aria-label="Position"
              />
              <span className="badge" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtDuration(Math.round(cur))} / {fmtDuration(Math.round(duration))}
              </span>
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
                ↻ Replace (file)
                <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <input className="player-input" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="…or a direct video URL" onKeyDown={(e) => { if (e.key === 'Enter') onLoadUrl() }} style={{ flex: 1 }} aria-label="Source video URL" />
              <button className="btn sm" onClick={onLoadUrl}>Load URL</button>
            </div>
          </div>

          <div className="stack" style={{ gap: 16 }}>
            {waiting.length > 0 && (
              <div className="card card-pad">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="for-clip">This cut is for</label>
                  <select id="for-clip" value={forClip} onChange={(e) => chooseTarget(e.target.value)} disabled={exporting}>
                    <option value="">A new clip</option>
                    {waiting.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="card card-pad">
              <div className="field-label">Trim</div>
              <div className="row between" style={{ marginBottom: 8 }}>
                <button className="btn sm" onClick={() => setStart(Math.min(cur, (end || duration) - 0.1))} disabled={exporting}>Set start = ▮</button>
                <span className="badge">{fmtDuration(Math.round(trimLen))} clip</span>
                <button className="btn sm" onClick={() => setEnd(Math.max(cur, start + 0.1))} disabled={exporting}>Set end = ▮</button>
              </div>
              <div className="field-row">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="trim-start">Start (s)</label>
                  <input id="trim-start" type="number" min={0} max={duration} step={0.1} value={round1(start)} disabled={exporting}
                    onChange={(e) => setStart(clampNum(Number(e.target.value), 0, (end || duration) - 0.1))} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="trim-end">End (s)</label>
                  <input id="trim-end" type="number" min={0} max={duration} step={0.1} value={round1(end || duration)} disabled={exporting}
                    onChange={(e) => setEnd(clampNum(Number(e.target.value), start + 0.1, duration))} />
                </div>
              </div>
              {trimLen > 0 && trimLen < 3 && <div className="platform-note" style={{ marginTop: 8 }}>Instagram Reels need at least 3 seconds.</div>}
              {trimLen > 180 && <div className="platform-note" style={{ marginTop: 8 }}>Over 3 minutes: too long for a YouTube Short.</div>}
            </div>

            <div className="card card-pad">
              <div className="field-label">Reframe</div>
              <div className="row wrap" style={{ gap: 10, marginBottom: 10 }}>
                <div className="segmented" role="group" aria-label="Aspect ratio">
                  {RATIOS.map((r) => (
                    <button key={r} className={ratio === r ? 'on' : ''} onClick={() => setRatio(r)} disabled={exporting}>{r}</button>
                  ))}
                </div>
                <div className="segmented" role="group" aria-label="Quality">
                  {(['1080p', '720p'] as Quality[]).map((q) => (
                    <button key={q} className={quality === q ? 'on' : ''} onClick={() => setQuality(q)} disabled={exporting}>{q}</button>
                  ))}
                </div>
              </div>
              <Slider label="Left ↔ right" min={0} max={1} step={0.01} value={focusX} onChange={setFocusX} disabled={exporting} />
              <Slider label="Up ↕ down" min={0} max={1} step={0.01} value={focusY} onChange={setFocusY} disabled={exporting} />
              <Slider label={`Zoom ${zoom.toFixed(2)}×`} min={1} max={2.5} step={0.05} value={zoom} onChange={setZoom} disabled={exporting} />
            </div>

            <div className="card card-pad">
              <label className="check-row" style={{ marginBottom: captionOn ? 8 : 0 }}>
                <input type="checkbox" checked={captionOn} onChange={(e) => setCaptionOn(e.target.checked)} disabled={exporting} />
                <span>Burn in hook caption</span>
              </label>
              {captionOn && (
                <input className="player-input" style={{ width: '100%' }} value={caption} onChange={(e) => setCaption(e.target.value)}
                  placeholder="On-screen hook text…" disabled={exporting} aria-label="Hook caption" />
              )}
            </div>

            {!result ? (
              <div className="card card-pad">
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => void doExport()} disabled={exporting || !duration}>
                    {exporting ? `Exporting… ${Math.round(progress * 100)}%` : '✂ Export clip'}
                  </button>
                  {exporting && <button className="btn" onClick={() => abortRef.current?.abort()}>Cancel</button>}
                </div>
                {exporting && (
                  <div className="bar" style={{ marginTop: 10 }}>
                    <div style={{ width: `${progress * 100}%` }} />
                  </div>
                )}
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  Exports {dims.w}×{dims.h} with sound, in real time (a {fmtDuration(Math.round(trimLen))} clip takes about that long). Keep this tab open and in front while it records.
                </div>
                {error && <div className="callout" style={{ marginTop: 10 }} role="alert">{error}</div>}
              </div>
            ) : (
              <div className="card card-pad">
                <div className="row between" style={{ marginBottom: 8 }}>
                  <div className="field-label" style={{ marginBottom: 0 }}>Exported clip</div>
                  <span className={`badge ${result.platformReady ? 'post-published' : ''}`}>
                    {result.ext.toUpperCase()} · {(result.blob.size / 1e6).toFixed(1)} MB
                  </span>
                </div>
                <video src={result.url} controls playsInline style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: '32vh' }} />
                {!result.platformReady && (
                  <div className="platform-note" style={{ marginTop: 8 }}>
                    This browser could not record a standard MP4 (H.264 + AAC). YouTube takes this file as is; for Instagram and TikTok the backend converts it to MP4 automatically when you publish.
                  </div>
                )}
                {!result.hasAudio && (
                  <div className="platform-note bad" style={{ marginTop: 8 }}>This browser could not capture the sound — the clip is silent.</div>
                )}
                <div className="field" style={{ margin: '12px 0 8px' }}>
                  <label htmlFor="clip-title">Title</label>
                  <input id="clip-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={Boolean(savedId)} />
                </div>
                <div className="field-row" style={{ marginBottom: 12 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="clip-niche">Niche</label>
                    <select id="clip-niche" value={niche} onChange={(e) => setNiche(e.target.value)} disabled={Boolean(savedId)}>
                      {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="clip-rights">Rights</label>
                    <select id="clip-rights" value={rights} onChange={(e) => setRights(e.target.value as Clip['rights'])} disabled={Boolean(savedId)}>
                      <option value="owned">Owned</option>
                      <option value="licensed">Licensed</option>
                      <option value="permission">Permission</option>
                      <option value="unverified">Unverified</option>
                    </select>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  {savedId ? (
                    <>
                      <button className="btn primary" onClick={() => onPublish(savedId)}>Publish…</button>
                      <span className="badge post-published">✓ Saved to Library</span>
                    </>
                  ) : (
                    <button className="btn primary" onClick={() => void save()}>Save to Library</button>
                  )}
                  <a className="btn" href={result.url} download={`${(title.trim() || 'clip').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-')}.${result.ext}`}>⬇ Download</a>
                  <button className="btn ghost sm" onClick={resetOutput}>Export again</button>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  Saved clips are kept on this device, so they are still here after a reload. Publishing sends the clip to the platforms you pick.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Slider({ label, min, max, step, value, onChange, disabled }: { label: string; min: number; max: number; step: number; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </label>
  )
}

const round1 = (n: number) => Math.round(n * 10) / 10
const clampNum = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo))
