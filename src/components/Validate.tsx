import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { PLATFORM_META, PLATFORMS } from '../data'
import { fmtDuration } from '../utils'
import type { Clip } from '../types'
import { ClipPlayer } from './ClipPlayer'

export function Validate() {
  const { clips } = useStore()
  const [playing, setPlaying] = useState<Clip | null>(null)

  const { queue, done } = useMemo(() => {
    const queue = clips.filter((c) => !c.validated)
    const done = clips.filter((c) => c.validated)
    return { queue, done }
  }, [clips])

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Validate</h1>
          <p className="page-desc">
            Watch each clip in a real player before it ships. Load the rendered file, check the hook and framing, then mark it validated.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3 className="card-title">To review</h3>
          <span className="card-hint">{queue.length} clips</span>
        </div>
        {queue.length === 0 ? (
          <div className="empty">All clips reviewed. 🎉</div>
        ) : (
          <div className="grid grid-3">
            {queue.map((c) => (
              <ClipTile key={c.id} clip={c} onOpen={() => setPlaying(c)} />
            ))}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Validated</h3>
            <span className="card-hint">{done.length} clips</span>
          </div>
          <div className="grid grid-3">
            {done.map((c) => (
              <ClipTile key={c.id} clip={c} onOpen={() => setPlaying(c)} />
            ))}
          </div>
        </div>
      )}

      {playing && <ClipPlayer clip={playing} onClose={() => setPlaying(null)} />}
    </>
  )
}

function ClipTile({ clip, onOpen }: { clip: Clip; onOpen: () => void }) {
  return (
    <div style={{ background: 'var(--page)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column' }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className={`badge ${clip.status}`}>{clip.status}</span>
        {clip.validated ? (
          <span className="badge published" style={{ fontSize: 10.5 }}>✓ validated</span>
        ) : (
          <span className="badge" style={{ fontSize: 10.5 }}>{clip.videoUrl ? 'has video' : 'no video'}</span>
        )}
      </div>
      <div className="clip-title" style={{ fontSize: 14, lineHeight: 1.3 }}>{clip.title}</div>
      <div className="clip-source" style={{ marginTop: 4 }}>
        {clip.niche} · {clip.aspectRatio} · {fmtDuration(clip.durationSec)}
      </div>
      <div className="muted" style={{ fontSize: 12.5, margin: '10px 0', flex: 1 }}>
        <em>“{clip.hook}”</em>
      </div>
      <div className="row between">
        <span className="platform-dots">
          {PLATFORMS.map((pl) => {
            const post = clip.posts.find((p) => p.platform === pl)!
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
        <button className="btn primary sm" onClick={onOpen}>▶ Open player</button>
      </div>
    </div>
  )
}
