import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { useBackend } from '../backend/hooks'
import { getJobs, isSignedIn } from '../backend/api'
import { activeJobIds, applyJobs } from '../publish'

/**
 * Keeps clips in step with the backend while it publishes: polls the jobs
 * behind any post that is going out or scheduled, and writes the result
 * (live link, draft, failure reason) back onto the clip. Renders nothing.
 */
export function PublishSync() {
  const { clips, mutateClip } = useStore()
  const backend = useBackend()
  // Read through refs so the polling loop is not restarted by every store change.
  const clipsRef = useRef(clips)
  clipsRef.current = clips
  const mutateRef = useRef(mutateClip)
  mutateRef.current = mutateClip

  const uploading = clips.some((c) => c.posts.some((p) => p.jobId && p.status === 'publishing'))
  const waiting = clips.some((c) => c.posts.some((p) => p.jobId && p.status === 'scheduled'))
  const signedIn = isSignedIn(backend)

  useEffect(() => {
    if (!signedIn || (!uploading && !waiting)) return
    let stopped = false
    let busy = false
    let timer = 0

    const poll = async () => {
      if (busy) return
      busy = true
      window.clearTimeout(timer)
      const current = clipsRef.current
      const ids = activeJobIds(current).slice(0, 150)
      if (ids.length) {
        try {
          const jobs = await getJobs(backend.apiUrl, backend.token, ids)
          if (!stopped) {
            const known = new Set(jobs.map((j) => j.id))
            const missing = new Set(ids.filter((id) => !known.has(id)))
            for (const clip of current) {
              if (clip.posts.some((p) => p.jobId)) mutateRef.current(clip.id, (latest) => applyJobs(latest, jobs, missing))
            }
          }
        } catch {
          // Offline or the backend is asleep: try again on the next round.
        }
      }
      busy = false
      if (stopped) return
      // Fast while something is uploading; otherwise wake up shortly after the
      // next scheduled post is due (or every 30s, whichever comes first).
      let delay = 2500
      if (!uploading) {
        const due = clipsRef.current
          .flatMap((c) => c.posts)
          .filter((p) => p.jobId && p.status === 'scheduled' && p.scheduledAt)
          .map((p) => new Date(p.scheduledAt!).getTime() - Date.now() + 3000)
        delay = Math.max(2500, Math.min(30_000, ...due))
      }
      timer = window.setTimeout(poll, delay)
    }

    void poll()
    const onFocus = () => void poll()
    window.addEventListener('focus', onFocus)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [signedIn, uploading, waiting, backend.apiUrl, backend.token])

  return null
}
