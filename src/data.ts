import type { Platform } from './types'

export const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube']

export const PLATFORM_META: Record<Platform, { label: string; color: string; glyph: string; note: string }> = {
  tiktok: {
    label: 'TikTok',
    color: '#e34948',
    glyph: '♪',
    note: 'Creator Rewards pays for original videos over 1 minute.',
  },
  instagram: {
    label: 'Instagram',
    color: '#e87ba4',
    glyph: '⬛',
    note: 'Reels bonuses vary by region and are invite-only.',
  },
  youtube: {
    label: 'YouTube',
    color: '#eb6834',
    glyph: '▶',
    note: 'Shorts ad revenue share once in the Partner Program.',
  },
}

export const NICHES = [
  'Everyday life',
  'Food & cooking',
  'Tech',
  'Science',
  'Money',
  'Wellness',
  'Pets',
  'Travel',
  'Work & school',
  'Pop culture',
] as const

let idCounter = 0
export const uid = (prefix = 'clip') => `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`
