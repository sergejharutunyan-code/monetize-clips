export type TrendingProvider = 'sample' | 'youtube'

export interface TrendingSettings {
  provider: TrendingProvider
  /** A YouTube Data API v3 key. Stored locally; restrict it by HTTP referrer. */
  youtubeApiKey: string
  /** ISO 3166-1 alpha-2 region code, e.g. US, GB, DE. */
  region: string
  /** YouTube videoCategoryId, or '' for all categories. */
  categoryId: string
}

const KEY = 'clipforge.trending.v1'

const DEFAULTS: TrendingSettings = {
  provider: 'sample',
  youtubeApiKey: '',
  region: 'US',
  categoryId: '',
}

export function loadTrendingSettings(): TrendingSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<TrendingSettings>) }
  } catch {
    // ignore
  }
  return { ...DEFAULTS }
}

export function saveTrendingSettings(s: TrendingSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

/** A few common YouTube categories to filter by. Availability varies by region. */
export const YT_CATEGORIES: { id: string; label: string }[] = [
  { id: '', label: 'All categories' },
  { id: '17', label: 'Sports' },
  { id: '20', label: 'Gaming' },
  { id: '10', label: 'Music' },
  { id: '23', label: 'Comedy' },
  { id: '24', label: 'Entertainment' },
  { id: '28', label: 'Science & Tech' },
  { id: '25', label: 'News & Politics' },
  { id: '26', label: 'Howto & Style' },
]
