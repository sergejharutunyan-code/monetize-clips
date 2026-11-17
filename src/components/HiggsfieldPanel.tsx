import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Clip, GenerationPlan, Plot, Segment, StylePreset } from '../types'
import { characterSheetPrompt, composeHiggsfieldPrompts, plotToText } from '../../shared/studio.mjs'
import { useBackend, useHiggsfield } from '../backend/hooks'
import { createRenders, retryRender } from '../backend/api'
import { newMediaId, putBlob } from '../media'
import { copyText } from '../publish'
import { uid } from '../data'
import type { Go } from '../nav'

const CLIP_LENGTHS = [5, 8, 10, 15, 30]
const HIGGSFIELD_URL = 'https://higgsfield.ai'

const STATUS_LABEL: Record<NonNullable<Segment['renderStatus']>, string> = {
  queued: 'waiting to start',
  submitted: 'queued at Higgsfield',
  in_progress: 'generating…',
  downloading: 'saving…',
  completed: 'ready',
  failed: 'failed',
  canceled: 'canceled',
}

/** Higgsfield prompts for the plot, one per generation, plus generating or uploading each clip. */
export function HiggsfieldPanel({ clip, style, go }: { clip: Clip; style: StylePreset; go: Go }) {
  const { mutateClip } = useStore()
  const backend = useBackend()
  const hf = useHiggsfield()
  const plot = clip.plot as Plot
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const gen: GenerationPlan = {
    maxSeconds: clip.generation?.maxSeconds ?? 10,
    narration: clip.generation?.narration ?? 'voiceover',
    model: clip.generation?.model ?? hf.defaultModel,
    resolution: clip.generation?.resolution ?? '720p',
    parts: [],
  }
  const model = hf.models.find((m) => m.path === gen.model)
  const parts = useMemo(
    () => composeHiggsfieldPrompts(plot, style, { maxSeconds: gen.maxSeconds, narration: gen.narration, aspect: clip.aspectRatio }),
    [plot, style, gen.maxSeconds, gen.narration, clip.aspectRatio],
  )
  const setGen = (patch: Partial<GenerationPlan>) =>
    mutateClip(clip.id, (c) => ({ generation: { ...gen, ...(c.generation ?? {}), ...patch, parts: [] } }))

  const segmentFor = (i: number) => clip.segments?.find((s) => s.partIndex === i)
  const setSegment = (i: number, seg: Segment | null) =>
    mutateClip(clip.id, (c) => {
      const rest = (c.segments ?? []).filter((s) => s.partIndex !== i)
      const segments = (seg ? [...rest, seg] : rest).sort((a, b) => (a.partIndex ?? 99) - (b.partIndex ?? 99))
      return { segments, status: c.status === 'scripted' || c.status === 'idea' ? 'editing' : c.status }
    })

  const copy = (key: string, text: string) =>
    void copyText(text).then((ok) => {
      if (!ok) return
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400)
    })

  const download = () => {
    const blob = new Blob([plotToText(plot, style, parts)], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${plot.title.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 50) || 'plot'}.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  }

  const upload = async (i: number, file: File | undefined) => {
    if (!file) return
    const id = newMediaId()
    await putBlob(id, file)
    setSegment(i, { id: uid('seg'), partIndex: i, localMediaId: id, name: file.name })
  }

  const fitDuration = (d: number) => (model ? Math.min(model.maxSeconds, Math.max(model.minSeconds, d)) : d)

  const generateAll = async () => {
    if (parts.some((p) => segmentFor(p.index)) && !confirm('Generate every clip again? Clips you already have for this plot are replaced.')) return
    setBusy(true)
    setError(null)
    try {
      const renders = await createRenders(backend.apiUrl, backend.token, {
        clipId: clip.id,
        model: gen.model,
        resolution: gen.resolution,
        aspectRatio: clip.aspectRatio,
        generateAudio: true,
        parts: parts.map((p) => ({ index: p.index, prompt: p.prompt, duration: fitDuration(p.duration) })),
      })
      mutateClip(clip.id, () => ({
        status: 'generating',
        generation: { ...gen, parts },
        segments: renders.map((r) => ({ id: uid('seg'), partIndex: r.partIndex, renderId: r.id, renderStatus: r.status, renderNote: r.progress })),
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the generation.')
    } finally {
      setBusy(false)
    }
  }

  const retry = async (seg: Segment) => {
    if (!seg.renderId) return
    try {
      const r = await retryRender(backend.apiUrl, backend.token, seg.renderId)
      setSegment(seg.partIndex ?? 0, { ...seg, renderStatus: r.status, renderNote: r.progress })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed.')
    }
  }

  const allPrompts = parts.map((p) => `CLIP ${p.index + 1} (${p.duration}s)\n${p.prompt}`).join('\n\n')
  const have = parts.filter((p) => {
    const s = segmentFor(p.index)
    return s && (s.localMediaId || s.renderStatus === 'completed')
  }).length

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h3 className="card-title">Higgsfield prompts</h3>
        <span className="card-hint">{have}/{parts.length} clips ready</span>
      </div>

      <div className="row wrap" style={{ gap: 14, marginBottom: 12, alignItems: 'flex-end' }}>
        {hf.available ? (
          <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
            <label htmlFor="hf-model">Model</label>
            <select id="hf-model" value={gen.model} onChange={(e) => {
              const m = hf.models.find((x) => x.path === e.target.value)
              setGen({ model: e.target.value, maxSeconds: m ? Math.min(gen.maxSeconds, m.maxSeconds) : gen.maxSeconds })
            }}>
              {hf.models.map((m) => <option key={m.path} value={m.path}>{m.label}</option>)}
              {!hf.models.some((m) => m.path === gen.model) && <option value={gen.model}>{gen.model}</option>}
            </select>
          </div>
        ) : null}
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="hf-len">Clip length per generation</label>
          <select id="hf-len" value={gen.maxSeconds} onChange={(e) => setGen({ maxSeconds: Number(e.target.value) })}>
            {CLIP_LENGTHS.filter((l) => !model || (l >= model.minSeconds && l <= model.maxSeconds)).map((l) => (
              <option key={l} value={l}>up to {l}s</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="hf-voice">Narration</label>
          <select id="hf-voice" value={gen.narration} onChange={(e) => setGen({ narration: e.target.value as GenerationPlan['narration'] })}>
            <option value="voiceover">Recorded over the video (consistent voice)</option>
            <option value="model">Spoken inside each clip</option>
          </select>
        </div>
        {hf.available && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="hf-res">Resolution</label>
            <select id="hf-res" value={gen.resolution} onChange={(e) => setGen({ resolution: e.target.value as GenerationPlan['resolution'] })}>
              <option value="480p">480p (draft)</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
        )}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        {parts.length} generation{parts.length === 1 ? '' : 's'}. Each prompt repeats the full style and character description so separate clips match. Captions are added when you assemble, so the prompts ask for no text in frame.
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        {hf.available ? (
          <button className="btn primary" onClick={() => void generateAll()} disabled={busy}>
            {busy ? 'Starting…' : `Generate ${parts.length} clip${parts.length === 1 ? '' : 's'} with Higgsfield`}
          </button>
        ) : (
          <a className="btn primary" href={HIGGSFIELD_URL} target="_blank" rel="noreferrer">Open Higgsfield ↗</a>
        )}
        <button className="btn" onClick={() => copy('all', allPrompts)}>{copied === 'all' ? '✓ Copied' : 'Copy all prompts'}</button>
        <button className="btn" onClick={download}>⬇ Prompt pack (.txt)</button>
      </div>
      {!hf.available && (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Paste each prompt into Higgsfield (9:16), download the clip, and upload it next to its prompt here. To generate straight from this app, set up Higgsfield on the backend (<button className="link-btn" onClick={() => go('accounts')}>Accounts</button>).
        </div>
      )}
      {error && <div className="callout" style={{ marginBottom: 12 }} role="alert">{error}</div>}

      <details className="char-sheet">
        <summary>Character reference image prompt (optional, for consistent characters)</summary>
        <div className="row between" style={{ margin: '8px 0 6px' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Generate this image once, then use it as the reference in image-to-video or reference-to-video models.</span>
          <button className="btn ghost sm" onClick={() => copy('sheet', characterSheetPrompt(plot, style))}>{copied === 'sheet' ? '✓ Copied' : 'Copy'}</button>
        </div>
        <pre className="prompt-box">{characterSheetPrompt(plot, style)}</pre>
      </details>

      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        {parts.map((p) => {
          const seg = segmentFor(p.index)
          const longer = p.seconds > p.duration + 0.5
          return (
            <div key={p.index} className="part-card">
              <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 650, fontSize: 14 }}>
                  Clip {p.index + 1} <span className="muted" style={{ fontWeight: 400 }}>· {fitDuration(p.duration)}s · scene{p.scenes.length > 1 ? 's' : ''} {p.scenes.join(', ')}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {seg?.renderStatus && (
                    <span className={`badge ${seg.renderStatus === 'completed' ? 'post-published' : seg.renderStatus === 'failed' ? 'post-failed' : 'post-publishing'}`}>
                      {STATUS_LABEL[seg.renderStatus]}
                    </span>
                  )}
                  {seg?.localMediaId && <span className="badge post-published" title={seg.name}>uploaded ✓</span>}
                  <button className="btn ghost sm" onClick={() => copy(`p${p.index}`, p.prompt)}>{copied === `p${p.index}` ? '✓ Copied' : 'Copy prompt'}</button>
                </div>
              </div>
              <pre className="prompt-box">{p.prompt}</pre>
              {longer && <div className="platform-note">The scenes here run {p.seconds}s but one generation makes {p.duration}s: pick a longer clip length, or trim the scene.</div>}
              {seg?.renderStatus === 'failed' && (
                <div className="platform-note bad">
                  {seg.renderNote} <button className="link-btn" onClick={() => void retry(seg)}>Retry</button>
                </div>
              )}
              <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                <label className="btn sm" style={{ cursor: 'pointer' }}>
                  {seg?.localMediaId || seg?.renderStatus === 'completed' ? '↻ Replace clip' : '⬆ Upload the clip you made'}
                  <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => void upload(p.index, e.target.files?.[0])} />
                </label>
              </div>
            </div>
          )
        })}
      </div>

      <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
        <button className="btn primary" onClick={() => go('assemble', { clipId: clip.id })} disabled={have === 0}>
          Assemble with captions & voiceover →
        </button>
        {have === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Once you have at least one clip.</span>}
      </div>
    </div>
  )
}
