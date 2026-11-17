import { useState } from 'react'
import { useStore } from '../store'
import type { Clip, Plot, Scene } from '../types'
import { WORDS_PER_SECOND, formatById } from '../../shared/studio.mjs'
import { copyText } from '../publish'

const countWords = (s: string) => (s.trim().match(/\S+/g) || []).length
const t1 = (n: number) => Math.round(n * 10) / 10

/** The plot package, editable in place: scenes, narration, captions, post text. */
export function PlotView({ clip }: { clip: Clip }) {
  const { mutateClip } = useStore()
  const plot = clip.plot as Plot
  const [copied, setCopied] = useState<string | null>(null)

  const patchPlot = (fn: (p: Plot) => Partial<Plot>, extra: Partial<Clip> = {}) =>
    mutateClip(clip.id, (c) => {
      if (!c.plot) return null
      const next = { ...c.plot, ...fn(c.plot) }
      next.narration = next.scenes.map((s) => s.narration).filter(Boolean).join(' ')
      next.narrationWords = countWords(next.narration)
      return { plot: next, ...extra }
    })

  const editScene = (i: number, patch: Partial<Scene>) =>
    patchPlot((p) => ({ scenes: p.scenes.map((s, k) => (k === i ? { ...s, ...patch } : s)) }))

  const copy = (key: string, text: string) =>
    void copyText(text).then((ok) => {
      if (!ok) return
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400)
    })

  const spoken = t1(plot.narrationWords / WORDS_PER_SECOND)

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h3 className="card-title">Plot</h3>
        <span className="card-hint">{plot.provider === 'claude' ? 'written by Claude' : 'offline template'}</span>
      </div>
      {plot.provider === 'local' && (
        <div className="callout" style={{ marginBottom: 12 }}>
          Written by the offline template writer: generic on purpose. Connect Claude in Accounts for a script about the actual topic, then press “Change &amp; rewrite”.
        </div>
      )}

      <div className="field">
        <label htmlFor="plot-title">Title</label>
        <input id="plot-title" value={plot.title} onChange={(e) => patchPlot(() => ({ title: e.target.value }), { title: e.target.value })} />
      </div>
      <div className="plot-hook">
        <div className="field-label">Hook (first 2 seconds)</div>
        <div style={{ fontSize: 16, fontWeight: 650 }}>“{plot.hook}”</div>
        {plot.logline && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{plot.logline}</div>}
      </div>

      <div className="row wrap" style={{ gap: 6, margin: '12px 0' }}>
        <span className="badge">{formatById(plot.format).label}</span>
        <span className="badge">{plot.seconds}s · {plot.scenes.length} scenes</span>
        <span className={`badge ${Math.abs(spoken - plot.seconds) > plot.seconds * 0.25 ? 'post-failed' : ''}`} title="At a natural speaking pace">
          narration {plot.narrationWords} words ≈ {spoken}s
        </span>
        {plot.characters.map((c) => <span key={c.name} className="badge" title={c.look}>🎭 {c.name}</span>)}
      </div>

      <div className="stack" style={{ gap: 10 }}>
        {plot.scenes.map((s, i) => {
          const fit = countWords(s.narration) / WORDS_PER_SECOND
          return (
            <div key={s.n} className="scene-card">
              <div className="scene-time">
                <strong>{s.n}</strong>
                <span>{t1(s.start)}–{t1(s.start + s.duration)}s</span>
              </div>
              <div className="scene-body">
                <label className="scene-field">
                  <span>What we see</span>
                  <textarea rows={2} value={s.visual} onChange={(e) => editScene(i, { visual: e.target.value })} />
                </label>
                <div className="scene-two">
                  <label className="scene-field">
                    <span>Narration {fit > s.duration * 1.25 && <em className="bad-text">too long for {t1(s.duration)}s</em>}</span>
                    <textarea rows={2} value={s.narration} onChange={(e) => editScene(i, { narration: e.target.value })} />
                  </label>
                  <label className="scene-field">
                    <span>On-screen text</span>
                    <input value={s.onScreenText} onChange={(e) => editScene(i, { onScreenText: e.target.value })} maxLength={60} />
                    <span className="muted" style={{ fontSize: 11.5 }}>🎥 {s.camera}{s.sfx ? ` · 🔊 ${s.sfx}` : ''}</span>
                  </label>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div>
          <div className="row between" style={{ marginBottom: 6 }}>
            <div className="field-label" style={{ marginBottom: 0 }}>Narration script</div>
            <button className="btn ghost sm" onClick={() => copy('narration', plot.narration)}>{copied === 'narration' ? '✓ Copied' : 'Copy'}</button>
          </div>
          <div className="gen-output" style={{ fontSize: 13.5 }}>{plot.narration}</div>
        </div>
        <div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="plot-caption">Post caption</label>
            <textarea id="plot-caption" rows={3} value={clip.caption} onChange={(e) => mutateClip(clip.id, () => ({ caption: e.target.value }))} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="plot-tags">Hashtags</label>
            <input
              id="plot-tags"
              value={clip.hashtags.join(' ')}
              onChange={(e) =>
                mutateClip(clip.id, () => ({
                  hashtags: e.target.value.split(/[\s,]+/).filter(Boolean).map((h) => `#${h.replace(/^#+/, '')}`),
                }))
              }
            />
          </div>
        </div>
      </div>

      {(plot.factNotes || clip.trend?.caution) && (
        <div className="callout info" style={{ marginTop: 14 }}>
          {plot.factNotes && <div><strong>Fact notes:</strong> {plot.factNotes}</div>}
          {clip.trend?.caution && <div style={{ marginTop: plot.factNotes ? 6 : 0 }}><strong>Careful:</strong> {clip.trend.caution}</div>}
        </div>
      )}
    </div>
  )
}
