import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { PLATFORM_META, PLATFORMS, estimateRevenue } from '../data'
import { fmtDateTime, relDay } from '../utils'
import type { Clip, Platform, PlatformPost } from '../types'

interface Upcoming {
  clip: Clip
  post: PlatformPost
}

export function Scheduler() {
  const { clips, updateClip } = useStore()

  const upcoming = useMemo(() => {
    const items: Upcoming[] = []
    for (const c of clips) {
      for (const p of c.posts) {
        if (p.status === 'scheduled' && p.scheduledAt) items.push({ clip: c, post: p })
      }
    }
    items.sort((a, b) => (a.post.scheduledAt! < b.post.scheduledAt! ? -1 : 1))
    return items
  }, [clips])

  const groups = useMemo(() => {
    const g = new Map<string, Upcoming[]>()
    for (const u of upcoming) {
      const key = relDay(u.post.scheduledAt!)
      if (!g.has(key)) g.set(key, [])
      g.get(key)!.push(u)
    }
    return [...g.entries()]
  }, [upcoming])

  const schedulable = clips.filter((c) => c.status !== 'published' && c.posts.some((p) => p.status === 'not_posted'))

  const setPost = (clip: Clip, platform: Platform, patch: Partial<PlatformPost>) => {
    updateClip(clip.id, {
      posts: clip.posts.map((p) => (p.platform === platform ? { ...p, ...patch } : p)),
      status: 'scheduled',
    })
  }

  const publishNow = (clip: Clip, platform: Platform) => {
    const v = prompt(`Publish to ${PLATFORM_META[platform].label}. Enter starting view count (or leave blank):`, '0')
    if (v === null) return
    const views = Math.max(0, parseInt(v.replace(/\D/g, ''), 10) || 0)
    const posts = clip.posts.map((p) =>
      p.platform === platform
        ? {
            ...p,
            status: 'published' as const,
            publishedAt: new Date().toISOString(),
            scheduledAt: undefined,
            views,
            likes: Math.round(views * 0.08),
            comments: Math.round(views * 0.004),
            shares: Math.round(views * 0.012),
            revenue: estimateRevenue(platform, views),
          }
        : p,
    )
    const allPublished = posts.every((p) => p.status === 'published' || p.status === 'not_posted')
    updateClip(clip.id, { posts, status: allPublished && posts.some((p) => p.status === 'published') ? 'published' : clip.status })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Scheduler</h1>
          <p className="page-desc">
            Queue clips for each platform and stagger release times. Post the same clip everywhere to maximize reach per edit.
          </p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Upcoming</h3>
            <span className="card-hint">{upcoming.length} scheduled</span>
          </div>
          {groups.length === 0 ? (
            <div className="empty">Nothing scheduled. Queue a clip from the right →</div>
          ) : (
            <div className="stack">
              {groups.map(([day, items]) => (
                <div key={day}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    {day}
                  </div>
                  <div className="stack" style={{ gap: 8 }}>
                    {items.map(({ clip, post }) => (
                      <div key={clip.id + post.platform} className="row between" style={{ padding: '10px 12px', background: 'var(--page)', borderRadius: 9, border: '1px solid var(--border)' }}>
                        <div className="row" style={{ gap: 10, minWidth: 0 }}>
                          <span className="pd on" style={{ width: 26, height: 26, borderRadius: 7, background: PLATFORM_META[post.platform].color, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13 }}>
                            {PLATFORM_META[post.platform].glyph}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="clip-title" style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clip.title}</div>
                            <div className="clip-source">{fmtDateTime(post.scheduledAt)}</div>
                          </div>
                        </div>
                        <button className="btn sm" onClick={() => publishNow(clip, post.platform)}>
                          Mark live
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Ready to schedule</h3>
            <span className="card-hint">{schedulable.length} clips</span>
          </div>
          {schedulable.length === 0 ? (
            <div className="empty">No clips waiting. Add clips in the Library.</div>
          ) : (
            <div className="stack">
              {schedulable.map((c) => (
                <ScheduleCard key={c.id} clip={c} onSchedule={setPost} onPublish={publishNow} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ScheduleCard({
  clip,
  onSchedule,
  onPublish,
}: {
  clip: Clip
  onSchedule: (clip: Clip, platform: Platform, patch: Partial<PlatformPost>) => void
  onPublish: (clip: Clip, platform: Platform) => void
}) {
  const [when, setWhen] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 2, 0, 0, 0)
    return toLocalInput(d)
  })

  return (
    <div style={{ padding: '12px 14px', background: 'var(--page)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div className="clip-title" style={{ fontSize: 14 }}>{clip.title}</div>
      <div className="clip-source" style={{ marginBottom: 10 }}>{clip.niche} · {clip.sourceCreator}</div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
        />
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {PLATFORMS.map((pl) => {
          const post = clip.posts.find((p) => p.platform === pl)!
          const done = post.status !== 'not_posted'
          return (
            <button
              key={pl}
              className="btn sm"
              disabled={done}
              onClick={() => onSchedule(clip, pl, { status: 'scheduled', scheduledAt: new Date(when).toISOString() })}
              style={{
                borderColor: done ? 'var(--border)' : PLATFORM_META[pl].color,
                color: done ? 'var(--text-muted)' : PLATFORM_META[pl].color,
                opacity: done ? 0.55 : 1,
              }}
              title={done ? `Already ${post.status.replace('_', ' ')}` : `Schedule to ${PLATFORM_META[pl].label}`}
            >
              {PLATFORM_META[pl].glyph} {done ? post.status.replace('_', ' ') : PLATFORM_META[pl].label}
            </button>
          )
        })}
        <button className="btn sm ghost" onClick={() => onPublish(clip, 'tiktok')} title="Mark as published immediately">
          Post now →
        </button>
      </div>
    </div>
  )
}

function toLocalInput(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
