import type { Clip, ClipStatus, Platform } from './types'
import { PLATFORMS, PLATFORM_META } from './data'

export const CLIP_STATUSES: ClipStatus[] = ['idea', 'editing', 'ready', 'scheduled', 'published']

export interface Overview {
  total: number
  validated: number
  /** Ready/edited but not yet validated and not yet published. */
  needsValidation: number
  scheduledPosts: number
  publishedPosts: number
  withVideo: number
}

export function overview(clips: Clip[]): Overview {
  let validated = 0
  let needsValidation = 0
  let scheduledPosts = 0
  let publishedPosts = 0
  let withVideo = 0
  for (const c of clips) {
    if (c.validated) validated++
    else if (c.status !== 'published') needsValidation++
    if (c.videoUrl) withVideo++
    for (const p of c.posts) {
      if (p.status === 'scheduled') scheduledPosts++
      if (p.status === 'published') publishedPosts++
    }
  }
  return { total: clips.length, validated, needsValidation, scheduledPosts, publishedPosts, withVideo }
}

/** Count of clips in each pipeline stage — real workflow composition, not a metric. */
export function statusCounts(clips: Clip[]): { status: ClipStatus; count: number }[] {
  return CLIP_STATUSES.map((status) => ({
    status,
    count: clips.filter((c) => c.status === status).length,
  }))
}

/** How many posts sit at each stage per platform. */
export function platformCounts(clips: Clip[]) {
  return PLATFORMS.map((platform: Platform) => {
    let scheduled = 0
    let published = 0
    for (const c of clips) {
      for (const p of c.posts) {
        if (p.platform !== platform) continue
        if (p.status === 'scheduled') scheduled++
        if (p.status === 'published') published++
      }
    }
    return {
      platform,
      label: PLATFORM_META[platform].label,
      color: PLATFORM_META[platform].color,
      scheduled,
      published,
    }
  })
}
