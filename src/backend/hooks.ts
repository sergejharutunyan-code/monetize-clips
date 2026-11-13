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
