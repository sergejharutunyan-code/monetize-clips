import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Clip, StylePreset, Trend } from './types'
import { uid, PLATFORMS } from './data'
import { deleteBlob } from './media'
import { normalizePosts } from './publish'
import { STYLE_PRESETS } from '../shared/studio.mjs'

// v2: the animated-shorts studio. Data from the clipping version (v1) is left
// untouched in storage but no longer loaded.
const VIDEOS_KEY = 'clipforge.videos.v2'
const TRENDS_KEY = 'clipforge.trends.v1'
const STYLES_KEY = 'clipforge.styles.v1'
const DEFAULT_STYLE_KEY = 'clipforge.style.default'

interface StoreValue {
  clips: Clip[]
  /** Add a video; returns it (with its new id). */
  addClip: (clip: Omit<Clip, 'id' | 'createdAt' | 'posts'>) => Clip
  updateClip: (id: string, patch: Partial<Clip>) => void
  /** Update a video from its latest state (safe to call from async work). Return null to leave it. */
  mutateClip: (id: string, fn: (clip: Clip) => Partial<Clip> | null) => void
  removeClip: (id: string) => void
  /** Replace the entire set (used by cloud pull). */
  replaceAll: (clips: Clip[]) => void
  clearAll: () => void

  /** Trends you kept from research. */
  savedTrends: Trend[]
  saveTrend: (t: Trend) => void
  unsaveTrend: (id: string) => void

  /** Built-in styles plus your own. */
  styles: StylePreset[]
  defaultStyleId: string
  setDefaultStyle: (id: string) => void
  saveStyle: (s: StylePreset) => void
  removeStyle: (id: string) => void
  styleById: (id?: string) => StylePreset
}

const StoreContext = createContext<StoreValue | null>(null)

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // ignore corrupt storage
  }
  return fallback
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  } catch {
    // storage full / unavailable — non-fatal
  }
}

/** Bring saved videos up to the current shape. */
function migrate(clips: Clip[]): Clip[] {
  return clips.map((c) => ({
    ...c,
    // Session-only blob: URLs are dead after a reload.
    videoUrl: c.videoUrl?.startsWith('blob:') ? undefined : c.videoUrl,
    hashtags: Array.isArray(c.hashtags) ? c.hashtags : [],
    posts: normalizePosts(c.posts),
  }))
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [clips, setClips] = useState<Clip[]>(() => migrate(read<Clip[]>(VIDEOS_KEY, [])))
  const [savedTrends, setSavedTrends] = useState<Trend[]>(() => read<Trend[]>(TRENDS_KEY, []))
  const [customStyles, setCustomStyles] = useState<StylePreset[]>(() => read<StylePreset[]>(STYLES_KEY, []))
  const [defaultStyleId, setDefaultStyleId] = useState<string>(() => {
    try {
      return localStorage.getItem(DEFAULT_STYLE_KEY) || STYLE_PRESETS[0].id
    } catch {
      return STYLE_PRESETS[0].id
    }
  })
  const clipsRef = useRef(clips)
  clipsRef.current = clips

  useEffect(() => write(VIDEOS_KEY, clips), [clips])
  useEffect(() => write(TRENDS_KEY, savedTrends), [savedTrends])
  useEffect(() => write(STYLES_KEY, customStyles), [customStyles])
  useEffect(() => write(DEFAULT_STYLE_KEY, defaultStyleId), [defaultStyleId])

  const value = useMemo<StoreValue>(() => {
    // Your own version of a built-in style replaces it (same id).
    const styles = [
      ...STYLE_PRESETS.map((p) => customStyles.find((c) => c.id === p.id) ?? p),
      ...customStyles.filter((c) => !STYLE_PRESETS.some((p) => p.id === c.id)),
    ]
    const styleById = (id?: string) => styles.find((s) => s.id === id) ?? styles.find((s) => s.id === defaultStyleId) ?? styles[0]
    return {
      clips,
      addClip: (clip) => {
        const newClip: Clip = {
          ...clip,
          id: uid(),
          createdAt: new Date().toISOString(),
          validated: false,
          posts: PLATFORMS.map((platform) => ({ platform, status: 'not_posted' })),
        }
        setClips((prev) => [newClip, ...prev])
        return newClip
      },
      updateClip: (id, patch) => setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))),
      mutateClip: (id, fn) =>
        setClips((prev) =>
          prev.map((c) => {
            if (c.id !== id) return c
            const patch = fn(c)
            return patch ? { ...c, ...patch } : c
          }),
        ),
      removeClip: (id) => {
        const gone = clipsRef.current.find((c) => c.id === id)
        for (const key of [gone?.localMediaId, gone?.voiceoverId, ...(gone?.segments ?? []).map((s) => s.localMediaId)]) {
          if (key) void deleteBlob(key)
        }
        setClips((prev) => prev.filter((c) => c.id !== id))
      },
      replaceAll: (next) => setClips(migrate(next)),
      clearAll: () => setClips([]),

      savedTrends,
      saveTrend: (t) => setSavedTrends((prev) => [t, ...prev.filter((x) => x.id !== t.id && x.title !== t.title)].slice(0, 100)),
      unsaveTrend: (id) => setSavedTrends((prev) => prev.filter((x) => x.id !== id)),

      styles,
      defaultStyleId,
      setDefaultStyle: setDefaultStyleId,
      saveStyle: (s) => setCustomStyles((prev) => [{ ...s, builtIn: false }, ...prev.filter((x) => x.id !== s.id)]),
      removeStyle: (id) => setCustomStyles((prev) => prev.filter((x) => x.id !== id)),
      styleById,
    }
  }, [clips, savedTrends, customStyles, defaultStyleId])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
