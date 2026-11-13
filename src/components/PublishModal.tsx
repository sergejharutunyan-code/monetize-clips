import { useEffect, useMemo, useState } from 'react'
import type { Clip, Platform, PlatformPost } from '../types'
import { PLATFORMS, PLATFORM_META } from '../data'
import { useStore } from '../store'
import { useBackend, useConnections } from '../backend/hooks'
import {
  cancelJob, connectUrl, isSignedIn,
  type PublishTarget, type TikTokPrivacy, type YouTubePrivacy,
} from '../backend/api'
import { getBlob, newMediaId, putBlob, useClipVideo } from '../media'
import {
  canShareFile, composeCaption, copyText, deriveClipStatus, downloadFile, fileForClip, LIMITS,
  postFromJob, shareFile, submitPublish, UPLOAD_PAGES, type EnsureMediaStatus,
} from '../publish'
import { fmtDateTime, fmtDuration } from '../utils'
import { PlatformIcon, PostBadge } from './bits'

const RATIO: Record<Clip['aspectRatio'], string> = { '9:16': '9 / 16', '1:1': '1 / 1', '16:9': '16 / 9' }

const TIKTOK_PRIVACY: { value: TikTokPrivacy; label: string }[] = [
  { value: 'SELF_ONLY', label: 'Only me' },
  { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Friends' },
  { value: 'FOLLOWER_OF_CREATOR', label: 'Followers' },
  { value: 'PUBLIC_TO_EVERYONE', label: 'Everyone' },
]

interface Prefs {
  ytPrivacy: YouTubePrivacy
  igFeed: boolean
  ttMode: 'direct' | 'inbox'
  ttPrivacy: TikTokPrivacy
}
const PREFS_KEY = 'clipforge.publish.v1'
const DEFAULT_PREFS: Prefs = { ytPrivacy: 'private', igFeed: true, ttMode: 'direct', ttPrivacy: 'SELF_ONLY' }
function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function toLocalInput(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Publish one clip to YouTube, Instagram and TikTok from one place: directly
 * through the backend (now or scheduled), or by hand with the share sheet /
 * download when a platform is not connected.
 */
export function PublishModal({ clipId, onClose, onOpenAccounts }: { clipId: string; onClose: () => void; onOpenAccounts: () => void }) {
  const { clips, updateClip, mutateClip } = useStore()
  const clip = clips.find((c) => c.id === clipId)
  const backend = useBackend()
  const signedIn = isSignedIn(backend)
  const { info, loading: loadingConn, error: connError } = useConnections()
  const video = useClipVideo(clip)

  const [title, setTitle] = useState(clip?.title ?? '')
  const [caption, setCaption] = useState(() => (clip ? composeCaption(clip) : ''))
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs)
  const [picked, setPicked] = useState<Partial<Record<Platform, boolean>>>({})
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [whenAt, setWhenAt] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1, 0, 0, 0)
    return toLocalInput(d)
  })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<EnsureMediaStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  /** Platforms sent for immediate publishing from this dialog (drives the progress line). */
  const [sentNow, setSentNow] = useState<Platform[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [manualMsg, setManualMsg] = useState<string | null>(null)

  const setPrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch }
    setPrefsState(next)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  // Have the file in hand before any tap: phones only allow the share sheet to
  // open straight from a tap, with no waiting in between. Prefer an MP4 copy.
  const localId = clip?.localMediaId
  const remoteUrl = clip?.videoUrl
  const clipTitle = clip?.title ?? ''
  // The backend's MP4 copy only exists once conversion is done — which it must
  // be by the time any post has gone out. (A plain hosted URL is always fair game.)
  const remoteReady = !clip?.mediaId || clip.posts.some((p) => p.jobId && (p.status === 'published' || p.status === 'draft'))
  useEffect(() => {
    let live = true
    void (async () => {
      let blob = localId ? await getBlob(localId) : null
      if ((!blob || !/mp4|quicktime/i.test(blob.type)) && remoteReady && remoteUrl && /^https?:/.test(remoteUrl)) {
        try {
          const res = await fetch(remoteUrl)
          if (res.ok) {
            const remote = await res.blob()
            if (!blob || /mp4|quicktime/i.test(remote.type)) blob = remote
          }
        } catch {
          // Not downloadable from here (CORS / still converting): keep what we have.
        }
      }
      if (live) setFile(blob ? fileForClip(blob, clipTitle) : null)
    })()
    return () => {
      live = false
    }
  }, [localId, remoteUrl, clipTitle, remoteReady])

  const conn = info?.platforms
  /** This platform can be posted to automatically right now. */
  const apiReady = (p: Platform) => Boolean(signedIn && conn?.[p].configured && conn[p].connected)
  const postOf = (p: Platform): PlatformPost => clip?.posts.find((x) => x.platform === p) ?? { platform: p, status: 'not_posted' }
  /** Nothing is out or in flight for this platform, so it can be (re)sent. */
  const open = (p: Platform) => ['not_posted', 'failed'].includes(postOf(p).status)
  const selectable = (p: Platform) => open(p) && (apiReady(p) || when === 'later')
  const isPicked = (p: Platform) => selectable(p) && (picked[p] ?? apiReady(p))

  // TikTok grants "post directly" and "send drafts" separately: offer only what was granted.
  const ttScopes = conn?.tiktok.scopes
  const canDirect = !ttScopes || ttScopes.includes('video.publish')
  const canInbox = !ttScopes || ttScopes.includes('video.upload')
  const tiktokMode = (): Prefs['ttMode'] => (!canDirect ? 'inbox' : !canInbox ? 'direct' : prefs.ttMode)

  const chosen = PLATFORMS.filter(isPicked)
  const auto = chosen.filter(apiReady)
  const reminders = chosen.filter((p) => !apiReady(p))

  const hasVideoFile = Boolean(clip && (clip.localMediaId || clip.videoUrl || clip.mediaId))
  const needsRights = clip?.rights === 'unverified'
  const tooLong = Array.from(caption).length > LIMITS.caption

  const warnings = useMemo(() => {
    if (!clip) return []
    const w: string[] = []
    if (chosen.includes('instagram') && clip.durationSec < LIMITS.instagramMinSec) w.push('Instagram Reels must be at least 3 seconds long.')
    if (chosen.includes('youtube') && clip.durationSec > LIMITS.shortsMaxSec) w.push('Over 3 minutes: YouTube will list this as a regular video, not a Short.')
    if (chosen.includes('youtube') && clip.aspectRatio === '16:9') w.push('Landscape clips are not treated as Shorts on YouTube.')
    if (auto.length && info && !info.server.ffmpeg && file && !/mp4|mov/i.test(file.name)) {
      w.push('The backend has no ffmpeg, so this WebM clip cannot be converted to MP4 — Instagram will reject it.')
    }
    return w
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, chosen.join(','), auto.length, info, file])

  if (!clip) return null

  const setPost = (platform: Platform, next: PlatformPost) =>
    mutateClip(clip.id, (latest) => {
      const posts = latest.posts.map((p) => (p.platform === platform ? next : p))
      return { posts, status: deriveClipStatus(latest.status, posts) }
    })

  const targetFor = (p: Platform): PublishTarget => {
    if (p === 'youtube') return { platform: 'youtube', privacy: prefs.ytPrivacy }
    if (p === 'instagram') return { platform: 'instagram', shareToFeed: prefs.igFeed }
    return { platform: 'tiktok', mode: tiktokMode(), privacy: prefs.ttPrivacy }
  }

  const names = (list: Platform[]) => list.map((p) => PLATFORM_META[p].label).join(', ')
  // Where the posts sent from this dialog have got to.
  const going = sentNow.filter((p) => postOf(p).status === 'publishing')
  const landed = sentNow.filter((p) => ['published', 'draft'].includes(postOf(p).status))
  const nowLine = !sentNow.length ? null
    : going.length ? `Publishing to ${names(going)}… You can close this — it keeps going.`
      : landed.length === sentNow.length ? `Done — ${names(landed)} ${landed.length === 1 ? 'has' : 'all have'} it.`
        : landed.length ? `${names(landed)} done. See the note on the others.` : null

  const submit = async () => {
    setError(null)
    setSent(null)
    setSentNow([])
    let scheduledAt: string | undefined
    if (when === 'later') {
      const t = new Date(whenAt)
      if (Number.isNaN(t.getTime()) || t.getTime() < Date.now() + 30_000) return setError('Pick a time in the future.')
      scheduledAt = t.toISOString()
    }
    if (!title.trim() && chosen.includes('youtube')) return setError('YouTube needs a title.')
    setBusy(true)
    try {
      let jobs: Awaited<ReturnType<typeof submitPublish>>['jobs'] = []
      let media: { mediaId?: string; videoUrl?: string } = {}
      if (auto.length) {
        const r = await submitPublish(clip, backend, { title: title.trim(), caption: caption.trim(), targets: auto.map(targetFor), scheduledAt }, setProgress)
        jobs = r.jobs
        media = r.media
      }
      mutateClip(clip.id, (latest) => {
        const posts = latest.posts.map((post): PlatformPost => {
          const job = jobs.find((j) => j.platform === post.platform)
          if (job) return postFromJob(job, post)
          if (scheduledAt && reminders.includes(post.platform)) return { platform: post.platform, status: 'scheduled', scheduledAt }
          return post
        })
        return { ...media, posts, status: deriveClipStatus(latest.status, posts) }
      })
      setPicked({})
      setSentNow(scheduledAt ? [] : auto)
      setSent(
        [
          auto.length && scheduledAt && `Scheduled for ${fmtDateTime(scheduledAt)}: ${names(auto)}. It posts automatically while the backend is running.`,
          reminders.length && `Reminder set for ${names(reminders)} — you post those yourself.`,
        ].filter(Boolean).join(' ') || null,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publishing failed.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const startConnect = async (p: Platform) => {
    setError(null)
    try {
      window.location.assign(await connectUrl(backend.apiUrl, backend.token, p, window.location.origin + window.location.pathname))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the connection.')
    }
  }

  const cancelPost = async (post: PlatformPost) => {
    setError(null)
    try {
      if (post.jobId) await cancelJob(backend.apiUrl, backend.token, post.jobId)
      setPost(post.platform, { platform: post.platform, status: 'not_posted' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel that post.')
    }
  }

  const markPosted = (p: Platform) => {
    const url = prompt(`Mark as posted on ${PLATFORM_META[p].label}. Paste the link to the post (optional):`, '')
    if (url === null) return
    setPost(p, { platform: p, status: 'published', publishedAt: new Date().toISOString(), url: url.trim() || undefined })
  }

  const attachFile = async (f: File | undefined) => {
    if (!f) return
    const id = newMediaId()
    await putBlob(id, f)
    // A new file replaces whatever the backend had for this clip.
    updateClip(clip.id, { localMediaId: id, mediaId: undefined, videoUrl: undefined })
  }

  const share = async () => {
    if (!file) return
    void copyText(caption)
    const r = await shareFile(file, caption)
    setManualMsg(
      r === 'shared' ? 'Shared. The caption is on your clipboard — paste it in the app, then mark the post below once it is up.'
        : r === 'failed' ? 'This device would not open the share sheet for this file. Use Download instead.' : null,
    )
  }

  const statusText = progress
    ? progress.stage === 'uploading' ? `Uploading clip… ${Math.round((progress.fraction ?? 0) * 100)}%` : 'Checking the clip on the backend…'
    : 'Working…'
  const fileIsMp4 = file ? /\.(mp4|mov)$/i.test(file.name) : true

  const manualBox = (
      <div className={`manual-box ${signedIn ? '' : 'lead'}`}>
        <div className="field-label">Post it yourself</div>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
          Works without any setup: hand the clip to the platform’s own app or upload page, then mark it posted.
        </p>
        <div className="row wrap" style={{ gap: 8 }}>
          {canShareFile(file) && <button className="btn sm primary" onClick={() => void share()}>Share to an app…</button>}
          <button className="btn sm" disabled={!file} onClick={() => file && downloadFile(file)}>⬇ Download{file ? ` .${file.name.split('.').pop()}` : ''}</button>
          <button className="btn sm" onClick={() => void copyText(caption).then((ok) => setManualMsg(ok ? 'Caption copied.' : 'Could not copy — select the caption text above and copy it.'))}>Copy caption</button>
        </div>
        {!fileIsMp4 && (
          <div className="platform-note" style={{ marginTop: 8 }}>
            This copy is a WebM file. YouTube takes it, but Instagram and TikTok want MP4 — publish through the backend (it converts automatically) or export in a current Chrome or Safari.
          </div>
        )}
        {manualMsg && <div className="platform-note" style={{ marginTop: 8 }} role="status">{manualMsg}</div>}
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          {PLATFORMS.map((p) => (
            <span key={p} className="manual-target">
              <PlatformIcon platform={p} size={18} />
              <a href={UPLOAD_PAGES[p].url} target="_blank" rel="noreferrer" title={UPLOAD_PAGES[p].hint}>Open {PLATFORM_META[p].label} ↗</a>
              {open(p) && <button className="link-btn" onClick={() => markPosted(p)}>Mark posted</button>}
            </span>
          ))}
        </div>
      </div>
  )

  return (
    <div className="modal-scrim" onClick={busy ? undefined : onClose}>
      <div className="modal publish-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Publish clip">
        <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ marginBottom: 2 }}>Publish clip</h2>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              One clip, three platforms. {fmtDuration(clip.durationSec)} · {clip.aspectRatio}
              {clip.validated ? ' · validated ✓' : ' · not validated yet'}
            </p>
          </div>
          <button className="btn ghost sm" onClick={onClose} disabled={busy}>Close</button>
        </div>

        <div className="publish-grid">
          <div>
            <div className="publish-preview" style={{ aspectRatio: RATIO[clip.aspectRatio] }}>
              {video.src ? (
                <video src={video.src} controls playsInline poster={clip.thumb} />
              ) : (
                <div className="player-empty">
                  <div style={{ fontSize: 30, marginBottom: 6 }}>🎬</div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{video.loading ? 'Loading…' : 'No video on this clip yet'}</div>
                </div>
              )}
            </div>
            <label className="btn sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8, cursor: 'pointer' }}>
              {hasVideoFile ? '↻ Replace video file' : '⬆ Attach video file'}
              <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => void attachFile(e.target.files?.[0])} />
            </label>
            {!hasVideoFile && (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                Cut one in the Clip Editor, or attach a finished clip here.
              </div>
            )}
          </div>

          <div className="stack" style={{ gap: 14, minWidth: 0 }}>
            <div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label htmlFor="pub-title">Title <span className="muted" style={{ fontWeight: 400 }}>(YouTube)</span></label>
                <input id="pub-title" value={title} maxLength={LIMITS.youtubeTitle} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="pub-caption">
                  Caption &amp; hashtags{' '}
                  <span className="muted" style={{ fontWeight: 400, color: tooLong ? 'var(--critical)' : undefined }}>
                    ({Array.from(caption).length}/{LIMITS.caption})
                  </span>
                </label>
                <textarea id="pub-caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} />
              </div>
            </div>

            {!signedIn && manualBox}

            {needsRights && (
              <div className="callout">
                <strong>Confirm the rights first.</strong> This clip is marked “unverified”. Only publish footage you own, have licensed, or have permission to use.
                <div style={{ marginTop: 8 }}>
                  <select className="mini-select" value={clip.rights} onChange={(e) => updateClip(clip.id, { rights: e.target.value as Clip['rights'] })} aria-label="Rights">
                    <option value="unverified">Not verified yet</option>
                    <option value="owned">I own this content</option>
                    <option value="licensed">Licensed / stock</option>
                    <option value="permission">Creator gave permission</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <div className="row between" style={{ marginBottom: 8 }}>
                <div className="field-label" style={{ marginBottom: 0 }}>{signedIn ? 'Where' : 'Track & schedule'}</div>
                <div className="segmented" role="group" aria-label="When to post">
                  <button className={when === 'now' ? 'on' : ''} onClick={() => setWhen('now')}>Post now</button>
                  <button className={when === 'later' ? 'on' : ''} onClick={() => setWhen('later')}>Schedule</button>
                </div>
              </div>
              {when === 'later' && (
                <input type="datetime-local" className="mini-select" style={{ marginBottom: 8, width: '100%' }} value={whenAt}
                  min={toLocalInput(new Date())} onChange={(e) => setWhenAt(e.target.value)} aria-label="Post at" />
              )}

              <div className="stack" style={{ gap: 8 }}>
                {PLATFORMS.map((p) => {
                  const post = postOf(p)
                  const c = conn?.[p]
                  const ready = apiReady(p)
                  return (
                    <div key={p} className={`platform-row ${isPicked(p) ? 'picked' : ''}`}>
                      <div className="row between" style={{ gap: 8 }}>
                        <label className="row" style={{ gap: 9, minWidth: 0, cursor: selectable(p) ? 'pointer' : 'default' }}>
                          <input type="checkbox" checked={isPicked(p)} disabled={!selectable(p) || busy}
                            onChange={(e) => setPicked((s) => ({ ...s, [p]: e.target.checked }))} aria-label={PLATFORM_META[p].label} />
                          <PlatformIcon platform={p} />
                          <span style={{ fontWeight: 650, fontSize: 14 }}>{PLATFORM_META[p].label}</span>
                          {ready && c?.account && <span className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.account}</span>}
                        </label>
                        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                          {post.status !== 'not_posted' && <PostBadge post={post} />}
                          {!open(p) ? null : ready ? null : !signedIn ? (
                            <span className="badge">by hand</span>
                          ) : loadingConn && !c ? (
                            <span className="badge">checking…</span>
                          ) : c && !c.configured ? (
                            <button className="btn sm" onClick={onOpenAccounts} title={c.setup}>Set up</button>
                          ) : c ? (
                            <button className="btn sm" onClick={() => void startConnect(p)}>Connect</button>
                          ) : null}
                        </div>
                      </div>

                      {isPicked(p) && ready && (
                        <div className="row wrap platform-opts">
                          {p === 'youtube' && (
                            <label>Visibility
                              <select className="mini-select" value={prefs.ytPrivacy} onChange={(e) => setPrefs({ ytPrivacy: e.target.value as YouTubePrivacy })}>
                                <option value="private">Private</option>
                                <option value="unlisted">Unlisted</option>
                                <option value="public">Public</option>
                              </select>
                            </label>
                          )}
                          {p === 'instagram' && (
                            <label className="row" style={{ gap: 6 }}>
                              <input type="checkbox" checked={prefs.igFeed} onChange={(e) => setPrefs({ igFeed: e.target.checked })} />
                              Also show on my profile grid
                            </label>
                          )}
                          {p === 'tiktok' && (
                            <>
                              <label>How
                                <select className="mini-select" value={tiktokMode()} onChange={(e) => setPrefs({ ttMode: e.target.value as Prefs['ttMode'] })}>
                                  {canDirect && <option value="direct">Post directly</option>}
                                  {canInbox && <option value="inbox">Send to TikTok drafts</option>}
                                </select>
                              </label>
                              {tiktokMode() === 'direct' && (
                                <label>Who can watch
                                  <select className="mini-select" value={prefs.ttPrivacy} onChange={(e) => setPrefs({ ttPrivacy: e.target.value as TikTokPrivacy })}>
                                    {TIKTOK_PRIVACY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                </label>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {isPicked(p) && !ready && <div className="platform-note">Reminder only — you post this one yourself at that time.</div>}
                      {open(p) && !ready && when === 'now' && signedIn && c && (
                        <div className="platform-note">
                          {c.configured ? 'Connect your account to post here automatically.' : 'This backend has no app credentials for this platform yet.'}
                        </div>
                      )}

                      {post.status === 'publishing' && <div className="platform-note busy">{post.note || 'Publishing'}…</div>}
                      {post.status === 'failed' && (
                        <div className="platform-note bad">
                          {post.error}{' '}
                          <button className="link-btn" onClick={() => setPost(p, { platform: p, status: 'not_posted' })}>Dismiss</button>
                        </div>
                      )}
                      {post.status === 'scheduled' && (
                        <div className="platform-note">
                          {fmtDateTime(post.scheduledAt)} · {post.jobId ? 'posts automatically' : 'you post it yourself'}{' '}
                          <button className="link-btn" onClick={() => void cancelPost(post)}>{post.jobId ? 'Cancel' : 'Remove'}</button>
                          {!post.jobId && <> · <button className="link-btn" onClick={() => markPosted(p)}>Mark as posted</button></>}
                        </div>
                      )}
                      {(post.status === 'published' || post.status === 'draft') && (
                        <div className="platform-note">
                          {post.url ? <a href={post.url} target="_blank" rel="noreferrer">Open the post ↗</a> : post.status === 'draft' ? 'Finish it in the TikTok app.' : 'Posted.'}
                          {post.note && <> · {post.note}</>}{' '}
                          <button className="link-btn" onClick={() => confirm(`Clear this and post to ${PLATFORM_META[p].label} again?`) && setPost(p, { platform: p, status: 'not_posted' })}>Post again</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {!signedIn && (
                <div className="platform-note">
                  Automatic posting is off (no backend connected). Post with the buttons above, then tick it off here — or pick Schedule to set yourself a reminder.
                </div>
              )}
              {connError && <div className="callout" style={{ marginTop: 8 }}>{connError}</div>}
            </div>

            {warnings.map((w) => <div key={w} className="callout">{w}</div>)}
            {error && <div className="callout" role="alert">{error}</div>}
            {sent && <div className="callout info" role="status">{sent}</div>}
            {nowLine && <div className="callout info" role="status">{nowLine}</div>}

            <div className="row wrap" style={{ gap: 10 }}>
              <button className="btn primary" onClick={() => void submit()}
                disabled={busy || chosen.length === 0 || needsRights || tooLong || (auto.length > 0 && !hasVideoFile)}
                title={needsRights ? 'Confirm the rights first' : auto.length > 0 && !hasVideoFile ? 'Attach a video first' : ''}>
                {busy ? statusText
                  : when === 'later' ? (chosen.length ? `Schedule ${chosen.length} post${chosen.length === 1 ? '' : 's'}` : 'Schedule')
                    : chosen.length ? `Publish to ${chosen.length} platform${chosen.length === 1 ? '' : 's'}` : 'Publish'}
              </button>
              {!signedIn && <button className="btn" onClick={onOpenAccounts}>Set up automatic posting</button>}
            </div>

            {signedIn && manualBox}
          </div>
        </div>
      </div>
    </div>
  )
}
