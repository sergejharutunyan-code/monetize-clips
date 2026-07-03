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
  /** Links clips cut from the same source as a two-part series. */
  series?: { id: string; part: 1 | 2; total: number }
}

/** A trending long-form video surfaced in Discovery, a candidate to clip. */
export interface SourceVideo {
  id: string
  title: string
  creator: string
  origin: Platform
  url?: string
  niche: string
  views: number
  ageHours: number
  /** 0–100 heuristic combining velocity, recency, and engagement. */
  viralScore: number
  /** Short human note on why it's trending. */
  why: string
  thumbGlyph: string
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
