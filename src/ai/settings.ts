/**
 * Which Claude the studio uses.
 * - auto:    the backend's key when signed in to a backend that has one, else your own key, else offline
 * - backend: always the backend
 * - key:     your own Anthropic API key, called straight from this browser
 * - offline: the built-in template writer (no research)
 */
export type AIMode = 'auto' | 'backend' | 'key' | 'offline'

export interface AISettings {
  mode: AIMode
  /** Your own Anthropic API key. Stored only in this browser. */
  apiKey: string
}

const KEY = 'clipforge.ai.v2'
const DEFAULTS: AISettings = { mode: 'auto', apiKey: '' }
const CHANGED = 'clipforge:ai-changed'

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
  window.dispatchEvent(new Event(CHANGED))
}

export function onAISettingsChange(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn)
  return () => window.removeEventListener(CHANGED, fn)
}
