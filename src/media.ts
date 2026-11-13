import { useEffect, useState } from 'react'
import type { Clip } from './types'

/**
 * Rendered clip files, kept in this browser's IndexedDB so a clip you export
 * is still there (and still publishable) after a reload. If IndexedDB is not
 * available (some private-browsing modes) files are held in memory for the
 * session instead.
 */

const DB_NAME = 'clipforge-media'
const STORE = 'blobs'

let dbPromise: Promise<IDBDatabase | null> | null = null
const memory = new Map<string, Blob>()
const urls = new Map<string, string>()

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        if (!db) return resolve(undefined)
        try {
          const t = db.transaction(STORE, mode)
          const req = run(t.objectStore(STORE))
          t.oncomplete = () => resolve(req.result)
          t.onerror = () => reject(t.error)
          t.onabort = () => reject(t.error)
        } catch (e) {
          reject(e)
        }
      }),
  )
}

export const newMediaId = () => `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export async function putBlob(id: string, blob: Blob): Promise<void> {
  memory.set(id, blob)
  try {
    const db = await openDb()
    if (!db) return
    await tx('readwrite', (s) => s.put(blob, id))
    memory.delete(id) // safely on disk
  } catch {
    // Quota or private mode: the in-memory copy still works for this session.
  }
}

export async function getBlob(id: string): Promise<Blob | null> {
  const held = memory.get(id)
  if (held) return held
  try {
    const found = await tx<Blob>('readonly', (s) => s.get(id))
    return found instanceof Blob ? found : null
  } catch {
    return null
  }
}

export async function deleteBlob(id: string): Promise<void> {
  memory.delete(id)
  const url = urls.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    urls.delete(id)
  }
  try {
    await tx('readwrite', (s) => s.delete(id))
  } catch {
    // ignore
  }
}

/** A playable object URL for a locally stored clip (cached for the session). */
async function localUrl(id: string): Promise<string | null> {
  const cached = urls.get(id)
  if (cached) return cached
  const blob = await getBlob(id)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urls.set(id, url)
  return url
}

export const hasVideo = (clip: Clip) => Boolean(clip.videoUrl || clip.localMediaId)

export interface ClipVideo {
  /** Playable URL, once resolved. */
  src?: string
  loading: boolean
}

/**
 * Resolve a clip to something a <video> can play: the copy saved in this
 * browser when there is one (instant, works offline), otherwise its hosted URL.
 */
export function useClipVideo(clip: Pick<Clip, 'localMediaId' | 'videoUrl'> | null | undefined): ClipVideo {
  const localId = clip?.localMediaId
  const remote = clip?.videoUrl
  const [state, setState] = useState<ClipVideo>(() =>
    localId ? { src: urls.get(localId), loading: !urls.has(localId) } : { src: remote, loading: false },
  )
  useEffect(() => {
    let live = true
    if (!localId) {
      setState({ src: remote, loading: false })
      return
    }
    void localUrl(localId).then((url) => {
      if (live) setState({ src: url ?? remote, loading: false })
    })
    return () => {
      live = false
    }
  }, [localId, remote])
  return state
}

/** The clip's video bytes: the local copy, or its hosted URL downloaded. */
export async function clipBlob(clip: Pick<Clip, 'localMediaId' | 'videoUrl'>): Promise<Blob | null> {
  if (clip.localMediaId) {
    const local = await getBlob(clip.localMediaId)
    if (local) return local
  }
  if (clip.videoUrl && /^https?:/.test(clip.videoUrl)) {
    try {
      const res = await fetch(clip.videoUrl)
      if (res.ok) return await res.blob()
    } catch {
      // Cross-origin without CORS, or offline.
    }
  }
  return null
}
