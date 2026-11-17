import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Clip, ClipStatus } from '../types'
import { formatById } from '../../shared/studio.mjs'
import { fmtDate, fmtDuration } from '../utils'
import { hasVideo } from '../media'
import { useBackend } from '../backend/hooks'
import { deleteMedia, isSignedIn } from '../backend/api'
import type { Go } from '../nav'
import { ClipModal } from './ClipModal'
import { ClipPlayer } from './ClipPlayer'
import { PlatformDots } from './bits'

const STATUSES: (ClipStatus | 'all')[] = ['all', 'scripted', 'generating', 'editing', 'ready', 'scheduled', 'published']

/** The one next step for a video, by where it is. */
function nextStep(c: Clip): { label: string; view: 'studio' | 'assemble' | 'publish' } {
  if (!c.plot) return { label: 'Write plot', view: 'studio' }
  if (c.status === 'scripted') return { label: 'Make the clips', view: 'studio' }
  if (c.status === 'generating') return { label: 'Generating…', view: 'studio' }
  if (!hasVideo(c)) return { label: 'Assemble', view: 'assemble' }
  return { label: 'Publish', view: 'publish' }
}

export function Library({ go, onPublish }: { go: Go; onPublish: (clipId: string) => void }) {
  const { clips, removeClip, styleById } = useStore()
  const backend = useBackend()
  const [editing, setEditing] = useState<Clip | null>(null)
  const [playing, setPlaying] = useState<Clip | null>(null)
  const [status, setStatus] = useState<ClipStatus | 'all'>('all')
  const [q, setQ] = useState('')

  const filtered = useMemo(
    () =>
      clips.filter(
        (c) =>
          (status === 'all' || c.status === status) &&
          (!q || `${c.title} ${c.trend?.title ?? ''}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [clips, status, q],
  )

  const remove = (c: Clip) => {
    if (c.posts.some((p) => p.jobId && (p.status === 'publishing' || p.status === 'scheduled'))) {
      alert('This video still has posts going out or scheduled. Cancel them on the Publish page first.')
      return
    }
    if (!confirm(`Delete “${c.title}”? Its clips and voiceover on this device are deleted too.`)) return
    if (c.mediaId && isSignedIn(backend)) void deleteMedia(backend.apiUrl, backend.token, c.mediaId).catch(() => {})
    removeClip(c.id)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Videos</h1>
          <p className="page-desc">Every video from idea to published, with its plot, clips, final cut and where it is posted.</p>
        </div>
        <button className="btn primary" onClick={() => go('trends')}>+ New video</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <input className="player-input" style={{ flex: '1 1 220px' }} placeholder="Search videos or topics…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <select className="mini-select" value={status} onChange={(e) => setStatus(e.target.value as ClipStatus | 'all')} aria-label="Stage">
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All stages' : s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card card-pad">
          <div className="empty">
            {clips.length === 0 ? (
              <>No videos yet. <button className="link-btn" onClick={() => go('trends')}>Find a trend</button> to start one.</>
            ) : 'Nothing matches.'}
          </div>
        </div>
      ) : (
        <div className="grid grid-3">
          {filtered.map((c) => {
            const step = nextStep(c)
            const style = c.styleId ? styleById(c.styleId) : undefined
            return (
              <div key={c.id} className="video-card">
                <div className="video-thumb">
                  {c.thumb ? <img src={c.thumb} alt="" /> : <span>{c.plot ? '🎬' : '💡'}</span>}
                  <span className={`badge ${c.status}`}>{c.status}</span>
                </div>
                <div className="video-body">
                  <div className="clip-title" style={{ fontSize: 14, lineHeight: 1.3 }}>{c.title}</div>
                  <div className="clip-source">
                    {[c.format && formatById(c.format).label, style?.name, c.durationSec ? fmtDuration(c.durationSec) : '', fmtDate(c.createdAt)].filter(Boolean).join(' · ')}
                  </div>
                  <div className="row between" style={{ margin: '8px 0' }}>
                    <PlatformDots posts={c.posts} />
                    {c.validated && <span className="badge published" style={{ fontSize: 10.5 }}>reviewed ✓</span>}
                  </div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 'auto' }}>
                    <button
                      className="btn primary sm"
                      disabled={c.status === 'generating'}
                      onClick={() => (step.view === 'publish' ? onPublish(c.id) : go(step.view, { clipId: c.id }))}
                    >
                      {step.label}
                    </button>
                    {c.plot && step.view !== 'studio' && <button className="btn ghost sm" onClick={() => go('studio', { clipId: c.id })}>Plot</button>}
                    {c.plot && step.view !== 'assemble' && <button className="btn ghost sm" onClick={() => go('assemble', { clipId: c.id })}>Assemble</button>}
                    {hasVideo(c) && <button className="btn ghost sm" onClick={() => setPlaying(c)}>▶ Review</button>}
                    <button className="btn ghost sm" onClick={() => setEditing(c)}>Details</button>
                    <button className="btn ghost sm danger" onClick={() => remove(c)}>Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && <ClipModal existing={editing} onClose={() => setEditing(null)} />}
      {playing && <ClipPlayer clip={playing} onClose={() => setPlaying(null)} />}
    </>
  )
}
