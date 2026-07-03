import type { TwoPartConcept } from '../types'
import { loadAISettings } from './settings'
import { analyzeLocal } from './local'
import { analyzeClaude } from './claude'

export * from './settings'

export interface AnalyzeResult {
  concept: TwoPartConcept
  /** Set when Claude was requested but we fell back to the local engine. */
  fallbackReason?: string
}

/**
 * Turn a source video into a two-part clip concept using the configured engine.
 * When Claude is selected but the proxy fails, we transparently fall back to the
 * local generator so the workshop never dead-ends.
 */
export async function analyzeVideo(video: {
  title: string
  creator: string
  niche: string
}): Promise<AnalyzeResult> {
  const settings = loadAISettings()

  if (settings.provider === 'claude') {
    try {
      const concept = await analyzeClaude(settings.proxyUrl, video)
      return { concept }
    } catch (err) {
      return {
        concept: analyzeLocal(video),
        fallbackReason: err instanceof Error ? err.message : 'Claude proxy unavailable',
      }
    }
  }

  return { concept: analyzeLocal(video) }
}
