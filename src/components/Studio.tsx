import { useEffect, useState } from 'react'
import { useStore } from '../store'
import type { AspectRatio, Clip, FormatId, Trend } from '../types'
import { FORMATS, TONES, durationPlan, formatById } from '../../shared/studio.mjs'
import { useEngine, writePlot } from '../ai'
import { manualTrend } from '../trends'
import type { Focus, Go } from '../nav'
import { PlotView } from './PlotView'
import { HiggsfieldPanel } from './HiggsfieldPanel'

const LENGTHS = [30, 45, 60]

/** Brief → plot package → Higgsfield prompts, for one video project. */
export function Studio({ focus, go }: { focus: Focus; go: Go }) {
  const { clips, addClip, updateClip, styles, defaultStyleId, styleById, savedTrends } = useStore()
  const project = focus.clipId ? clips.find((c) => c.id === focus.clipId) : undefined
  const engine = useEngine()

  const startTrend = project?.trend ?? focus.trend
  const [trend, setTrend] = useState<Trend | undefined>(startTrend)
  const [topic, setTopic] = useState(startTrend?.title ?? '')
  const [angle, setAngle] = useState(focus.angle ?? '')
  const [format, setFormat] = useState<FormatId>(
    project?.format ?? (focus.angle ? startTrend?.angles?.find((a) => a.idea === focus.angle)?.format : undefined) ?? startTrend?.angles?.[0]?.format ?? 'story',
  )
  const [styleId, setStyleId] = useState(project?.styleId ?? defaultStyleId)
  const [seconds, setSeconds] = useState(project?.plot?.seconds ?? 45)
  const [tone, setTone] = useState(project?.plot?.tone ?? 'funny')
  const [factCheck, setFactCheck] = useState(true)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [briefOpen, setBriefOpen] = useState(!project?.plot)

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [busy])

  const pickTrend = (t: Trend) => {
    setTrend(t)
    setTopic(t.title)
    setAngle('')
    if (t.angles?.[0]) setFormat(t.angles[0].format)
  }

  const write = async () => {
    const title = topic.trim()
    if (!title) return setError('Pick a trend or type a topic first.')
    if (project?.plot && !confirm('Write a new plot for this video? The current plot is replaced.')) return
    const t = trend && trend.title === title ? trend : manualTrend(title)
    setBusy(true)
    setElapsed(0)
    setError(null)
    try {
      const style = styleById(styleId)
      const { plot } = await writePlot({ trend: t, angle: angle.trim(), format, style, seconds, tone, factCheck })
      const fields: Partial<Clip> = {
        title: plot.title,
        status: 'scripted',
        hook: plot.hook,
        caption: plot.caption,
        hashtags: plot.hashtags,
        durationSec: plot.seconds,
        aspectRatio: '9:16' as AspectRatio,
        trend: t,
        format,
        styleId: style.id,
        plot,
        generation: undefined,
      }
      if (project) {
        updateClip(project.id, fields)
        setBriefOpen(false)
      } else {
        const c = addClip({ ...(fields as Omit<Clip, 'id' | 'createdAt' | 'posts'>) })
        go('studio', { clipId: c.id })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Writing the plot failed.')
    } finally {
      setBusy(false)
    }
  }

  const plan = durationPlan(seconds)
  const style = styleById(project?.styleId ?? styleId)
  const usesClaude = engine && engine.engine !== 'offline'

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Studio</h1>
          <p className="page-desc">
            Turn a trend into a plot for a 30–60 second animated short: narration, on-screen text, and scene-by-scene prompts ready for Higgsfield.
          </p>
        </div>
        {project && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => go('studio')}>+ New video</button>
            <button className="btn primary" onClick={() => go('assemble', { clipId: project.id })}>Assemble →</button>
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3 className="card-title">{project?.plot ? 'Brief' : 'What is the video about?'}</h3>
          {project?.plot && (
            <button className="btn ghost sm" onClick={() => setBriefOpen((o) => !o)}>{briefOpen ? 'Hide' : 'Change & rewrite'}</button>
          )}
        </div>

        {!briefOpen && project?.plot ? (
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="badge">{project.trend?.title ?? project.title}</span>
            <span className="badge">{formatById(project.plot.format).label}</span>
            <span className="badge">{style.name}</span>
            <span className="badge">{project.plot.seconds}s</span>
            <span className="badge">{project.plot.tone}</span>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="studio-topic">Topic</label>
              <input id="studio-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Pick a trend below or type any topic" disabled={busy} />
              {trend && trend.title === topic && (trend.summary || trend.whyNow) && (
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {trend.summary} {trend.whyNow && <em>{trend.whyNow}</em>}{' '}
                  {trend.url && <a href={trend.url} target="_blank" rel="noreferrer">source ↗</a>}
                </div>
              )}
              {!topic && savedTrends.length > 0 && (
                <div className="chips" style={{ marginTop: 4 }}>
                  {savedTrends.slice(0, 8).map((t) => (
                    <button key={t.id} className="chip" onClick={() => pickTrend(t)}>{t.title}</button>
                  ))}
                </div>
              )}
              {!topic && savedTrends.length === 0 && (
                <div className="muted" style={{ fontSize: 12.5 }}>
                  No saved trends yet. <button className="link-btn" onClick={() => go('trends')}>Find trends</button>
                </div>
              )}
            </div>

            {trend?.angles && trend.angles.length > 0 && trend.title === topic && (
              <div className="field">
                <label>Angle</label>
                <div className="stack" style={{ gap: 6 }}>
                  {trend.angles.map((a) => (
                    <label key={a.idea} className="check-row">
                      <input type="radio" name="angle" checked={angle === a.idea} onChange={() => { setAngle(a.idea); setFormat(a.format) }} disabled={busy} />
                      <span><strong>{formatById(a.format).label}:</strong> {a.idea}</span>
                    </label>
                  ))}
                  <label className="check-row">
                    <input type="radio" name="angle" checked={!trend.angles.some((a) => a.idea === angle)} onChange={() => setAngle('')} disabled={busy} />
                    <span>My own angle</span>
                  </label>
                </div>
              </div>
            )}
            {!(trend?.angles?.some((a) => a.idea === angle)) && (
              <div className="field">
                <label htmlFor="studio-angle">Angle <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
                <input id="studio-angle" value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="e.g. a cat explains it to her kittens" disabled={busy} />
              </div>
            )}

            <div className="field">
              <label>Format</label>
              <div className="format-grid">
                {FORMATS.map((f) => (
                  <button key={f.id} className={`format-card ${format === f.id ? 'on' : ''}`} onClick={() => setFormat(f.id)} disabled={busy} aria-pressed={format === f.id}>
                    <strong>{f.label}</strong>
                    <span>{f.blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="studio-style">Style</label>
                <select id="studio-style" value={styleId} onChange={(e) => setStyleId(e.target.value)} disabled={busy}>
                  {styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="muted" style={{ fontSize: 12 }}>
                  {styleById(styleId).character.split(',')[0]} hosts. <button className="link-btn" onClick={() => go('styles')}>Edit styles</button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="studio-tone">Tone</label>
                <select id="studio-tone" value={tone} onChange={(e) => setTone(e.target.value)} disabled={busy}>
                  {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Length</label>
              <div className="row wrap" style={{ gap: 10 }}>
                <div className="segmented" role="group" aria-label="Length">
                  {LENGTHS.map((l) => (
                    <button key={l} className={seconds === l ? 'on' : ''} onClick={() => setSeconds(l)} disabled={busy}>{l}s</button>
                  ))}
                </div>
                <span className="muted" style={{ fontSize: 12.5 }}>{plan.scenes} scenes · about {plan.words} words of narration</span>
              </div>
            </div>

            {usesClaude && (
              <label className="check-row" style={{ marginBottom: 12 }}>
                <input type="checkbox" checked={factCheck} onChange={(e) => setFactCheck(e.target.checked)} disabled={busy} />
                <span>Check facts with web search first (slower, recommended for how-tos and explainers)</span>
              </label>
            )}

            <div className="row wrap" style={{ gap: 10 }}>
              <button className="btn primary" onClick={() => void write()} disabled={busy || !topic.trim()}>
                {busy ? `Writing… ${elapsed}s` : project?.plot ? 'Rewrite plot' : '✨ Write plot'}
              </button>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {engine ? engine.label : 'Checking AI…'}
                {engine?.engine === 'offline' && <> · <button className="link-btn" onClick={() => go('accounts')}>Connect Claude</button></>}
              </span>
            </div>
            {busy && usesClaude && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Claude usually takes 30–90 seconds{factCheck ? ' (it checks facts first)' : ''}.</div>}
          </>
        )}
        {error && <div className="callout" style={{ marginTop: 12 }} role="alert">{error}</div>}
      </div>

      {project?.plot && (
        <>
          <PlotView clip={project} />
          <HiggsfieldPanel clip={project} style={style} go={go} />
        </>
      )}
    </>
  )
}
