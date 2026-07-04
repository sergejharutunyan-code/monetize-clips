import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { NICHES } from '../data'
import { fmtDuration } from '../utils'
import type { AspectRatio } from '../types'
import { TARGET_DIMS, drawFrame, recordClip, extForMime, type RenderParams } from '../clipeditor'
import { loadBackend, youtubeStatus, youtubeConnectUrl, publishYouTube } from '../backend/api'

const RATIOS: AspectRatio[] = ['9:16', '1:1', '16:9']

export function ClipEditor() {
  const { addClip } = useStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const frameRef = useRef(0)
  const paramsRef = useRef<RenderParams>({ startSec: 0, endSec: 0, target: TARGET_DIMS['9:16'], focusX: 0.5, zoom: 1 })
  const exportingRef = useRef(false)

  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [srcName, setSrcName] = useState('')
  const [duration, setDuration] = useState(0)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [ratio, setRatio] = useState<AspectRatio>('9:16')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [focusX, setFocusX] = useState(0.5)
  const [zoom, setZoom] = useState(1)
  const [captionOn, setCaptionOn] = useState(true)
  const [caption, setCaption] = useState('')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ url: string; ext: string } | null>(null)
  const [title, setTitle] = useState('')
  const [niche, setNiche] = useState<string>(NICHES[0])
  const [saved, setSaved] = useState(false)
  const [pubBusy, setPubBusy] = useState(false)
  const [pubMsg, setPubMsg] = useState<string | null>(null)
  const [pubPrivacy, setPubPrivacy] = useState('private')

  // Keep the render params current for the preview + export loops.
  useEffect(() => {
    paramsRef.current = {
      startSec: start,
      endSec: end || duration,
      target: TARGET_DIMS[ratio],
      focusX,
      zoom,
      caption: captionOn && caption.trim() ? caption.trim() : undefined,
    }
  }, [start, end, duration, ratio, focusX, zoom, captionOn, caption])

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

  useEffect(() => {
    return () => {
      if (srcUrl) URL.revokeObjectURL(srcUrl)
      if (result) URL.revokeObjectURL(result.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFile = (file: File | undefined) => {
    if (!file) return
    if (srcUrl) URL.revokeObjectURL(srcUrl)
    setResult(null)
    setSaved(false)
    setError(null)
    setSrcName(file.name)
    setTitle(`Clip from ${file.name.replace(/\.[^.]+$/, '')}`)
    setSrcUrl(URL.createObjectURL(file))
  }

  const onMeta = () => {
    const v = videoRef.current
    if (!v) return
    const d = v.duration || 0
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
      if (v.currentTime >= (end || duration) || v.currentTime < start) v.currentTime = start
      void v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
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
    setError(null)
    setProgress(0)
    setResult(null)
    setSaved(false)
    const wasPlaying = !v.paused
    v.pause()
    setPlaying(false)
    try {
      const blob = await recordClip(v, c, paramsRef.current, setProgress)
      const url = URL.createObjectURL(blob)
      setResult({ url, ext: extForMime(blob.type) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      exportingRef.current = false
      setExporting(false)
      if (wasPlaying) void v.play()
    }
  }

  const addToLibrary = () => {
    if (!result) return
    addClip({
      title: title.trim() || `Clip from ${srcName}`,
      sourceTitle: srcName,
      sourceCreator: '',
      rights: 'owned',
      hook: captionOn ? caption.trim() : '',
      caption: '',
      hashtags: [],
      niche,
      durationSec: Math.max(1, Math.round((end || duration) - start)),
      aspectRatio: ratio,
      status: 'ready',
      videoUrl: result.url,
    })
    setSaved(true)
  }

  const publish = async () => {
    if (!result) return
    const b = loadBackend()
    if (!b.apiUrl || !b.token) {
      setPubMsg('Connect a backend in Playbook → Account & Sync to publish.')
      return
    }
    setPubBusy(true)
    setPubMsg(null)
    try {
      const st = await youtubeStatus(b.apiUrl, b.token)
      if (!st.configured) {
        setPubMsg('The backend has no YouTube app configured (set GOOGLE_* — see BACKEND.md).')
        return
      }
      if (!st.connected) {
        const url = await youtubeConnectUrl(b.apiUrl, b.token)
        window.open(url, '_blank', 'noopener')
        setPubMsg('Opened YouTube authorization — approve it, then click Publish again.')
        return
      }
      const blob = await (await fetch(result.url)).blob()
      const r = await publishYouTube(b.apiUrl, b.token, blob, { title: title.trim() || 'Clip', privacy: pubPrivacy })
      setPubMsg(r.url ? `Published as ${pubPrivacy}: ${r.url}` : 'Published to YouTube.')
    } catch (e) {
      setPubMsg(e instanceof Error ? e.message : 'Publish failed.')
    } finally {
      setPubBusy(false)
    }
  }

  const trimLen = Math.max(0, (end || duration) - start)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Clip Editor</h1>
          <p className="page-desc">
            Turn a source video into a real vertical clip — trim it, reframe to 9:16, burn in the hook, and export a file you can validate and post. Runs entirely in your browser.
          </p>
        </div>
      </div>

      {!srcUrl ? (
        <div className="card card-pad">
          <div className="empty" style={{ padding: '48px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✂️</div>
            <div style={{ fontWeight: 650, fontSize: 16, marginBottom: 6 }}>Load a source video to start</div>
            <p className="muted" style={{ fontSize: 13.5, maxWidth: 420, margin: '0 auto 16px' }}>
              Pick a long-form video file. Everything happens locally — nothing is uploaded to a server.
            </p>
            <label className="btn primary" style={{ cursor: 'pointer' }}>
              ⬆ Choose a video file
              <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        </div>
      ) : (
        <div className="editor-grid">
          <div className="card card-pad">
            <div className="editor-stage">
              <canvas ref={canvasRef} className="editor-canvas" style={{ aspectRatio: `${TARGET_DIMS[ratio].w} / ${TARGET_DIMS[ratio].h}` }} />
            </div>
            <video
              ref={videoRef}
              src={srcUrl}
              muted
              playsInline
              onLoadedMetadata={onMeta}
              style={{ display: 'none' }}
            />
            <div className="row between" style={{ marginTop: 12, gap: 10 }}>
              <button className="btn sm" onClick={togglePlay} disabled={exporting}>
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.05}
                value={cur}
                onChange={(e) => scrub(Number(e.target.value))}
                disabled={exporting}
                style={{ flex: 1 }}
              />
              <span className="badge" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtDuration(Math.round(cur))} / {fmtDuration(Math.round(duration))}
              </span>
            </div>
            <label className="btn ghost sm" style={{ marginTop: 10, cursor: 'pointer' }}>
              ↻ Replace source
              <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>

          <div className="stack" style={{ gap: 16 }}>
            <div className="card card-pad">
              <div className="field-label">Trim</div>
              <div className="row between" style={{ marginBottom: 8 }}>
                <button className="btn sm" onClick={() => setStart(Math.min(cur, (end || duration) - 0.1))} disabled={exporting}>Set start = ▮</button>
                <span className="badge">{fmtDuration(Math.round(trimLen))} clip</span>
                <button className="btn sm" onClick={() => setEnd(Math.max(cur, start + 0.1))} disabled={exporting}>Set end = ▮</button>
              </div>
              <div className="field-row">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Start (s)</label>
                  <input type="number" min={0} max={duration} step={0.1} value={round1(start)}
                    onChange={(e) => setStart(clampNum(Number(e.target.value), 0, (end || duration) - 0.1))} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>End (s)</label>
                  <input type="number" min={0} max={duration} step={0.1} value={round1(end || duration)}
                    onChange={(e) => setEnd(clampNum(Number(e.target.value), start + 0.1, duration))} />
                </div>
              </div>
            </div>

            <div className="card card-pad">
              <div className="field-label">Reframe</div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Aspect</label>
                <div className="segmented">
                  {RATIOS.map((r) => (
                    <button key={r} className={ratio === r ? 'on' : ''} onClick={() => setRatio(r)} disabled={exporting}>{r}</button>
                  ))}
                </div>
              </div>
              <Slider label={`Horizontal focus`} min={0} max={1} step={0.01} value={focusX} onChange={setFocusX} disabled={exporting} />
              <Slider label={`Zoom ${zoom.toFixed(2)}×`} min={1} max={2.5} step={0.05} value={zoom} onChange={setZoom} disabled={exporting} />
            </div>

            <div className="card card-pad">
              <label className="check-row" style={{ marginBottom: captionOn ? 8 : 0 }}>
                <input type="checkbox" checked={captionOn} onChange={(e) => setCaptionOn(e.target.checked)} />
                <span>Burn in hook caption</span>
              </label>
              {captionOn && (
                <input className="player-input" style={{ width: '100%' }} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="On-screen hook text…" />
              )}
            </div>

            {!result ? (
              <div className="card card-pad">
                <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={doExport} disabled={exporting || !duration}>
                  {exporting ? `Exporting… ${Math.round(progress * 100)}%` : '⬇ Export clip'}
                </button>
                {exporting && (
                  <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, marginTop: 10 }}>
                    <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--series-2)', borderRadius: 3, transition: 'width .1s' }} />
                  </div>
                )}
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  Records in real time (plays the trimmed segment once). Works on uploaded files.
                </div>
                {error && <div className="callout" style={{ marginTop: 10 }}>{error}</div>}
              </div>
            ) : (
              <div className="card card-pad">
                <div className="field-label">Exported clip</div>
                <video src={result.url} controls playsInline style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: '32vh' }} />
                <div className="field" style={{ margin: '12px 0 8px' }}>
                  <label>Title</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Niche</label>
                  <select value={niche} onChange={(e) => setNiche(e.target.value)}>
                    {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <a className="btn" href={result.url} download={`clip.${result.ext}`}>⬇ Download</a>
                  {saved ? (
                    <span className="badge published">✓ Added to Library</span>
                  ) : (
                    <button className="btn primary" onClick={addToLibrary}>Add to Library →</button>
                  )}
                  <button className="btn ghost sm" onClick={() => setResult(null)}>Export again</button>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  Download to keep the file. Added-to-Library clips play this session; re-attach the downloaded file (or a hosted URL) to keep them after reload.
                </div>

                <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
                  <div className="field-label">Publish to YouTube</div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <select value={pubPrivacy} onChange={(e) => setPubPrivacy(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--page)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}>
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
                    <button className="btn" onClick={publish} disabled={pubBusy}>
                      {pubBusy ? 'Publishing…' : '▶ Publish as Short'}
                    </button>
                  </div>
                  {pubMsg && <div className="callout info" style={{ marginTop: 10 }}>{pubMsg}</div>}
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                    Requires a connected backend with a YouTube app configured (Playbook → Account &amp; Sync; setup in BACKEND.md).
                  </div>
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
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </div>
  )
}

const round1 = (n: number) => Math.round(n * 10) / 10
const clampNum = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo))
