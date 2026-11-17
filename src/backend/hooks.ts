import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getConnections, isSignedIn, loadBackend, onBackendChange, type BackendSettings, type ConnectionsInfo } from './api'

/** The saved backend settings, kept in step with sign-in/out anywhere in the app. */
export function useBackend(): BackendSettings {
  const [s, setS] = useState<BackendSettings>(loadBackend)
  useEffect(() => onBackendChange(() => setS(loadBackend())), [])
  return s
}

export interface ConnectionsState {
  info: ConnectionsInfo | null
  loading: boolean
  error: string | null
  reload: () => void
}

/** Which platforms the backend can publish to and which accounts are linked. */
export function useConnections(): ConnectionsState {
  const backend = useBackend()
  const [info, setInfo] = useState<ConnectionsInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const reload = useCallback(() => {
    const mine = ++seq.current
    if (!isSignedIn(backend)) {
      setInfo(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    getConnections(backend.apiUrl, backend.token)
      .then((r) => {
        if (mine !== seq.current) return
        setInfo(r)
        setError(null)
      })
      .catch((e: unknown) => {
        if (mine !== seq.current) return
        setInfo(null)
        setError(
          e instanceof ApiError && e.status === 404
            ? 'This backend is running an older version that cannot publish to all three platforms. Redeploy it from the latest code (on Render: sync the blueprint, then deploy).'
            : e instanceof Error ? e.message : 'Could not load connections.',
        )
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false)
      })
  }, [backend])

  useEffect(() => {
    reload()
  }, [reload])

  return { info, loading, error, reload }
}

export interface HiggsfieldState {
  /** The backend can call Higgsfield for you. */
  available: boolean
  models: import('./api').HiggsfieldModel[]
  defaultModel: string
  loading: boolean
}

const FALLBACK_MODELS: import('./api').HiggsfieldModel[] = [
  { path: 'bytedance/seedance-2.5/text-to-video', label: 'Seedance 2.5 · 4–30s · sound', minSeconds: 4, maxSeconds: 30, audio: true },
  { path: 'bytedance/seedance-2.0/text-to-video', label: 'Seedance 2.0 · 4–15s · sound', minSeconds: 4, maxSeconds: 15, audio: true },
]

/** Whether generation can run through the backend, and with which models. */
export function useHiggsfield(): HiggsfieldState {
  const backend = useBackend()
  const [state, setState] = useState<HiggsfieldState>({ available: false, models: FALLBACK_MODELS, defaultModel: FALLBACK_MODELS[0].path, loading: false })
  useEffect(() => {
    let live = true
    if (!isSignedIn(backend)) {
      setState((s) => ({ ...s, available: false, loading: false }))
      return
    }
    setState((s) => ({ ...s, loading: true }))
    import('./api')
      .then(({ higgsfieldInfo }) => higgsfieldInfo(backend.apiUrl, backend.token))
      .then((r) => live && setState({ available: r.configured, models: r.models.length ? r.models : FALLBACK_MODELS, defaultModel: r.defaultModel, loading: false }))
      .catch(() => live && setState((s) => ({ ...s, available: false, loading: false })))
    return () => {
      live = false
    }
  }, [backend])
  return state
}
