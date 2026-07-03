export type Platform = 'tiktok' | 'instagram' | 'youtube'

export type ClipStatus = 'idea' | 'editing' | 'ready' | 'scheduled' | 'published'

export type PostStatus = 'not_posted' | 'scheduled' | 'published'

export type AspectRatio = '9:16' | '1:1' | '16:9'

/** A single clip's presence on one platform. */
export interface PlatformPost {
  platform: Platform
  status: PostStatus
  scheduledAt?: string // ISO datetime
  publishedAt?: string // ISO datetime
  url?: string
  views: number
  likes: number
  comments: number
  shares: number
  /** Estimated payout in USD, derived from views × platform RPM. */
  revenue: number
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
}
