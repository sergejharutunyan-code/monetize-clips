import { useState } from 'react'
import { useStore } from '../store'
import { overview, statusCounts, platformCounts } from '../metrics'
import type { Clip } from '../types'
import { ClipPlayer } from './ClipPlayer'

export function Dashboard({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { clips } = useStore()
  const [playing, setPlaying] = useState<Clip | null>(null)

  const o = overview(clips)
  const stages = statusCounts(clips)
  const platforms = platformCounts(clips)
  const toValidate = clips.filter((c) => !c.validated && c.status !== 'published')
  const maxStage = Math.max(1, ...stages.map((s) => s.count))

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-desc">
            Your clip pipeline across TikTok, Instagram, and YouTube — create, validate, schedule, publish.
          </p>
        </div>
        <button className="btn primary" onClick={() => onNavigate('library')}>
          + New clip
        </button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Clips" value={`${o.total}`} sub={`${o.withVideo} with video`} color="var(--series-1)" />
        <StatTile label="Validated" value={`${o.validated}`} sub="passed review" color="var(--series-2)" />
        <StatTile label="Needs review" value={`${o.needsValidation}`} sub="not yet validated" color="var(--series-3)" />
        <StatTile label="Live posts" value={`${o.publishedPosts}`} sub={`${o.scheduledPosts} scheduled`} color="var(--series-4)" />
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Needs validation</h3>
            <button className="btn ghost sm" onClick={() => onNavigate('validate')}>
              Open validator →
            </button>
          </div>
          {toValidate.length === 0 ? (
            <div className="empty">Nothing waiting — every clip has been reviewed.</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {toValidate.slice(0, 6).map((c) => (
                <div key={c.id} className="row between" style={{ padding: '10px 12px', background: 'var(--page)', borderRadius: 9, border: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="clip-title" style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.title}
                    </div>
                    <div className="clip-source">
                      <span className={`badge ${c.status}`} style={{ fontSize: 10.5, marginRight: 6 }}>{c.status}</span>
                      {c.videoUrl ? 'video attached' : 'no video yet'}
                    </div>
                  </div>
                  <button className="btn sm" onClick={() => setPlaying(c)}>▶ Validate</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card card-pad">
            <div className="card-head">
              <h3 className="card-title">Pipeline by stage</h3>
              <span className="card-hint">{o.total} clips</span>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {stages.map((s) => (
                <div key={s.status}>
                  <div className="row between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{s.status}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4 }}>
                    <div style={{ width: `${(s.count / maxStage) * 100}%`, height: '100%', background: 'var(--series-1)', borderRadius: 4, minWidth: s.count ? 4 : 0 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-head">
              <h3 className="card-title">Distribution</h3>
              <button className="btn ghost sm" onClick={() => onNavigate('scheduler')}>Scheduler →</button>
            </div>
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th className="num">Scheduled</th>
                    <th className="num">Published</th>
                  </tr>
                </thead>
                <tbody>
                  {platforms.map((p) => (
                    <tr key={p.platform}>
                      <td>
                        <span className="badge"><span className="swatch" style={{ background: p.color }} />{p.label}</span>
                      </td>
                      <td className="num">{p.scheduled}</td>
                      <td className="num">{p.published}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {playing && <ClipPlayer clip={playing} onClose={() => setPlaying(null)} />}
    </>
  )
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="card stat">
      <div className="stat-label">
        <span className="stat-dot" style={{ background: color }} />
        {label}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-delta">{sub}</div>
    </div>
  )
}
