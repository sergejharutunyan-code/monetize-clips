import type { SourceVideo } from './types'
import { uid } from './data'

/**
 * A curated feed of "trending" long-form videos to workshop into clips.
 *
 * This is a stand-in for a live discovery source. It's shaped exactly like what
 * a real integration would return (YouTube Data API, a trends provider, or your
 * own watchlist), so swapping in real data later means replacing this function —
 * nothing downstream changes. Users can also paste any video via the Discover UI.
 */
export function seedDiscovery(): SourceVideo[] {
  const raw: Omit<SourceVideo, 'id' | 'viralScore'>[] = [
    {
      title: 'He turned down $50M — then explained why in one sentence',
      creator: 'Founder Fireside',
      origin: 'youtube',
      niche: 'Podcast',
      views: 3_400_000,
      ageHours: 30,
      why: 'Big number + counterintuitive decision; comment section is arguing.',
      thumbGlyph: '🎙️',
    },
    {
      title: 'Full-court buzzer beater to win the championship',
      creator: 'City League',
      origin: 'youtube',
      niche: 'Sports',
      views: 1_900_000,
      ageHours: 14,
      why: 'Peak sports moment, universally shareable, clean 15s payoff.',
      thumbGlyph: '🏀',
    },
    {
      title: 'The productivity system that sounds fake but works',
      creator: 'DeepWork Daily',
      origin: 'youtube',
      niche: 'Motivation',
      views: 820_000,
      ageHours: 46,
      why: 'Actionable + skeptical hook; strong save/share ratio.',
      thumbGlyph: '⏱️',
    },
    {
      title: 'This $9 kitchen gadget broke the internet',
      creator: 'Gadget Shelf',
      origin: 'youtube',
      niche: 'Tech',
      views: 2_100_000,
      ageHours: 20,
      why: 'Cheap, visual, oddly satisfying — classic repost bait done right.',
      thumbGlyph: '🍳',
    },
    {
      title: '1v5 clutch that made the caster lose it',
      creator: 'Ranked Replays',
      origin: 'youtube',
      niche: 'Gaming',
      views: 1_250_000,
      ageHours: 9,
      why: 'High tension + loud reaction; built-in cliffhanger.',
      thumbGlyph: '🎮',
    },
    {
      title: 'Why your savings account is quietly losing you money',
      creator: 'Money Mechanics',
      origin: 'youtube',
      niche: 'Finance',
      views: 640_000,
      ageHours: 52,
      why: 'Fear + fix framing; performs on every platform.',
      thumbGlyph: '💸',
    },
  ]

  return raw.map((r) => ({
    ...r,
    id: uid(),
    viralScore: scoreVideo(r.views, r.ageHours),
  }))
}

/** Simple velocity heuristic: views per hour, log-scaled to 0–100. */
export function scoreVideo(views: number, ageHours: number): number {
  const perHour = views / Math.max(1, ageHours)
  // ~50k views/hr → ~100. Log keeps small channels on the scale too.
  const score = (Math.log10(perHour + 1) / Math.log10(50_000)) * 100
  return Math.max(1, Math.min(100, Math.round(score)))
}
