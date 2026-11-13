import type { Clip, ClipStatus, Platform, PlatformPost } from './types'
import { PLATFORMS } from './data'
import { clipBlob } from './media'
import {
  absoluteUrl, ApiError, createPublish, getMedia, uploadMedia,
  type BackendSettings, type PublishJob, type PublishTarget,
} from './backend/api'

/** The text that goes under the video: caption (or hook) plus hashtags. */
export function composeCaption(clip: Pick<Clip, 'caption' | 'hook' | 'hashtags'>): string {
  const text = (clip.caption || clip.hook || '').trim()
  const missing = clip.hashtags.filter((h) => !text.toLowerCase().includes(h.toLowerCase()))
  return [text, missing.join(' ')].filter(Boolean).join('\n\n')
}

/** Platform limits worth checking before sending. */
export const LIMITS = {
  youtubeTitle: 100,
  caption: 2200,
  instagramMinSec: 3,
  shortsMaxSec: 180,
}

/** Make sure every platform has an entry (older saved clips may be missing some). */
export function normalizePosts(posts: PlatformPost[] | undefined): PlatformPost[] {
  return PLATFORMS.map((platform) => posts?.find((p) => p.platform === platform) ?? { platform, status: 'not_posted' })
}

/** The pipeline stage a clip is in, given where its posts stand. */
export function deriveClipStatus(current: ClipStatus, posts: PlatformPost[]): ClipStatus {
  if (posts.some((p) => p.status === 'published')) return 'published'
  if (posts.some((p) => p.status === 'scheduled' || p.status === 'publishing' || p.status === 'draft')) return 'scheduled'
  // Nothing out and nothing queued: a clip that had been moved along drops back to ready.
  return current === 'published' || current === 'scheduled' ? 'ready' : current
}

/** Translate a backend job into the post state shown in the app. */
export function postFromJob(job: PublishJob, prev: PlatformPost): PlatformPost {
  const base: PlatformPost = { platform: prev.platform, status: 'not_posted', jobId: job.id }
  switch (job.status) {
    case 'queued': {
      const waiting = new Date(job.runAt).getTime() - Date.now() > 15_000
      return waiting
        ? { ...base, status: 'scheduled', scheduledAt: job.runAt }
        : { ...base, status: 'publishing', note: job.progress || 'Waiting to start' }
    }
    case 'running':
      return { ...base, status: 'publishing', note: job.progress || 'Publishing' }
    case 'published':
      return { ...base, status: job.draft ? 'draft' : 'published', publishedAt: job.updatedAt, url: job.url, note: job.note }
    case 'failed':
      return { ...base, status: 'failed', error: job.error || 'Publishing failed.' }
    default:
      return { platform: prev.platform, status: 'not_posted' }
  }
}

const samePost = (a: PlatformPost, b: PlatformPost) =>
  a.status === b.status && a.jobId === b.jobId && a.url === b.url && a.note === b.note && a.error === b.error &&
  a.scheduledAt === b.scheduledAt

/**
 * Fold fresh job states into a clip. Returns the fields to update, or null when
 * nothing changed. `missing` lists job ids the backend no longer knows about.
 */
export function applyJobs(clip: Clip, jobs: PublishJob[], missing: Set<string> = new Set()): Partial<Clip> | null {
  let changed = false
  const posts = clip.posts.map((post) => {
    if (!post.jobId) return post
    const job = jobs.find((j) => j.id === post.jobId)
    let next = post
    if (job) next = postFromJob(job, post)
    else if (missing.has(post.jobId) && (post.status === 'publishing' || post.status === 'scheduled')) {
      next = { platform: post.platform, status: 'failed', error: 'The backend no longer has this post (its data may have been reset). Publish it again.' }
    }
    if (!samePost(next, post)) changed = true
    // Keep the original publish time rather than restamping it on every poll.
    return next.status === 'published' && post.status === 'published' ? { ...next, publishedAt: post.publishedAt } : next
  })
  if (!changed) return null
  return { posts, status: deriveClipStatus(clip.status, posts) }
}

/** Posts the backend is still responsible for (worth polling). */
export const activeJobIds = (clips: Clip[]) =>
  clips.flatMap((c) => c.posts.filter((p) => p.jobId && (p.status === 'publishing' || p.status === 'scheduled')).map((p) => p.jobId!))

export interface EnsureMediaStatus {
  stage: 'checking' | 'uploading'
  fraction?: number
}

/**
 * Get the clip's video onto the backend (uploading it if it is not there yet)
 * and return the fields to save on the clip.
 */
export async function ensureServerMedia(
  clip: Clip,
  backend: BackendSettings,
  onStatus?: (s: EnsureMediaStatus) => void,
): Promise<{ mediaId: string; videoUrl?: string }> {
  if (clip.mediaId) {
    onStatus?.({ stage: 'checking' })
    try {
      const m = await getMedia(backend.apiUrl, backend.token, clip.mediaId)
      if (m.status !== 'failed') return { mediaId: m.id, videoUrl: m.url ? absoluteUrl(backend.apiUrl, m.url) : clip.videoUrl }
    } catch (e) {
      // 404: the backend lost it (e.g. its storage was reset) — upload again below.
      if (!(e instanceof ApiError) || e.status !== 404) throw e
    }
  }
  const blob = await clipBlob(clip)
  if (!blob) {
    throw new Error(
      clip.videoUrl
        ? 'Could not download this clip’s video from its URL. Attach the video file to the clip instead.'
        : 'This clip has no video yet. Export one in the Clip Editor, or attach a video file.',
    )
  }
  onStatus?.({ stage: 'uploading', fraction: 0 })
  const m = await uploadMedia(backend.apiUrl, backend.token, blob, (fraction) => onStatus?.({ stage: 'uploading', fraction }))
  return { mediaId: m.id, videoUrl: m.url ? absoluteUrl(backend.apiUrl, m.url) : clip.videoUrl }
}

/** Send a clip to the backend to publish (now or at `scheduledAt`) and return the jobs. */
export async function submitPublish(
  clip: Clip,
  backend: BackendSettings,
  req: { title: string; caption: string; targets: PublishTarget[]; scheduledAt?: string },
  onStatus?: (s: EnsureMediaStatus) => void,
): Promise<{ jobs: PublishJob[]; media: { mediaId: string; videoUrl?: string } }> {
  const media = await ensureServerMedia(clip, backend, onStatus)
  const jobs = await createPublish(backend.apiUrl, backend.token, {
    mediaId: media.mediaId,
    clipId: clip.id,
    title: req.title,
    caption: req.caption,
    tags: clip.hashtags,
    scheduledAt: req.scheduledAt,
    targets: req.targets,
  })
  return { jobs, media }
}

// ---- posting by hand (no API access needed) ----

/** Where each platform's own upload screen lives. */
export const UPLOAD_PAGES: Record<Platform, { url: string; hint: string }> = {
  youtube: { url: 'https://www.youtube.com/upload', hint: 'Opens YouTube Studio’s upload screen.' },
  instagram: { url: 'https://www.instagram.com/', hint: 'On instagram.com press Create (+), or use the Instagram app.' },
  tiktok: { url: 'https://www.tiktok.com/tiktokstudio/upload', hint: 'Opens TikTok’s upload screen.' },
}

const safeName = (title: string) => (title.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'clip')

export function fileForClip(blob: Blob, title: string): File {
  const mp4 = /mp4/i.test(blob.type)
  return new File([blob], `${safeName(title)}.${mp4 ? 'mp4' : /quicktime/i.test(blob.type) ? 'mov' : 'webm'}`, {
    type: (blob.type || 'video/mp4').split(';')[0],
  })
}

/** True when this device can hand a video file to other apps (phones, mostly). */
export function canShareFile(file: File | null): boolean {
  if (!file || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/** Open the device share sheet with the clip attached. Call directly from a tap. */
export async function shareFile(file: File, text: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share({ files: [file], text })
    return 'shared'
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
