export type Platform = 'tiktok' | 'instagram' | 'youtube'

export type ClipStatus = 'idea' | 'editing' | 'ready' | 'scheduled' | 'published'

/**
 * Where one clip stands on one platform.
 * - scheduled:  queued for a time (auto-posted by the backend, or a reminder to post by hand)
 * - publishing: the backend is uploading it right now
 * - published:  live on the platform
 * - draft:      delivered to the platform but not live yet (e.g. TikTok inbox draft)
 * - failed:     the last attempt did not go through (see `error`)
 */
export type PostStatus = 'not_posted' | 'scheduled' | 'publishing' | 'published' | 'draft' | 'failed'

export type AspectRatio = '9:16' | '1:1' | '16:9'

/** A single clip's presence on one platform. */
export interface PlatformPost {
  platform: Platform
  status: PostStatus
  scheduledAt?: string // ISO datetime
  publishedAt?: string // ISO datetime
  /** Link to the live post, once published. */
  url?: string
  /** The backend publish job behind this post. Absent for posts made by hand. */
  jobId?: string
  /** Live progress while publishing, or a note from the platform afterwards. */
  note?: string
  /** Why the last attempt failed. */
  error?: string
}

/** A short clip cut from a source video, tracked through the pipeline. */
export interface Clip {
  id: string
  title: string
  /** The original long-form video this was cut from. */
  sourceTitle: string
  sourceCreator: string
  /** Whether the source is licensed / owned / cleared for reuse. */
  rights: 'owned' | 'licensed' | 'permission' | 'unverified'
  /** Opening hook line — the first 1-3 seconds that stop the scroll. */
  hook: string
  caption: string
  hashtags: string[]
  niche: string
  durationSec: number
  aspectRatio: AspectRatio
  status: ClipStatus
  createdAt: string // ISO date
  posts: PlatformPost[]
  /** The rendered clip as a hosted URL (your own link, or this clip on the backend). */
  videoUrl?: string
  /** The rendered clip saved in this browser (IndexedDB key) — survives reloads on this device. */
  localMediaId?: string
  /** The rendered clip stored on the backend, ready to publish. */
  mediaId?: string
  /** Small poster frame (JPEG data URL). */
  thumb?: string
  /** Whether the clip has been watched and passed review in the player. */
  validated?: boolean
  validatedAt?: string // ISO datetime
  /** Links clips cut from the same source as a two-part series. */
  series?: { id: string; part: 1 | 2; total: number }
}

/** A long-form video surfaced in Discovery, a candidate to clip. */
export interface SourceVideo {
  id: string
  title: string
  creator: string
  origin: Platform
  url?: string
  niche: string
  /** Short human note on why it could clip well. */
  why: string
  thumbGlyph: string
  /** Real thumbnail URL, when the source provides one (e.g. YouTube). */
  thumbUrl?: string
  /** Real view count from a live source. Undefined for examples. */
  views?: number
  /** ISO publish date from a live source. Undefined for examples. */
  publishedAt?: string
}

/** One half of an AI-generated two-part clip concept. */
export interface ConceptPart {
  label: string
  /** The premise in broad strokes, one line. */
  premiseShort: string
  /** The premise expanded, 2–3 sentences. */
  premiseBroad: string
  /** On-screen opening hook (first 1–3s). */
  hook: string
  caption: string
  hashtags: string[]
  /** Suggested source segment to cut, e.g. "0:00–0:18". */
  clipWindow: string
}

/** AI breakdown of a source video into a two-part clip series. */
export interface TwoPartConcept {
  sourceTitle: string
  sourceCreator: string
  niche: string
  /** Why this moment travels — the viral angle. */
  angle: string
  part1: ConceptPart
  part2: ConceptPart
  /** Which engine produced this — for transparency in the UI. */
  provider: 'local' | 'claude'
}
