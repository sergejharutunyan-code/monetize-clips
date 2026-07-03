import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Clip } from './types'
import { seedClips, uid, PLATFORMS, estimateRevenue } from './data'

const STORAGE_KEY = 'clipforge.clips.v1'

interface StoreValue {
  clips: Clip[]
  addClip: (clip: Omit<Clip, 'id' | 'createdAt' | 'posts'>) => void
  updateClip: (id: string, patch: Partial<Clip>) => void
  removeClip: (id: string) => void
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
          posts: PLATFORMS.map((platform) => ({
            platform,
            status: 'not_posted',
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            revenue: 0,
          })),
        }
        setClips((prev) => [newClip, ...prev])
      },
      updateClip: (id, patch) => {
        setClips((prev) =>
          prev.map((c) => {
            if (c.id !== id) return c
            const merged = { ...c, ...patch }
            // keep revenue estimates in sync when views change
            merged.posts = merged.posts.map((p) => ({
              ...p,
              revenue: estimateRevenue(p.platform, p.views),
            }))
            return merged
          }),
        )
      },
      removeClip: (id) => setClips((prev) => prev.filter((c) => c.id !== id)),
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
