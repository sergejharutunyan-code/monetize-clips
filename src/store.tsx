import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Clip, TwoPartConcept } from './types'
import { seedClips, uid, PLATFORMS } from './data'

const STORAGE_KEY = 'clipforge.clips.v1'

interface StoreValue {
  clips: Clip[]
  addClip: (clip: Omit<Clip, 'id' | 'createdAt' | 'posts'>) => void
  /** Save an AI two-part concept as two linked clips; returns their ids. */
  addConcept: (concept: TwoPartConcept, opts?: { durationSec?: number }) => string[]
  updateClip: (id: string, patch: Partial<Clip>) => void
  removeClip: (id: string) => void
  /** Replace the entire clip set (used by cloud pull). */
  replaceAll: (clips: Clip[]) => void
  resetDemo: () => void
  clearAll: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

function load(): Clip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Clip[]
  } catch {
    // ignore corrupt storage
  }
  return seedClips()
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [clips, setClips] = useState<Clip[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clips))
    } catch {
      // storage full / unavailable — non-fatal
    }
  }, [clips])

  const value = useMemo<StoreValue>(
    () => ({
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
      },
      addConcept: (concept, opts) => {
        const seriesId = uid()
        const now = new Date().toISOString()
        const emptyPosts = () =>
          PLATFORMS.map((platform) => ({ platform, status: 'not_posted' as const }))
        const parts = [concept.part1, concept.part2] as const
        const created: Clip[] = parts.map((p, i) => ({
          id: uid(),
          title: `${concept.sourceTitle} — Part ${i + 1}`,
          sourceTitle: concept.sourceTitle,
          sourceCreator: concept.sourceCreator,
          rights: 'unverified',
          hook: p.hook,
          caption: p.caption,
          hashtags: p.hashtags,
          niche: concept.niche,
          durationSec: opts?.durationSec ?? 40,
          aspectRatio: '9:16',
          status: 'idea',
          createdAt: now,
          posts: emptyPosts(),
          validated: false,
          series: { id: seriesId, part: (i + 1) as 1 | 2, total: 2 },
        }))
        setClips((prev) => [...created, ...prev])
        return created.map((c) => c.id)
      },
      updateClip: (id, patch) => {
        setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      },
      removeClip: (id) => setClips((prev) => prev.filter((c) => c.id !== id)),
      replaceAll: (next) => setClips(next),
      resetDemo: () => setClips(seedClips()),
      clearAll: () => setClips([]),
    }),
    [clips],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
