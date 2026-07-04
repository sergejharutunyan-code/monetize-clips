import type { SourceVideo } from './types'
import { uid } from './data'

/**
 * A small set of example long-form videos to workshop into clips.
 *
 * These are illustrative starting points, not live data or real metrics — the
 * point of Discover is to feed the AI workshop. Paste your own video via the
 * Discover UI to work on real material. When a live source is wired in later
 * (YouTube Data API, a trends provider, your own watchlist), it replaces this
 * function and nothing downstream changes.
 */
export function seedDiscovery(): SourceVideo[] {
  const raw: Omit<SourceVideo, 'id'>[] = [
    {
      title: 'He turned down $50M — then explained why in one sentence',
      creator: 'Founder Fireside',
      origin: 'youtube',
      niche: 'Podcast',
      why: 'Big number + counterintuitive decision; a natural cliffhanger.',
      thumbGlyph: '🎙️',
    },
    {
      title: 'Full-court buzzer beater to win the championship',
      creator: 'City League',
      origin: 'youtube',
      niche: 'Sports',
      why: 'Peak sports moment, universally shareable, clean payoff.',
      thumbGlyph: '🏀',
    },
    {
      title: 'The productivity system that sounds fake but works',
      creator: 'DeepWork Daily',
      origin: 'youtube',
      niche: 'Motivation',
      why: 'Actionable + skeptical hook; strong save/share potential.',
      thumbGlyph: '⏱️',
    },
    {
      title: 'This $9 kitchen gadget broke the internet',
      creator: 'Gadget Shelf',
      origin: 'youtube',
      niche: 'Tech',
      why: 'Cheap, visual, oddly satisfying — easy to package natively.',
      thumbGlyph: '🍳',
    },
    {
      title: '1v5 clutch that made the caster lose it',
      creator: 'Ranked Replays',
      origin: 'youtube',
      niche: 'Gaming',
      why: 'High tension + loud reaction; built-in cliffhanger.',
      thumbGlyph: '🎮',
    },
    {
      title: 'Why your savings account is quietly losing you money',
      creator: 'Money Mechanics',
      origin: 'youtube',
      niche: 'Finance',
      why: 'Fear + fix framing; performs on every platform.',
      thumbGlyph: '💸',
    },
  ]

  return raw.map((r) => ({ ...r, id: uid() }))
}
