import type { SourceVideo } from '../types'
import type { TrendingSettings } from './settings'

/** Map YouTube category IDs onto ClipForge niches (best-effort). */
const CATEGORY_TO_NICHE: Record<string, string> = {
  '17': 'Sports',
  '20': 'Gaming',
  '10': 'Music',
  '23': 'Comedy',
  '24': 'Comedy',
  '1': 'Comedy',
  '28': 'Tech',
  '25': 'Educational',
  '27': 'Educational',
  '26': 'Educational',
  '22': 'Podcast',
}

interface YTThumb {
  url: string
}
interface YTItem {
  id: string
  snippet?: {
    title?: string
    channelTitle?: string
    description?: string
    publishedAt?: string
    categoryId?: string
    thumbnails?: { medium?: YTThumb; high?: YTThumb; default?: YTThumb }
  }
  statistics?: { viewCount?: string }
}
interface YTResponse {
  items?: YTItem[]
  error?: { message?: string; errors?: { reason?: string }[] }
}

const firstSentence = (text: string, max = 140) => {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const cut = clean.slice(0, max)
  return cut.length < clean.length ? `${cut.trimEnd()}…` : cut
}

/** Pure mapping from a YouTube API response to SourceVideo[] — unit-testable. */
export function mapYouTubeItems(json: YTResponse): SourceVideo[] {
  return (json.items ?? [])
    .filter((it) => it.id && it.snippet?.title)
    .map((it) => {
      const s = it.snippet!
      const thumb = s.thumbnails?.medium?.url ?? s.thumbnails?.high?.url ?? s.thumbnails?.default?.url
      const views = it.statistics?.viewCount ? Number(it.statistics.viewCount) : undefined
      return {
        id: it.id,
        title: s.title!,
        creator: s.channelTitle ?? 'YouTube',
        origin: 'youtube' as const,
        url: `https://www.youtube.com/watch?v=${it.id}`,
        niche: CATEGORY_TO_NICHE[s.categoryId ?? ''] ?? 'Educational',
        why: firstSentence(s.description ?? '') || `Trending on ${s.channelTitle ?? 'YouTube'}.`,
        thumbGlyph: '▶',
        thumbUrl: thumb,
        views: Number.isFinite(views) ? views : undefined,
        publishedAt: s.publishedAt,
      }
    })
}

/** Fetch real "most popular" videos from the YouTube Data API v3. */
export async function fetchYouTubeTrending(s: TrendingSettings): Promise<SourceVideo[]> {
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    maxResults: '12',
    regionCode: (s.region || 'US').trim().toUpperCase(),
    key: s.youtubeApiKey.trim(),
  })
  if (s.categoryId) params.set('videoCategoryId', s.categoryId)

  let res: Response
  try {
    res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`, {
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('Network error reaching the YouTube API.')
  }

  const json = (await res.json().catch(() => ({}))) as YTResponse
  if (!res.ok) {
    const reason = json.error?.errors?.[0]?.reason
    const msg = json.error?.message ?? `YouTube API error ${res.status}`
    if (reason === 'quotaExceeded') throw new Error('YouTube API quota exceeded for today.')
    if (res.status === 400 || res.status === 403) throw new Error(`${msg} (check the API key / referrer restrictions).`)
    throw new Error(msg)
  }
  return mapYouTubeItems(json)
}
