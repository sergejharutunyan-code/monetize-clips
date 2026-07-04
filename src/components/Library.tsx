import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { PLATFORM_META, PLATFORMS, NICHES } from '../data'
import { fmtDuration, fmtDate } from '../utils'
import type { Clip, ClipStatus } from '../types'
import { ClipModal } from './ClipModal'
import { ClipPlayer } from './ClipPlayer'

const STATUSES: (ClipStatus | 'all')[] = ['all', 'idea', 'editing', 'ready', 'scheduled', 'published']

export function Library() {
  const { clips, removeClip } = useStore()
  const [editing, setEditing] = useState<Clip | null>(null)
  const [playing, setPlaying] = useState<Clip | null>(null)
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState<ClipStatus | 'all'>('all')
  const [niche, setNiche] = useState<string>('all')
  const [q, setQ] = useState('')

  const filtered = useMemo(
    () =>
      clips.filter(
        (c) =>
          (status === 'all' || c.status === status) &&
          (niche === 'all' || c.niche === niche) &&
          (q === '' ||
            c.title.toLowerCase().includes(q.toLowerCase()) ||
            c.sourceTitle.toLowerCase().includes(q.toLowerCase())),
      ),
    [clips, status, niche, q],
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Clip Library</h1>
          <p className="page-desc">
            Every clip you cut, its rights status, and where it stands on each platform.
          </p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + New clip
        </button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <input
            style={{
              flex: '1 1 220px',
              padding: '9px 12px',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'var(--page)',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
            placeholder="Search clips or sources…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="pill-select" value={status} onChange={(e) => setStatus(e.target.value as ClipStatus | 'all')}
            style={selectStyle}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select value={niche} onChange={(e) => setNiche(e.target.value)} style={selectStyle}>
            <option value="all">All niches</option>
            {NICHES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card card-pad">
          <div className="empty">
            No clips match. <button className="btn ghost sm" onClick={() => setCreating(true)}>Add one</button>
          </div>
        </div>
      ) : (
        <div className="card card-pad tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Clip</th>
                <th>Niche</th>
                <th>Rights</th>
                <th>Platforms</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="clip-title">
                        {c.series && <span className="badge scheduled" style={{ marginRight: 6, fontSize: 10.5 }}>P{c.series.part}/{c.series.total}</span>}
                        {c.title}
                      </div>
                      <div className="clip-source">
                        {c.sourceTitle} · {fmtDuration(c.durationSec)} · {c.aspectRatio} · {fmtDate(c.createdAt)}
                      </div>
                    </td>
                    <td>
                      <span className="badge">{c.niche}</span>
                    </td>
                    <td>
                      <span className={`rights ${c.rights}`}>{c.rights}</span>
                    </td>
                    <td>
                      <span className="platform-dots">
                        {PLATFORMS.map((pl) => {
                          const post = c.posts.find((p) => p.platform === pl)!
                          return (
                            <span
                              key={pl}
                              className={`pd ${post.status !== 'not_posted' ? 'on' : ''}`}
                              style={{ background: PLATFORM_META[pl].color }}
                              title={`${PLATFORM_META[pl].label}: ${post.status.replace('_', ' ')}`}
                            >
                              {PLATFORM_META[pl].glyph}
                            </span>
                          )
                        })}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${c.status}`}>{c.status}</span>
                      {c.validated && (
                        <span className="badge published" style={{ marginLeft: 6, fontSize: 10.5 }} title="Validated in the player">✓</span>
                      )}
                    </td>
                    <td className="num">
                      <button className="btn ghost sm" onClick={() => setPlaying(c)} title="Open the video player">
                        ▶ {c.videoUrl ? 'Play' : 'Add video'}
                      </button>
                      <button className="btn ghost sm" onClick={() => setEditing(c)}>
                        Edit
                      </button>
                      <button
                        className="btn ghost sm danger"
                        onClick={() => {
                          if (confirm(`Delete “${c.title}”?`)) removeClip(c.id)
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <ClipModal onClose={() => setCreating(false)} />}
      {editing && <ClipModal existing={editing} onClose={() => setEditing(null)} />}
      {playing && <ClipPlayer clip={playing} onClose={() => setPlaying(null)} />}
    </>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--page)',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontFamily: 'inherit',
}
