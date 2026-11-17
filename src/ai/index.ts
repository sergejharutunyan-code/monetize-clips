import { useEffect, useState } from 'react'
import type { Plot, StylePreset, Trend } from '../types'
import type { FormatId } from '../../shared/studio.mjs'
import { localPlot, researchTrendsWith, writePlotWith, type CreateMessage } from '../../shared/studio.mjs'
import { aiPlot, aiTrends, health, isSignedIn, loadBackend, onBackendChange } from '../backend/api'
import { loadAISettings, onAISettingsChange } from './settings'

export * from './settings'

export type Engine = 'backend' | 'key' | 'offline'

export interface EngineInfo {
  engine: Engine
  /** One line for the UI: what will run and why. */
  label: string
}

const healthCache = new Map<string, { at: number; anthropic: boolean }>()

async function backendHasClaude(apiUrl: string): Promise<boolean> {
  const hit = healthCache.get(apiUrl)
  if (hit && Date.now() - hit.at < 60_000) return hit.anthropic
  try {
    const h = await health(apiUrl, 20_000)
    healthCache.set(apiUrl, { at: Date.now(), anthropic: Boolean(h.anthropic) })
    return Boolean(h.anthropic)
  } catch {
    return false
  }
}

/** Decide which engine runs right now, following the settings. */
export async function resolveEngine(): Promise<EngineInfo> {
  const s = loadAISettings()
  const b = loadBackend()
  const signedIn = isSignedIn(b)
  const hasKey = Boolean(s.apiKey.trim())
  if (s.mode === 'offline') return { engine: 'offline', label: 'Offline template writer' }
  if (s.mode === 'key') return hasKey ? { engine: 'key', label: 'Claude with your API key' } : { engine: 'offline', label: 'Offline (add your Anthropic key in Accounts)' }
  if (s.mode === 'backend') return signedIn ? { engine: 'backend', label: 'Claude via your backend' } : { engine: 'offline', label: 'Offline (sign in to your backend in Accounts)' }
  if (signedIn && (await backendHasClaude(b.apiUrl))) return { engine: 'backend', label: 'Claude via your backend' }
  if (hasKey) return { engine: 'key', label: 'Claude with your API key' }
  return { engine: 'offline', label: 'Offline template writer — connect Claude in Accounts for real research' }
}

/** The engine the studio would use, kept current when settings change. */
export function useEngine(): EngineInfo | null {
  const [info, setInfo] = useState<EngineInfo | null>(null)
  useEffect(() => {
    let live = true
    const update = () => void resolveEngine().then((i) => live && setInfo(i))
    update()
    const offA = onAISettingsChange(update)
    const offB = onBackendChange(update)
    return () => {
      live = false
      offA()
      offB()
    }
  }, [])
  return info
}

/** Claude called straight from this browser with your own key (loaded only when used). */
async function browserCreate(): Promise<CreateMessage> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: loadAISettings().apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 5 * 60 * 1000 })
  return async (params) => {
    try {
      return await client.beta.messages.create(params as never)
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error('Anthropic rejected your API key. Check it in Accounts.')
      if (e instanceof Anthropic.PermissionDeniedError) throw new Error('Your Anthropic key is not allowed to use this model or web search. Check your Console settings.')
      if (e instanceof Anthropic.RateLimitError) throw new Error('Claude is rate-limited right now. Try again in a minute.')
      if (e instanceof Anthropic.APIConnectionError) throw new Error('Could not reach the Anthropic API from this browser.')
      if (e instanceof Anthropic.APIError) throw new Error(`Claude request failed (${e.status ?? 'network'}): ${e.message}`)
      throw e
    }
  }
}

export interface TrendQuery {
  niche?: string
  region?: string
  count?: number
  focus?: string
}

/** Research trending topics with Claude and web search. */
export async function researchTrends(q: TrendQuery): Promise<Trend[]> {
  const { engine } = await resolveEngine()
  if (engine === 'backend') {
    const b = loadBackend()
    return aiTrends(b.apiUrl, b.token, q)
  }
  if (engine === 'key') return researchTrendsWith(await browserCreate(), q)
  throw new Error('Trend research needs Claude. Add your Anthropic key or connect a backend in Accounts — or use the other sources.')
}

export interface PlotQuery {
  trend: Trend
  angle?: string
  format: FormatId
  style: StylePreset
  seconds: number
  tone: string
  factCheck: boolean
}

export interface PlotResult {
  plot: Plot
  /** Set when Claude was wanted but the offline writer ran instead. */
  note?: string
}

/** Write a plot package; falls back to the offline writer only when no Claude is set up. */
export async function writePlot(q: PlotQuery): Promise<PlotResult> {
  const { engine } = await resolveEngine()
  const trend = { title: q.trend.title, summary: q.trend.summary, whyNow: q.trend.whyNow, sources: q.trend.sources }
  if (engine === 'backend') {
    const b = loadBackend()
    return { plot: await aiPlot(b.apiUrl, b.token, { ...q, trend }) }
  }
  if (engine === 'key') return { plot: await writePlotWith(await browserCreate(), { ...q, trend }) }
  return {
    plot: localPlot({ trend: q.trend, format: q.format, style: q.style, seconds: q.seconds, tone: q.tone }),
    note: 'Written by the offline template writer. Connect Claude in Accounts for a script written about the actual topic.',
  }
}
