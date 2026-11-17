import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { useBackend } from '../backend/hooks'
import { absoluteUrl, getRenders, isSignedIn, type RenderInfo } from '../backend/api'
import type { Clip, Segment } from '../types'

const DONE = new Set(['completed', 'failed', 'canceled'])

function applyRenders(clip: Clip, renders: RenderInfo[], missing: Set<string>, apiUrl: string): Partial<Clip> | null {
  let changed = false
  const segments = (clip.segments ?? []).map((s): Segment => {
    if (!s.renderId) return s
    const r = renders.find((x) => x.id === s.renderId)
    let next = s
    if (r) {
      next = {
        ...s,
        renderStatus: r.status,
        renderNote: r.status === 'failed' ? r.error || 'Generation failed.' : r.progress,
        url: r.status === 'completed' && r.media?.url ? absoluteUrl(apiUrl, r.media.url) : s.url,
        duration: r.media?.duration ?? s.duration,
      }
    } else if (missing.has(s.renderId) && !DONE.has(s.renderStatus ?? '')) {
      next = { ...s, renderStatus: 'failed', renderNote: 'The backend no longer has this render (its data may have been reset). Generate it again.' }
    }
    if (next.renderStatus !== s.renderStatus || next.url !== s.url || next.renderNote !== s.renderNote || next.duration !== s.duration) changed = true
    return next
  })
  if (!changed) return null
  const rendered = segments.filter((s) => s.renderId)
  const allDone = rendered.length > 0 && rendered.every((s) => DONE.has(s.renderStatus ?? ''))
  return { segments, status: clip.status === 'generating' && allDone ? 'editing' : clip.status }
}

/** Follows Higgsfield generations on the backend and fills in each clip as it finishes. Renders nothing. */
export function RenderSync() {
  const { clips, mutateClip } = useStore()
  const backend = useBackend()
  const clipsRef = useRef(clips)
  clipsRef.current = clips
  const mutateRef = useRef(mutateClip)
  mutateRef.current = mutateClip

  const pending = clips.some((c) => (c.segments ?? []).some((s) => s.renderId && !DONE.has(s.renderStatus ?? '')))
  const signedIn = isSignedIn(backend)

  useEffect(() => {
    if (!signedIn || !pending) return
    let stopped = false
    let timer = 0
    const poll = async () => {
      const ids = clipsRef.current
        .flatMap((c) => (c.segments ?? []).filter((s) => s.renderId && !DONE.has(s.renderStatus ?? '')).map((s) => s.renderId!))
        .slice(0, 80)
      if (ids.length) {
        try {
          const renders = await getRenders(backend.apiUrl, backend.token, ids)
          if (!stopped) {
            const known = new Set(renders.map((r) => r.id))
            const missing = new Set(ids.filter((id) => !known.has(id)))
            for (const c of clipsRef.current) {
              if ((c.segments ?? []).some((s) => s.renderId && ids.includes(s.renderId))) {
                mutateRef.current(c.id, (latest) => applyRenders(latest, renders, missing, backend.apiUrl))
              }
            }
          }
        } catch {
          // Offline or the backend is asleep: try again next round.
        }
      }
      if (!stopped) timer = window.setTimeout(poll, 5000)
    }
    void poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [signedIn, pending, backend.apiUrl, backend.token])

  return null
}
