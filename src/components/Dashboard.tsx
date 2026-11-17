import { useState } from 'react'
import { useStore } from '../store'
import type { Clip, ClipStatus } from '../types'
import { PLATFORMS, PLATFORM_META } from '../data'
import { hasVideo } from '../media'
import type { Go } from '../nav'
import { ClipPlayer } from './ClipPlayer'

const STAGES: { status: ClipStatus; label: string }[] = [
  { status: 'scripted', label: 'Plot written' },
  { status: 'generating', label: 'Generating' },
  { status: 'editing', label: 'Assembling' },
  { status: 'ready', label: 'Ready' },
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'published', label: 'Published' },
]

const STEPS = [
  { n: 1, title: 'Find a trend', body: 'Research what people are talking about this week.', view: 'trends' as const },
  { n: 2, title: 'Write the plot', body: 'Narration, captions and Higgsfield prompts in your house style.', view: 'studio' as const },
  { n: 3, title: 'Generate the clips', body: 'In Higgsfield: paste the prompts, or let the backend do it.', view: 'studio' as const },
  { n: 4, title: 'Assemble', body: 'Join the clips, record the voiceover, burn in the captions.', view: 'assemble' as const },
  { n: 5, title: 'Publish', body: 'TikTok, Instagram and YouTube from one screen.', view: 'publish' as const },
]

export function Dashboard({ go }: { go: Go }) {
  const { clips, savedTrends } = useStore()
  const [playing, setPlaying] = useState<Clip | null>(null)
  const count = (s: ClipStatus) => clips.filter((c) => c.status === s).length
  const max = Math.max(1, ...STAGES.map((s) => count(s.status)))
  const live = clips.reduce((n, c) => n + c.posts.filter((p) => p.status === 'published').length, 0)
  const scheduled = clips.reduce((n, c) => n + c.posts.filter((p) => p.status === 'scheduled').length, 0)
  const inProgress = clips.filter((c) => !['published', 'scheduled'].includes(c.status)).slice(0, 6)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-desc">Trends in, original animated shorts out — on TikTok, Instagram and YouTube.</p>
        </div>
        <button className="btn primary" onClick={() => go('trends')}>+ New video</button>
      </div>

      {clips.length === 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="card-head"><h3 className="card-title">How it works</h3></div>
          <div className="steps">
            {STEPS.map((s) => (
              <button key={s.n} className="step" onClick={() => go(s.view)}>
                <span className="step-num">{s.n}</span>
                <span>
                  <strong>{s.title}</strong>
                  <span className="muted">{s.body}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Saved trends" value={savedTrends.length} sub="topics to write about" color="var(--series-3)" />
        <Stat label="Videos" value={clips.length} sub={`${clips.filter(hasVideo).length} with a final cut`} color="var(--series-1)" />
        <Stat label="Live posts" value={live} sub={`${scheduled} scheduled`} color="var(--series-2)" />
        <Stat label="Reviewed" value={clips.filter((c) => c.validated).length} sub="passed the checklist" color="var(--series-4)" />
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">In progress</h3>
            <button className="btn ghost sm" onClick={() => go('videos')}>All videos →</button>
          </div>
          {inProgress.length === 0 ? (
            <div className="empty">Nothing in progress. <button className="link-btn" onClick={() => go('trends')}>Find a trend</button></div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {inProgress.map((c) => (
                <div key={c.id} className="post-line">
                  {c.thumb ? <img className="thumb" src={c.thumb} alt="" /> : <div className="thumb empty-thumb">🎬</div>}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="clip-title ellipsis" style={{ fontSize: 13.5 }}>{c.title}</div>
                    <div className="clip-source"><span className={`badge ${c.status}`} style={{ fontSize: 10.5 }}>{c.status}</span></div>
                  </div>
                  {hasVideo(c) ? (
                    <button className="btn sm" onClick={() => setPlaying(c)}>▶ Review</button>
                  ) : (
                    <button className="btn sm" onClick={() => go(c.status === 'editing' ? 'assemble' : 'studio', { clipId: c.id })}>Open</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card card-pad">
            <div className="card-head"><h3 className="card-title">Pipeline</h3><span className="card-hint">{clips.length} videos</span></div>
            <div className="stack" style={{ gap: 10 }}>
              {STAGES.map((s) => (
                <div key={s.status}>
                  <div className="row between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{count(s.status)}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4 }}>
                    <div style={{ width: `${(count(s.status) / max) * 100}%`, height: '100%', background: 'var(--series-1)', borderRadius: 4, minWidth: count(s.status) ? 4 : 0 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card card-pad">
            <div className="card-head"><h3 className="card-title">Posts by platform</h3><button className="btn ghost sm" onClick={() => go('publish')}>Publish →</button></div>
            <div className="stack" style={{ gap: 8 }}>
              {PLATFORMS.map((p) => {
                const posts = clips.flatMap((c) => c.posts.filter((x) => x.platform === p))
                return (
                  <div key={p} className="row between" style={{ fontSize: 13.5 }}>
                    <span className="badge"><span className="swatch" style={{ background: PLATFORM_META[p].color }} />{PLATFORM_META[p].label}</span>
                    <span className="muted">{posts.filter((x) => x.status === 'published').length} live · {posts.filter((x) => x.status === 'scheduled').length} scheduled</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {playing && <ClipPlayer clip={playing} onClose={() => setPlaying(null)} />}
    </>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div className="card stat">
      <div className="stat-label"><span className="stat-dot" style={{ background: color }} />{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-delta">{sub}</div>
    </div>
  )
}
