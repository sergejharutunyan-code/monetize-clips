import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Clip, Segment } from '../types'
import { uid } from '../data'
import { fmtDuration } from '../utils'
import { deleteBlob, newMediaId, putBlob, useClipVideo } from '../media'
import {
  captionsFromScenes, drawAt, primeFromTap, playSequence, setMonitor, targetDims, timeline,
  type ExportResult, type Quality, type Sequence,
} from '../render'
import type { Focus, Go } from '../nav'

const isReady = (s: Segment) => Boolean(s.localMediaId || (s.url && s.renderStatus !== 'failed'))
const t1 = (n: number) => Math.round(n * 10) / 10

/** Put the generated clips together with captions and a voiceover, and export the final video. */
export function Assemble({ focus, go, onPublish }: { focus: Focus; go: Go; onPublish: (clipId: string) => void }) {
  const { clips } = useStore()
  const clip = focus.clipId ? clips.find((c) => c.id === focus.clipId) : undefined
  const candidates = clips.filter((c) => c.plot || c.segments?.length)

  if (!clip) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">Assemble</h1>
            <p className="page-desc">Join a video’s clips in order, add the narration and captions, and export the final cut.</p>
          </div>
        </div>
        <div className="card card-pad">
          {candidates.length === 0 ? (
            <div className="empty">
              No videos yet. <button className="link-btn" onClick={() => go('trends')}>Find a trend</button> and write a plot first.
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {candidates.map((c) => (
                <button key={c.id} className="post-line pick-line" onClick={() => go('assemble', { clipId: c.id })}>
                  <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                    <div className="clip-title ellipsis">{c.title}</div>
                    <div className="clip-source">{(c.segments ?? []).filter(isReady).length} clip(s) ready · {c.status}</div>
                  </div>
                  <span className="btn sm">Open →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </>
    )
  }
  return <Editor key={clip.id} clip={clip} go={go} onPublish={onPublish} />
}

function Editor({ clip, go, onPublish }: { clip: Clip; go: Go; onPublish: (clipId: string) => void }) {
  const { mutateClip, styleById } = useStore()
  const style = styleById(clip.styleId)
  const plot = clip.plot
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRefs = useRef(new Map<string, HTMLVideoElement>())
  const voRef = useRef<HTMLAudioElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [durations, setDurations] = useState<Record<string, number>>({})
  const [voDuration, setVoDuration] = useState(0)
  const [captionsOn, setCaptionsOn] = useState(true)
  const [titleOn, setTitleOn] = useState(true)
  const [clipVolume, setClipVolume] = useState(clip.generation?.narration === 'model' ? 1 : 0.35)
  const [voiceVolume, setVoiceVolume] = useState(1)
  const [quality, setQuality] = useState<Quality>('1080p')
  const [mode, setMode] = useState<'idle' | 'preview' | 'export'>('idle')
  const [pos, setPos] = useState(0)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<(ExportResult & { url: string }) | null>(null)

  const segments = useMemo(
    () => [...(clip.segments ?? [])].sort((a, b) => (a.partIndex ?? 999) - (b.partIndex ?? 999)),
    [clip.segments],
  )
  const ready = segments.filter(isReady)
  const allLoaded = ready.every((s) => durations[s.id] > 0)
  const voice = useClipVideo(clip.voiceoverId ? { localMediaId: clip.voiceoverId } : null)
  const dims = targetDims(clip.aspectRatio, quality)

  const setSegments = (fn: (segs: Segment[]) => Segment[]) =>
    mutateClip(clip.id, (c) => ({ segments: fn([...(c.segments ?? [])].sort((a, b) => (a.partIndex ?? 999) - (b.partIndex ?? 999))) }))

  // Reorder by rewriting partIndex so the order sticks.
  const move = (i: number, d: -1 | 1) =>
    setSegments((segs) => {
      const j = i + d
      if (j < 0 || j >= segs.length) return segs
      const next = [...segs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next.map((s, k) => ({ ...s, partIndex: k }))
    })
  const remove = (id: string) =>
    setSegments((segs) => {
      const gone = segs.find((s) => s.id === id)
      if (gone?.localMediaId) void deleteBlob(gone.localMediaId)
      return segs.filter((s) => s.id !== id)
    })
  const trim = (id: string, patch: Partial<Segment>) => setSegments((segs) => segs.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const addFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      const id = newMediaId()
      await putBlob(id, f)
      setSegments((segs) => [...segs, { id: uid('seg'), partIndex: segs.length, localMediaId: id, name: f.name }])
    }
  }

  const buildSequence = (): Sequence | null => {
    const parts = ready
      .map((s) => {
        const video = videoRefs.current.get(s.id)
        const full = durations[s.id] || 0
        if (!video || !full) return null
        const inSec = Math.min(Math.max(0, s.inSec ?? 0), Math.max(0, full - 0.2))
        const outSec = Math.max(inSec + 0.2, Math.min(full, s.outSec ?? full))
        return { video, inSec, outSec }
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
    if (!parts.length) return null
    const voiceover = clip.voiceoverId && voRef.current && voDuration > 0 ? voRef.current : null
    const { total } = timeline({ clips: parts, voiceover, holdForVoiceover: true })
    return {
      clips: parts,
      voiceover,
      overlay: {
        captions: captionsOn && plot ? captionsFromScenes(plot.scenes, plot.seconds, total) : [],
        hook: titleOn && clip.title ? { text: clip.title, until: 2.5 } : null,
        style: style.caption,
      },
      clipVolume,
      voiceVolume,
      holdForVoiceover: true,
    }
  }

  const seq = allLoaded ? buildSequence() : null
  const total = seq ? timeline(seq).total : 0

  // Still frame for scrubbing and whenever settings change.
  useEffect(() => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || mode !== 'idle') return
    c.width = dims.w
    c.height = dims.h
    const s = buildSequence()
    if (!s) {
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, c.width, c.height)
      return
    }
    void drawAt(ctx, s, Math.min(pos, timeline(s).total - 0.05)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, mode, captionsOn, titleOn, allLoaded, segments, dims.w, dims.h, voDuration, style])

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])

  const run = (record: boolean) => {
    const s = buildSequence()
    if (!s) return setError('Add at least one clip that has finished loading.')
    primeFromTap(s) // must stay inside the tap
    const c = canvasRef.current!
    c.width = dims.w
    c.height = dims.h
    const abort = new AbortController()
    abortRef.current = abort
    setError(null)
    setProgress(0)
    setMode(record ? 'export' : 'preview')
    if (record) setResult(null)
    void playSequence(c, s, {
      record,
      monitor: true,
      signal: abort.signal,
      onProgress: (t, tot) => {
        setProgress(t / tot)
        if (!record) setPos(t)
      },
    })
      .then(async (out) => {
        if (!out) return
        const id = newMediaId()
        await putBlob(id, out.blob)
        mutateClip(clip.id, (cur) => {
          if (cur.localMediaId) void deleteBlob(cur.localMediaId)
          return {
            localMediaId: id,
            mediaId: undefined,
            videoUrl: undefined,
            thumb: out.thumb,
            durationSec: Math.round(out.seconds),
            validated: false,
            validatedAt: undefined,
            status: cur.status === 'published' || cur.status === 'scheduled' ? cur.status : 'ready',
          }
        })
        setResult({ ...out, url: URL.createObjectURL(out.blob) })
      })
      .catch((e) => {
        if (!(e instanceof Error && e.message === 'Export cancelled.')) setError(e instanceof Error ? e.message : 'Playback failed.')
      })
      .finally(() => {
        abortRef.current = null
        setMode('idle')
        setMonitor(true)
      })
  }

  const busy = mode !== 'idle'

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Assemble</h1>
          <p className="page-desc">{clip.title}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => go('studio', { clipId: clip.id })}>← Studio</button>
          <button className="btn" onClick={() => go('assemble')}>Other video</button>
        </div>
      </div>

      {/* Sources play off-screen; their sound is mixed through Web Audio. */}
      <div className="media-bin" aria-hidden>
        {segments.map((s) => (
          <SegmentVideo
            key={s.id}
            seg={s}
            onRef={(el) => (el ? videoRefs.current.set(s.id, el) : videoRefs.current.delete(s.id))}
            onDuration={(d) => setDurations((m) => (m[s.id] === d ? m : { ...m, [s.id]: d }))}
          />
        ))}
        {voice.src && <audio ref={voRef} src={voice.src} preload="auto" onLoadedMetadata={(e) => setVoDuration(e.currentTarget.duration || 0)} />}
      </div>

      <div className="editor-grid">
        <div className="card card-pad">
          <div className="editor-stage">
            <canvas ref={canvasRef} className="editor-canvas" style={{ aspectRatio: `${dims.w} / ${dims.h}` }} />
          </div>
          <div className="row between" style={{ marginTop: 12, gap: 10 }}>
            {mode === 'preview' ? (
              <button className="btn sm" onClick={() => abortRef.current?.abort()}>■ Stop</button>
            ) : (
              <button className="btn sm" onClick={() => run(false)} disabled={busy || !seq}>▶ Preview</button>
            )}
            <input type="range" min={0} max={Math.max(0.1, total)} step={0.05} value={Math.min(pos, total)} onChange={(e) => setPos(Number(e.target.value))}
              disabled={busy || !seq} style={{ flex: 1, minWidth: 0 }} aria-label="Position" />
            <span className="badge" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(Math.round(pos))} / {fmtDuration(Math.round(total))}</span>
          </div>
          {!allLoaded && ready.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Loading clips…</div>}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card card-pad">
            <div className="card-head">
              <h3 className="card-title">Clips</h3>
              <span className="card-hint">{ready.length} ready{total ? ` · ${t1(total)}s` : ''}</span>
            </div>
            {segments.length === 0 && (
              <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                No clips yet. Generate them from the prompts in the <button className="link-btn" onClick={() => go('studio', { clipId: clip.id })}>Studio</button>, or add files you made in Higgsfield.
              </div>
            )}
            <div className="stack" style={{ gap: 8 }}>
              {segments.map((s, i) => {
                const full = durations[s.id]
                return (
                  <div key={s.id} className="seg-row">
                    <div className="row between" style={{ gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="clip-title ellipsis" style={{ fontSize: 13.5 }}>
                          {i + 1}. {s.name || (s.partIndex !== undefined && plot ? `Clip ${s.partIndex + 1}` : 'Clip')}
                        </div>
                        <div className="clip-source">
                          {!isReady(s) ? s.renderNote || s.renderStatus || 'not ready' : full ? `${t1(full)}s` : 'loading…'}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 4, flexShrink: 0 }}>
                        <button className="btn ghost sm" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label="Move up">↑</button>
                        <button className="btn ghost sm" onClick={() => move(i, 1)} disabled={busy || i === segments.length - 1} aria-label="Move down">↓</button>
                        <button className="btn ghost sm danger" onClick={() => remove(s.id)} disabled={busy} aria-label="Remove">✕</button>
                      </div>
                    </div>
                    {isReady(s) && full > 0 && (
                      <div className="row" style={{ gap: 8, marginTop: 6 }}>
                        <label className="mini-field">From
                          <input type="number" min={0} max={full} step={0.1} value={t1(s.inSec ?? 0)} disabled={busy}
                            onChange={(e) => trim(s.id, { inSec: Math.max(0, Number(e.target.value) || 0) })} />
                        </label>
                        <label className="mini-field">To
                          <input type="number" min={0} max={full} step={0.1} value={t1(s.outSec ?? full)} disabled={busy}
                            onChange={(e) => trim(s.id, { outSec: Math.min(full, Number(e.target.value) || full) })} />
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <label className="btn sm" style={{ marginTop: 10, cursor: 'pointer' }}>
              + Add clip files
              <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={(e) => void addFiles(e.target.files)} />
            </label>
          </div>

          <Voiceover clip={clip} disabled={busy} duration={voDuration} />

          <div className="card card-pad">
            <div className="field-label">Text &amp; sound</div>
            <label className="check-row" style={{ marginBottom: 6 }}>
              <input type="checkbox" checked={captionsOn} onChange={(e) => setCaptionsOn(e.target.checked)} disabled={busy} />
              <span>Burn in the on-screen text from the plot</span>
            </label>
            <label className="check-row" style={{ marginBottom: 10 }}>
              <input type="checkbox" checked={titleOn} onChange={(e) => setTitleOn(e.target.checked)} disabled={busy} />
              <span>Title card for the first 2.5 seconds</span>
            </label>
            <Slider label={`Clip sound ${Math.round(clipVolume * 100)}%`} value={clipVolume} onChange={setClipVolume} disabled={busy} />
            <Slider label={`Voiceover ${Math.round(voiceVolume * 100)}%`} value={voiceVolume} onChange={setVoiceVolume} disabled={busy || !clip.voiceoverId} />
          </div>

          <div className="card card-pad">
            <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
              <div className="segmented" role="group" aria-label="Quality">
                {(['1080p', '720p'] as Quality[]).map((q) => (
                  <button key={q} className={quality === q ? 'on' : ''} onClick={() => setQuality(q)} disabled={busy}>{q}</button>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => run(true)} disabled={busy || !seq}>
                {mode === 'export' ? `Exporting… ${Math.round(progress * 100)}%` : '⬇ Export final video'}
              </button>
              {mode === 'export' && <button className="btn" onClick={() => abortRef.current?.abort()}>Cancel</button>}
            </div>
            {mode === 'export' && <div className="bar" style={{ marginTop: 10 }}><div style={{ width: `${progress * 100}%` }} /></div>}
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              Records in real time ({fmtDuration(Math.round(total))}). Keep this tab open and in front while it runs.
            </div>
            {error && <div className="callout" style={{ marginTop: 10 }} role="alert">{error}</div>}
            {result && (
              <div style={{ marginTop: 12 }}>
                <video src={result.url} controls playsInline style={{ width: '100%', maxHeight: '40vh', borderRadius: 8, background: '#000' }} />
                <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                  <button className="btn primary" onClick={() => onPublish(clip.id)}>Publish…</button>
                  <a className="btn" href={result.url} download={`${clip.title.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 50) || 'video'}.${result.ext}`}>⬇ Download</a>
                  <span className="badge post-published">saved to Videos ✓</span>
                </div>
                {!result.platformReady && (
                  <div className="platform-note" style={{ marginTop: 6 }}>
                    This browser recorded WebM. YouTube takes it; for Instagram and TikTok the backend converts it to MP4 when you publish.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function SegmentVideo({ seg, onRef, onDuration }: { seg: Segment; onRef: (el: HTMLVideoElement | null) => void; onDuration: (d: number) => void }) {
  const { src } = useClipVideo(isReady(seg) ? { localMediaId: seg.localMediaId, videoUrl: seg.url } : null)
  if (!src) return null
  return (
    <video
      ref={onRef}
      src={src}
      preload="auto"
      playsInline
      crossOrigin={src.startsWith('http') ? 'anonymous' : undefined}
      onLoadedMetadata={(e) => onDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
    />
  )
}

function Slider({ label, value, onChange, disabled }: { label: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <input type="range" min={0} max={1} step={0.05} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </label>
  )
}

/** Record the narration with the script as a teleprompter, or upload an audio file. */
function Voiceover({ clip, disabled, duration }: { clip: Clip; disabled: boolean; duration: number }) {
  const { mutateClip } = useStore()
  const plot = clip.plot
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const { src } = useClipVideo(clip.voiceoverId ? { localMediaId: clip.voiceoverId } : null)

  useEffect(() => {
    if (!recording) return
    const started = Date.now()
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 100)
    return () => clearInterval(t)
  }, [recording])

  const save = async (blob: Blob) => {
    const id = newMediaId()
    await putBlob(id, blob)
    mutateClip(clip.id, (c) => {
      if (c.voiceoverId) void deleteBlob(c.voiceoverId)
      return { voiceoverId: id }
    })
  }

  const start = async () => {
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      return setError('Microphone access was blocked. Allow it in the browser, or upload a recording instead.')
    }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    const chunks: BlobPart[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      setRecording(false)
      const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' })
      if (blob.size) void save(blob)
    }
    recRef.current = rec
    rec.start(500)
    setElapsed(0)
    setRecording(true)
  }

  const current = plot?.scenes.findIndex((s) => elapsed >= s.start && elapsed < s.start + s.duration) ?? -1

  return (
    <div className="card card-pad">
      <div className="card-head">
        <h3 className="card-title">Voiceover</h3>
        <span className="card-hint">{clip.voiceoverId ? `${t1(duration)}s recorded` : 'optional'}</span>
      </div>
      {plot && (
        <div className="prompter" aria-live="polite">
          {plot.scenes.map((s, i) => (
            <p key={s.n} className={recording && i === current ? 'now' : ''}>
              <span className="muted">{t1(s.start)}s</span> {s.narration}
            </p>
          ))}
        </div>
      )}
      <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
        {recording ? (
          <button className="btn primary" onClick={() => recRef.current?.stop()}>■ Stop ({t1(elapsed)}s)</button>
        ) : (
          <button className="btn" onClick={() => void start()} disabled={disabled}>● {clip.voiceoverId ? 'Re-record' : 'Record'} narration</button>
        )}
        <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
          ⬆ Upload audio
          <input type="file" accept="audio/*,video/*" style={{ display: 'none' }} disabled={disabled || recording}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void save(f) }} />
        </label>
        {clip.voiceoverId && !recording && (
          <button className="btn ghost sm danger" disabled={disabled} onClick={() => mutateClip(clip.id, (c) => {
            if (c.voiceoverId) void deleteBlob(c.voiceoverId)
            return { voiceoverId: undefined }
          })}>Remove</button>
        )}
      </div>
      {src && !recording && <audio src={src} controls style={{ width: '100%', marginTop: 10 }} />}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        Read at an easy pace; the highlighted line follows the plot’s timing. A text-to-speech file works too — upload it.
      </div>
      {error && <div className="callout" style={{ marginTop: 10 }} role="alert">{error}</div>}
    </div>
  )
}
