export type AIProvider = 'local' | 'claude'

export interface AISettings {
  provider: AIProvider
  /** Base URL of the Claude proxy server (see /server). */
  proxyUrl: string
}

const KEY = 'clipforge.ai.v1'

const DEFAULTS: AISettings = {
  provider: 'local',
  proxyUrl: 'http://localhost:8787',
}

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AISettings>) }
  } catch {
    // ignore
  }
  return { ...DEFAULTS }
}

export function saveAISettings(s: AISettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}
