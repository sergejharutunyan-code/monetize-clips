import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { PLATFORM_META, PLATFORMS } from '../data'
import { fmtDateTime, relDay } from '../utils'
import type { Clip, PlatformPost } from '../types'
import { useBackend, useConnections } from '../backend/hooks'
import { cancelJob, isSignedIn, retryJob } from '../backend/api'
import { deriveClipStatus, postFromJob } from '../publish'
import { hasVideo } from '../media'
import { PlatformDots, PlatformIcon } from './bits'

interface Item {
  clip: Clip
  post: PlatformPost
}

/** Everything going out: what is uploading, what is queued, what is ready, what is live. */
export function Scheduler({ onPublish, onOpenAccounts }: { onPublish: (clipId: string) => void; onOpenAccounts: () => void }) {
  const { clips, mutateClip } = useStore()
  const backend = useBackend()
  const signedIn = isSignedIn(backend)
  const { info } = useConnections()
  const [error, setError] = useState<string | null>(null)

  const items = useMemo(() => clips.flatMap((clip) => clip.posts.map((post) => ({ clip, post }))), [clips])
  const active = items.filter((i) => i.post.status === 'publishing' || i.post.status === 'failed')
  const upcoming = useMemo(
    () =>
      items
        .filter((i) => i.post.status === 'scheduled' && i.post.scheduledAt)
        .sort((a, b) => (a.post.scheduledAt! < b.post.scheduledAt! ? -1 : 1)),
    [items],
  )
  const groups = useMemo(() => {
    const g = new Map<string, Item[]>()
    for (const u of upcoming) {
      const key = relDay(u.post.scheduledAt!)
      if (!g.has(key)) g.set(key, [])
      g.get(key)!.push(u)
    }
    return [...g.entries()]
  }, [upcoming])
  const live = useMemo(
    () =>
      items
        .filter((i) => i.post.status === 'published' || i.post.status === 'draft')
        .sort((a, b) => ((a.post.publishedAt ?? '') > (b.post.publishedAt ?? '') ? -1 : 1))
        .slice(0, 9),
    [items],
  )
  const ready = clips.filter((c) => c.status !== 'idea' && c.posts.some((p) => p.status === 'not_posted' || p.status === 'failed'))

  const setPost = (clipId: string, next: PlatformPost) =>
    mutateClip(clipId, (latest) => {
      const posts = latest.posts.map((p) => (p.platform === next.platform ? next : p))
      return { posts, status: deriveClipStatus(latest.status, posts) }
    })

  const act = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    }
  }

  const cancel = ({ clip, post }: Item) =>
    act(async () => {
      if (post.jobId) await cancelJob(backend.apiUrl, backend.token, post.jobId)
      setPost(clip.id, { platform: post.platform, status: 'not_posted' })
    })

  const retry = ({ clip, post }: Item) =>
    act(async () => {
      if (!post.jobId) return onPublish(clip.id)
      setPost(clip.id, postFromJob(await retryJob(backend.apiUrl, backend.token, post.jobId), post))
    })

  const markLive = ({ clip, post }: Item) => {
    const url = prompt(`Mark live on ${PLATFORM_META[post.platform].label}. Paste the link to the post (optional):`, '')
    if (url === null) return
    setPost(clip.id, { platform: post.platform, status: 'published', publishedAt: new Date().toISOString(), url: url.trim() || undefined })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Publish</h1>
          <p className="page-desc">
            Send each clip to YouTube, Instagram and TikTok — now or on a schedule — and see where every post stands.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 14 }}>
            {PLATFORMS.map((p) => {
              const c = info?.platforms[p]
              return (
                <span key={p} className="row" style={{ gap: 7, fontSize: 13.5 }}>
                  <PlatformIcon platform={p} />
                  <span style={{ fontWeight: 600 }}>{PLATFORM_META[p].label}</span>
                  <span className={`badge ${c?.connected ? 'post-published' : ''}`}>
                    {c?.connected ? c.account || 'connected' : !signedIn ? 'by hand' : c && !c.configured ? 'needs setup' : 'not connected'}
                  </span>
                </span>
              )
            })}
          </div>
          <button className="btn sm" onClick={onOpenAccounts}>{signedIn ? 'Manage accounts' : 'Set up automatic posting'}</button>
        </div>
        {!signedIn && (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            No backend connected: you can still post every clip yourself from its Publish screen (share sheet, download, upload links) and track it here.
          </div>
        )}
      </div>

      {error && <div className="callout" style={{ marginBottom: 16 }} role="alert">{error}</div>}

      {active.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3 className="card-title">Going out</h3>
            <span className="card-hint">{active.filter((i) => i.post.status === 'publishing').length} publishing · {active.filter((i) => i.post.status === 'failed').length} failed</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {active.map((it) => (
              <div key={it.clip.id + it.post.platform} className="post-line">
                <PlatformIcon platform={it.post.platform} size={26} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="clip-title ellipsis" style={{ fontSize: 13.5 }}>{it.clip.title}</div>
                  <div className={`clip-source ${it.post.status === 'failed' ? 'bad-text' : ''}`}>
                    {it.post.status === 'failed' ? it.post.error : `${it.post.note || 'Publishing'}…`}
                  </div>
                </div>
                {it.post.status === 'failed' ? (
                  <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                    <button className="btn sm" onClick={() => void retry(it)}>Retry</button>
                    <button className="btn sm ghost" onClick={() => onPublish(it.clip.id)}>Edit</button>
                  </div>
                ) : (
                  <span className="spinner" aria-label="publishing" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Ready to publish</h3>
            <span className="card-hint">{ready.length} clips</span>
          </div>
          {ready.length === 0 ? (
            <div className="empty">Nothing waiting. Cut a clip in the Clip Editor.</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {ready.map((c) => (
                <div key={c.id} className="post-line">
                  {c.thumb ? <img className="thumb" src={c.thumb} alt="" /> : <div className="thumb empty-thumb">{hasVideo(c) ? '▶' : '—'}</div>}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="clip-title ellipsis" style={{ fontSize: 13.5 }}>{c.title}</div>
                    <div className="clip-source row" style={{ gap: 8 }}>
                      <PlatformDots posts={c.posts} />
                      {!hasVideo(c) && <span>no video yet</span>}
                      {c.rights === 'unverified' && <span className="bad-text">rights unverified</span>}
                    </div>
                  </div>
                  <button className="btn primary sm" style={{ flexShrink: 0 }} onClick={() => onPublish(c.id)}>Publish…</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card card-pad">
            <div className="card-head">
              <h3 className="card-title">Scheduled</h3>
              <span className="card-hint">{upcoming.length} posts</span>
            </div>
            {groups.length === 0 ? (
              <div className="empty" style={{ padding: '28px 12px' }}>Nothing scheduled. Pick “Schedule” when you publish a clip.</div>
            ) : (
              <div className="stack">
                {groups.map(([day, list]) => (
                  <div key={day}>
                    <div className="field-label">{day}</div>
                    <div className="stack" style={{ gap: 8 }}>
                      {list.map((it) => (
                        <div key={it.clip.id + it.post.platform} className="post-line">
                          <PlatformIcon platform={it.post.platform} size={26} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="clip-title ellipsis" style={{ fontSize: 13.5 }}>{it.clip.title}</div>
                            <div className="clip-source">
                              {fmtDateTime(it.post.scheduledAt)} · {it.post.jobId ? 'posts automatically' : 'you post it'}
                            </div>
                          </div>
                          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                            {!it.post.jobId && <button className="btn sm" onClick={() => markLive(it)}>Mark live</button>}
                            <button className="btn sm ghost" onClick={() => void cancel(it)}>{it.post.jobId ? 'Cancel' : 'Remove'}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {upcoming.some((i) => i.post.jobId) && (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                Automatic posts go out from the backend, so it has to be running at that time (a free host that sleeps will post late).
              </div>
            )}
          </div>

          <div className="card card-pad">
            <div className="card-head">
              <h3 className="card-title">Recently posted</h3>
              <span className="card-hint">{live.length ? 'newest first' : ''}</span>
            </div>
            {live.length === 0 ? (
              <div className="empty" style={{ padding: '28px 12px' }}>Nothing posted yet.</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {live.map((it) => (
                  <div key={it.clip.id + it.post.platform} className="post-line">
                    <PlatformIcon platform={it.post.platform} size={26} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="clip-title ellipsis" style={{ fontSize: 13.5 }}>{it.clip.title}</div>
                      <div className="clip-source">
                        {it.post.status === 'draft' ? 'Draft in your TikTok inbox' : `Live · ${fmtDateTime(it.post.publishedAt)}`}
                      </div>
                    </div>
                    {it.post.url && <a className="btn sm" style={{ flexShrink: 0, textDecoration: 'none' }} href={it.post.url} target="_blank" rel="noreferrer">Open ↗</a>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
