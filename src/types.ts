import type { FormatId, Plot, PromptPart, Trend } from '../shared/studio.mjs'

export type { FormatId, Plot, PromptPart, Scene, StylePreset, Trend, TrendSource } from '../shared/studio.mjs'

export type Platform = 'tiktok' | 'instagram' | 'youtube'

/**
 * Where a video is in the pipeline.
 * idea → scripted (plot written) → generating (Higgsfield) → editing (assembling)
 * → ready (final cut exists) → scheduled → published
 */
export type ClipStatus = 'idea' | 'scripted' | 'generating' | 'editing' | 'ready' | 'scheduled' | 'published'

/**
 * Where one video stands on one platform.
 * - scheduled:  queued for a time (auto-posted by the backend, or a reminder to post by hand)
 * - publishing: the backend is uploading it right now
 * - published:  live on the platform
 * - draft:      delivered to the platform but not live yet (e.g. TikTok inbox draft)
 * - failed:     the last attempt did not go through (see `error`)
 */
export type PostStatus = 'not_posted' | 'scheduled' | 'publishing' | 'published' | 'draft' | 'failed'

export type AspectRatio = '9:16' | '1:1' | '16:9'

/** A single video's presence on one platform. */
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

/** How the plot was cut into Higgsfield generations. */
export interface GenerationPlan {
  maxSeconds: number
  narration: 'voiceover' | 'model'
  model: string
  resolution: '480p' | '720p' | '1080p'
  parts: PromptPart[]
}

export type RenderStatus = 'queued' | 'submitted' | 'in_progress' | 'downloading' | 'completed' | 'failed' | 'canceled'

/** One generated (or uploaded) piece of the video, in order. */
export interface Segment {
  id: string
  partIndex?: number
  /** Backend render job (Higgsfield API). */
  renderId?: string
  renderStatus?: RenderStatus
  renderNote?: string
  /** File saved in this browser (an upload). */
  localMediaId?: string
  /** A playable URL (a finished render on the backend). */
  url?: string
  /** Seconds of the clip to use. */
  inSec?: number
  outSec?: number
  /** Full length of the source clip, once known. */
  duration?: number
  name?: string
}

/** A video project: the trend, the plot, the generated pieces and the final cut. */
export interface Clip {
  id: string
  title: string
  status: ClipStatus
  createdAt: string
  hook: string
  caption: string
  hashtags: string[]
  durationSec: number
  aspectRatio: AspectRatio
  posts: PlatformPost[]

  /** What the video is about. */
  trend?: Trend
  format?: FormatId
  styleId?: string
  plot?: Plot
  generation?: GenerationPlan
  segments?: Segment[]
  /** Recorded or uploaded narration (saved in this browser). */
  voiceoverId?: string

  /** The final cut as a hosted URL (your own link, or this video on the backend). */
  videoUrl?: string
  /** The final cut saved in this browser (IndexedDB key) — survives reloads on this device. */
  localMediaId?: string
  /** The final cut stored on the backend, ready to publish. */
  mediaId?: string
  /** Small poster frame (JPEG data URL). */
  thumb?: string
  /** Watched and passed the review checklist. */
  validated?: boolean
  validatedAt?: string
}
