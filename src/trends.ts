import type { Trend, TrendSource } from './types'
import { googleTrends, isSignedIn, loadBackend, youtubeTrending } from './backend/api'
import { researchTrends } from './ai'

// ---------------------------------------------------------------- settings

export interface TrendSettings {
  source: TrendSource
  niche: string
  region: string
  focus: string
  youtubeKey: string
  youtubeCategory: string
  /** Hide topics about real people, deaths, crime and disasters. */
  hideSensitive: boolean
}

const KEY = 'clipforge.trendsettings.v1'
const DEFAULTS: TrendSettings = {
  source: 'examples',
  niche: '',
  region: 'US',
  focus: '',
  youtubeKey: '',
  youtubeCategory: '',
  hideSensitive: true,
}

export function loadTrendSettings(): TrendSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<TrendSettings>) }
  } catch {
    // ignore
  }
  return { ...DEFAULTS }
}

export function saveTrendSettings(s: TrendSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

export const SOURCES: { id: TrendSource; label: string; needs: string }[] = [
  { id: 'ai', label: 'AI research', needs: 'Claude searches the web for what is trending in your niche this week.' },
  { id: 'google', label: 'Google Trends', needs: 'Today’s top searches. Needs the backend.' },
  { id: 'wikipedia', label: 'Wikipedia', needs: 'What people looked up most yesterday. Works anywhere.' },
  { id: 'youtube', label: 'YouTube', needs: 'Most popular videos (as topics, not footage). Needs a YouTube API key or the backend.' },
  { id: 'examples', label: 'Evergreen', needs: 'Built-in topics that always work. No setup.' },
]

export const YT_CATEGORIES: { id: string; label: string }[] = [
  { id: '', label: 'All categories' },
  { id: '26', label: 'Howto & Style' },
  { id: '28', label: 'Science & Tech' },
  { id: '24', label: 'Entertainment' },
  { id: '23', label: 'Comedy' },
  { id: '20', label: 'Gaming' },
  { id: '17', label: 'Sports' },
  { id: '10', label: 'Music' },
]

// ---------------------------------------------------------------- sensitivity

// Topics that do not belong in a cartoon: real people, deaths, crime, disasters.
const SENSITIVE =
  /\b(died|death|dead|dies|killed|killing|murder|shooting|shot|stabbing|crash|attack|war|bomb|terror|suicide|overdose|arrest(?:ed)?|trial|lawsuit|sentenced|abuse|assault|hostage|massacre|earthquake|hurricane|flood|wildfire|tornado|funeral|obituary|election|candidate|senator|president)\b/i
const PERSON = /\b(born \d{4}|\(born|actor|actress|singer|rapper|footballer|basketball player|politician|businessman|businesswoman|youtuber|influencer|model|musician|comedian|presenter|athlete|player)\b|\(\d{4}[–-](\d{4})?\)/i

export function isSensitive(t: Pick<Trend, 'title' | 'summary'>): boolean {
  const text = `${t.title} ${t.summary}`
  return SENSITIVE.test(text) || PERSON.test(text)
}

// ---------------------------------------------------------------- sources

let seq = 0
const tid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`

const fmtViews = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n)

interface WikiArticle {
  views?: number
  titles?: { normalized?: string; display?: string }
  normalizedtitle?: string
  description?: string
  extract?: string
  thumbnail?: { source?: string }
  content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } }
}

/** Wikipedia's most-read articles for the previous day (public, CORS-enabled). */
export async function fetchWikipedia(lang = 'en'): Promise<Trend[]> {
  const now = new Date()
  for (const back of [1, 2]) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back))
    const path = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
    let res: Response
    try {
      res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/feed/featured/${path}`, { signal: AbortSignal.timeout(20_000) })
    } catch {
      throw new Error('Could not reach Wikipedia.')
    }
    if (!res.ok) continue
    const json = (await res.json()) as { mostread?: { articles?: WikiArticle[] } }
    const articles = json.mostread?.articles ?? []
    if (!articles.length) continue
    const fetchedAt = new Date().toISOString()
    return articles
      .filter((a) => !/^(Main_Page|Special:|Wikipedia:|Portal:|File:)/.test(a.titles?.normalized || a.normalizedtitle || ''))
      .slice(0, 40)
      .map((a) => {
        const title = a.titles?.normalized || a.normalizedtitle || ''
        const url = a.content_urls?.mobile?.page || a.content_urls?.desktop?.page
        return {
          id: tid('wiki'),
          source: 'wikipedia' as const,
          title,
          summary: a.description ? `${a.description}. ${a.extract ?? ''}`.slice(0, 400) : (a.extract ?? '').slice(0, 400),
          whyNow: a.views ? `${fmtViews(a.views)} Wikipedia readers yesterday.` : 'Among yesterday’s most-read Wikipedia articles.',
          traffic: a.views ? `${fmtViews(a.views)} reads` : undefined,
          thumb: a.thumbnail?.source,
          url,
          sources: url ? [{ title: `Wikipedia: ${title}`, url }] : [],
          freshness: 'today' as const,
          fetchedAt,
        }
      })
      .filter((t) => t.title)
  }
  throw new Error('Wikipedia has no most-read list for the last two days yet.')
}

interface YTItem {
  id: string
  snippet?: { title?: string; channelTitle?: string; description?: string; publishedAt?: string; thumbnails?: { medium?: { url: string } } }
  statistics?: { viewCount?: string }
}

/** YouTube's most popular videos, used as topic signals (never as footage). */
export async function fetchYouTube(s: TrendSettings): Promise<Trend[]> {
  const b = loadBackend()
  const fetchedAt = new Date().toISOString()
  const toTrend = (v: { title: string; creator: string; url?: string; why?: string; thumb?: string; views?: number }): Trend => ({
    id: tid('yt'),
    source: 'youtube',
    title: v.title,
    summary: v.why || `Popular on YouTube (${v.creator}).`,
    whyNow: v.views ? `${fmtViews(v.views)} views — one of YouTube’s most popular videos right now.` : 'On YouTube’s most-popular chart now.',
    traffic: v.views ? `${fmtViews(v.views)} views` : undefined,
    thumb: v.thumb,
    url: v.url,
    sources: v.url ? [{ title: `${v.title} — ${v.creator}`, url: v.url }] : [],
    freshness: 'today',
    caution: 'This is someone else’s video: use it only as a signal of what people care about. Make your own original take.',
    fetchedAt,
  })
  if (!s.youtubeKey.trim() && isSignedIn(b)) {
    const videos = await youtubeTrending(b.apiUrl, b.token, s.region, s.youtubeCategory)
    return videos.map((v) => toTrend({ title: v.title, creator: v.creator, url: v.url, why: v.why, thumb: v.thumbUrl, views: v.views }))
  }
  if (!s.youtubeKey.trim()) throw new Error('Add a YouTube Data API key below, or sign in to a backend that has one.')
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    maxResults: '20',
    regionCode: (s.region || 'US').toUpperCase(),
    key: s.youtubeKey.trim(),
  })
  if (s.youtubeCategory) params.set('videoCategoryId', s.youtubeCategory)
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { signal: AbortSignal.timeout(20_000) })
  const json = (await res.json().catch(() => ({}))) as { items?: YTItem[]; error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message || `YouTube error ${res.status}`)
  return (json.items ?? [])
    .filter((it) => it.snippet?.title)
    .map((it) =>
      toTrend({
        title: it.snippet!.title!,
        creator: it.snippet!.channelTitle ?? 'YouTube',
        url: `https://www.youtube.com/watch?v=${it.id}`,
        why: (it.snippet!.description ?? '').replace(/\s+/g, ' ').slice(0, 200),
        thumb: it.snippet!.thumbnails?.medium?.url,
        views: it.statistics?.viewCount ? Number(it.statistics.viewCount) : undefined,
      }),
    )
}

const EVERGREEN: [string, string, Trend['angles']][] = [
  ['Why we procrastinate', 'The brain picks short-term mood repair over long-term goals.', [{ format: 'explainer', idea: 'Your brain is a toddler with a calendar' }, { format: 'howto', idea: 'The 2-minute trick that gets you started' }]],
  ['Cooking rice perfectly', 'The ratio, the rinse and the rest that make fluffy rice.', [{ format: 'howto', idea: 'Three steps to never-mushy rice' }, { format: 'myth', idea: 'Do you really need to rinse rice?' }]],
  ['Why cats knock things off tables', 'Hunting instinct, curiosity and attention-seeking.', [{ format: 'explainer', idea: 'Your cat is running experiments on you' }, { format: 'story', idea: 'A cat’s secret nightly mission' }]],
  ['The first day at a new job', 'Everyone’s awkward first day: names, coffee machines, the wrong meeting.', [{ format: 'story', idea: 'The intern who joined the wrong meeting' }, { format: 'top3', idea: '3 first-day mistakes everyone makes' }]],
  ['How compound interest works', 'Small amounts that grow on their own growth.', [{ format: 'explainer', idea: 'A snowball that rolls itself' }, { format: 'whatif', idea: 'What if you saved one coin a day for 40 years?' }]],
  ['Why airplane food tastes bland', 'Dry cabin air and low pressure dull taste and smell.', [{ format: 'explainer', idea: 'Your tongue loses 30% at 35,000 feet' }, { format: 'myth', idea: 'Is it really the food’s fault?' }]],
  ['Fixing a squeaky door', 'Hinge pins, lubricant and a towel trick.', [{ format: 'howto', idea: 'Silence any door in 60 seconds' }]],
  ['What if the Moon disappeared', 'Tides, nights, seasons and animals would all change.', [{ format: 'whatif', idea: 'One night without the Moon' }]],
  ['Why we yawn', 'Brain cooling, state changes and contagious yawns.', [{ format: 'explainer', idea: 'The yawn that spreads through a room' }, { format: 'myth', idea: 'Do yawns mean you need oxygen?' }]],
  ['Packing a carry-on like a pro', 'Rolling, cubes and the one-outfit rule.', [{ format: 'howto', idea: 'Fit a week in a backpack' }, { format: 'story', idea: 'The traveler who overpacked for one night' }]],
]

export function examples(): Trend[] {
  const fetchedAt = new Date().toISOString()
  return EVERGREEN.map(([title, summary, angles]) => ({
    id: tid('ever'),
    source: 'examples' as const,
    title,
    summary,
    whyNow: 'Evergreen: people search for this all year.',
    angles,
    freshness: 'evergreen' as const,
    fetchedAt,
  }))
}

/** Load trends from the chosen source. */
export async function loadTrends(s: TrendSettings): Promise<Trend[]> {
  switch (s.source) {
    case 'ai':
      return researchTrends({ niche: s.niche, region: s.region, count: 8, focus: s.focus })
    case 'google': {
      const b = loadBackend()
      if (!isSignedIn(b)) throw new Error('Google Trends is fetched by the backend. Sign in to one in Accounts.')
      return googleTrends(b.apiUrl, b.token, s.region || 'US')
    }
    case 'wikipedia':
      return fetchWikipedia('en')
    case 'youtube':
      return fetchYouTube(s)
    default:
      return examples()
  }
}

/** A topic you typed in yourself. */
export function manualTrend(title: string, summary = ''): Trend {
  return { id: tid('manual'), source: 'manual', title: title.trim(), summary: summary.trim(), fetchedAt: new Date().toISOString() }
}
