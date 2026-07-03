import type { Clip, Platform } from './types'

export const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube']

export const PLATFORM_META: Record<
  Platform,
  { label: string; color: string; glyph: string; rpm: number; note: string }
> = {
  // rpm = estimated USD earned per 1,000 monetized views. Real payouts vary
  // widely by niche, geography, and program eligibility — these are planning
  // defaults you can tune per account.
  tiktok: {
    label: 'TikTok',
    color: '#e34948',
    glyph: '♪',
    rpm: 0.55,
    note: 'Creator Rewards (video > 1 min, original, > 10k followers).',
  },
  instagram: {
    label: 'Instagram',
    color: '#e87ba4',
    glyph: '⬛',
    rpm: 0.35,
    note: 'Reels play bonuses vary by region and invite-only programs.',
  },
  youtube: {
    label: 'YouTube',
    color: '#eb6834',
    glyph: '▶',
    rpm: 1.2,
    note: 'Shorts ad revenue share once in the Partner Program.',
  },
}

export const NICHES = [
  'Comedy',
  'Sports',
  'Motivation',
  'Gaming',
  'Finance',
  'Food',
  'Tech',
  'Podcast',
  'Music',
  'Educational',
] as const

/** Hook formulas keyed by intent — proven scroll-stoppers for the first 3s. */
export const HOOK_FORMULAS: { label: string; template: string }[] = [
  { label: 'Curiosity gap', template: 'You won’t believe what happens when {subject}…' },
  { label: 'Bold claim', template: 'This is the most {adjective} {topic} moment ever.' },
  { label: 'Question', template: 'Ever wonder why {subject} {action}?' },
  { label: 'Callout', template: 'POV: you just found the clip everyone’s talking about.' },
  { label: 'Stakes', template: 'Watch till the end — {subject} did NOT see this coming.' },
  { label: 'Listicle', template: '3 reasons {subject} went viral overnight.' },
]

/** Hashtag banks per niche, plus an always-on discovery set. */
export const HASHTAG_BANK: Record<string, string[]> = {
  base: ['#fyp', '#viral', '#trending', '#foryou', '#reels', '#shorts'],
  Comedy: ['#funny', '#comedy', '#lol', '#humor', '#meme'],
  Sports: ['#sports', '#highlights', '#gameday', '#athlete', '#clutch'],
  Motivation: ['#motivation', '#mindset', '#discipline', '#success', '#grind'],
  Gaming: ['#gaming', '#gamer', '#twitch', '#clips', '#esports'],
  Finance: ['#finance', '#money', '#investing', '#stocks', '#wealth'],
  Food: ['#food', '#recipe', '#cooking', '#foodie', '#asmr'],
  Tech: ['#tech', '#gadgets', '#ai', '#innovation', '#techtok'],
  Podcast: ['#podcast', '#podcastclips', '#interview', '#deepdive'],
  Music: ['#music', '#newmusic', '#songcover', '#producer', '#beats'],
  Educational: ['#learnontiktok', '#education', '#didyouknow', '#facts'],
}

let idCounter = 0
export const uid = () => `clip_${Date.now().toString(36)}_${(idCounter++).toString(36)}`

const daysFromNow = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

/** Estimated payout for a view count on a platform. */
export const estimateRevenue = (platform: Platform, views: number) =>
  Math.round((views / 1000) * PLATFORM_META[platform].rpm * 100) / 100

export function seedClips(): Clip[] {
  const raw: Array<Partial<Clip> & { views: [number, number, number] }> = [
    {
      title: 'The 4-word line that broke the internet',
      sourceTitle: 'Founder Fireside — Ep. 212',
      sourceCreator: 'StartupStage',
      rights: 'permission',
      hook: 'He said 4 words and the whole room went silent.',
      niche: 'Podcast',
      durationSec: 47,
      status: 'published',
      views: [1_240_000, 420_000, 88_000],
    },
    {
      title: 'Buzzer-beater from half court',
      sourceTitle: 'City League Finals 2026',
      sourceCreator: 'HoopVault',
      rights: 'licensed',
      hook: 'Down by 2, 1.9 seconds left…',
      niche: 'Sports',
      durationSec: 22,
      status: 'published',
      views: [860_000, 610_000, 210_000],
    },
    {
      title: 'Nobody expected the plot twist',
      sourceTitle: 'Late Night Bits',
      sourceCreator: 'OwnChannel',
      rights: 'owned',
      hook: 'Watch till the end — you’ll rewind it.',
      niche: 'Comedy',
      durationSec: 31,
      status: 'published',
      views: [2_100_000, 340_000, 55_000],
    },
    {
      title: 'The mindset shift that changed everything',
      sourceTitle: 'Morning Motivation Live',
      sourceCreator: 'OwnChannel',
      rights: 'owned',
      hook: 'Ever wonder why the top 1% never quit?',
      niche: 'Motivation',
      durationSec: 58,
      status: 'scheduled',
      views: [0, 0, 0],
    },
    {
      title: 'This $12 gadget felt illegal to use',
      sourceTitle: 'Gadget Roundup Q2',
      sourceCreator: 'TechShelf',
      rights: 'licensed',
      hook: 'This is the most useful $12 you’ll spend.',
      niche: 'Tech',
      durationSec: 41,
      status: 'ready',
      views: [0, 0, 0],
    },
    {
      title: 'Insane clutch 1v5 to win the match',
      sourceTitle: 'Ranked Grind Stream',
      sourceCreator: 'OwnChannel',
      rights: 'owned',
      hook: '1 versus 5, no shot he wins this…',
      niche: 'Gaming',
      durationSec: 28,
      status: 'editing',
      views: [0, 0, 0],
    },
    {
      title: 'The compound interest trick nobody teaches',
      sourceTitle: 'Money Talks Weekly',
      sourceCreator: 'FinanceDesk',
      rights: 'permission',
      hook: '3 reasons your savings account is a trap.',
      niche: 'Finance',
      durationSec: 52,
      status: 'idea',
      views: [0, 0, 0],
    },
  ]

  return raw.map((r, i) => {
    const created = daysFromNow(-14 + i)
    const posts = PLATFORMS.map((platform, pi) => {
      const views = r.views[pi]
      const published = r.status === 'published' && views > 0
      const scheduled = r.status === 'scheduled'
      return {
        platform,
        status: published ? ('published' as const) : scheduled ? ('scheduled' as const) : ('not_posted' as const),
        publishedAt: published ? created : undefined,
        scheduledAt: scheduled ? daysFromNow(1 + pi) : undefined,
        url: published ? `https://example.com/${platform}/${i}${pi}` : undefined,
        views,
        likes: Math.round(views * 0.08),
        comments: Math.round(views * 0.004),
        shares: Math.round(views * 0.012),
        revenue: estimateRevenue(platform, views),
      }
    })
    const niche = r.niche as string
    return {
      id: uid(),
      title: r.title!,
      sourceTitle: r.sourceTitle!,
      sourceCreator: r.sourceCreator!,
      rights: r.rights!,
      hook: r.hook!,
      caption: `${r.hook} Full clip below ⬇️`,
      hashtags: [...HASHTAG_BANK.base.slice(0, 3), ...(HASHTAG_BANK[niche] ?? []).slice(0, 3)],
      niche,
      durationSec: r.durationSec!,
      aspectRatio: '9:16',
      status: r.status!,
      createdAt: created,
      posts,
    } as Clip
  })
}
