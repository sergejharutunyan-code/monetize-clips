import type { Clip, Platform } from './types'
import { PLATFORMS, PLATFORM_META } from './data'

export interface Totals {
  clips: number
  published: number
  scheduled: number
  views: number
  revenue: number
  engagement: number
}

export function totals(clips: Clip[]): Totals {
  let published = 0
  let scheduled = 0
  let views = 0
  let revenue = 0
  let interactions = 0
  for (const c of clips) {
    for (const p of c.posts) {
      if (p.status === 'published') published++
      if (p.status === 'scheduled') scheduled++
      views += p.views
      revenue += p.revenue
      interactions += p.likes + p.comments + p.shares
    }
  }
  return {
    clips: clips.length,
    published,
    scheduled,
    views,
    revenue: Math.round(revenue * 100) / 100,
    engagement: views > 0 ? Math.round((interactions / views) * 1000) / 10 : 0,
  }
}

export function byPlatform(clips: Clip[]) {
  return PLATFORMS.map((platform: Platform) => {
    let views = 0
    let revenue = 0
    let posts = 0
    for (const c of clips) {
      for (const p of c.posts) {
        if (p.platform === platform && p.status === 'published') {
          views += p.views
          revenue += p.revenue
          posts++
        }
      }
    }
    return {
      platform,
      label: PLATFORM_META[platform].label,
      color: PLATFORM_META[platform].color,
      views,
      revenue: Math.round(revenue * 100) / 100,
      posts,
    }
  })
}

export interface ClipRollup {
  clip: Clip
  views: number
  revenue: number
}

export function clipRollup(clips: Clip[]): ClipRollup[] {
  return clips
    .map((clip) => {
      let views = 0
      let revenue = 0
      for (const p of clip.posts) {
        views += p.views
        revenue += p.revenue
      }
      return { clip, views, revenue: Math.round(revenue * 100) / 100 }
    })
    .sort((a, b) => b.views - a.views)
}

/** Revenue attributed across the last `days` days by publish date. */
export function revenueTrend(clips: Clip[], days = 14) {
  const buckets: { label: string; value: number }[] = []
  const now = new Date()
  const map = new Map<string, number>()
  for (const c of clips) {
    for (const p of c.posts) {
      if (p.status === 'published' && p.publishedAt) {
        const key = new Date(p.publishedAt).toISOString().slice(0, 10)
        map.set(key, (map.get(key) ?? 0) + p.revenue)
      }
    }
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    buckets.push({
      label: d.toLocaleDateString(undefined, { day: 'numeric' }),
      value: Math.round((map.get(key) ?? 0) * 100) / 100,
    })
  }
  return buckets
}
