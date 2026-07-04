import type { SourceVideo } from '../types'
import { seedDiscovery } from '../discovery'
import { loadTrendingSettings, type TrendingSettings } from './settings'
import { fetchYouTubeTrending } from './youtube'

export * from './settings'
export { mapYouTubeItems } from './youtube'

export interface TrendingResult {
  videos: SourceVideo[]
  /** True when the videos came from a live source (not the example fallback). */
  live: boolean
  /** Set when we fell back to examples, explaining why. */
  note?: string
}

/**
 * Load trending source videos using the configured provider. Any failure (no
 * key, quota, network) falls back to the built-in examples with a note, so the
 * Discover feed never dead-ends.
 */
export async function getTrending(settings?: TrendingSettings): Promise<TrendingResult> {
  const s = settings ?? loadTrendingSettings()

  if (s.provider === 'youtube') {
    if (!s.youtubeApiKey.trim()) {
      return { videos: seedDiscovery(), live: false, note: 'Add a YouTube Data API key to load live trending videos.' }
    }
    try {
      const videos = await fetchYouTubeTrending(s)
      if (videos.length === 0) {
        return { videos: seedDiscovery(), live: false, note: 'YouTube returned no trending videos for that region/category.' }
      }
      return { videos, live: true }
    } catch (err) {
      return {
        videos: seedDiscovery(),
        live: false,
        note: err instanceof Error ? err.message : 'Could not reach the YouTube API.',
      }
    }
  }

  return { videos: seedDiscovery(), live: false }
}
