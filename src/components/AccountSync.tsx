import { useState } from 'react'
import { useStore } from '../store'
import { useBackend } from '../backend/hooks'
import {
  health, isSignedIn, loadBackend, saveBackend, register, login, logout, pullClips, pushClips,
  type BackendSettings,
} from '../backend/api'

export function AccountSync() {
  const { clips, replaceAll } = useStore()
  const s = useBackend()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loggedIn = isSignedIn(s)
  const set = (patch: Partial<BackendSettings>) => saveBackend({ ...loadBackend(), ...patch })

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const submit = () =>
    run(async () => {
      if (!s.apiUrl.trim()) throw new Error('Enter your backend URL first.')
      const res = await (mode === 'register' ? register : login)(s.apiUrl, s.email.trim(), password)
      set({ token: res.token, email: res.user.email })
      setPassword('')
      setMsg(mode === 'register' ? 'Account created — you’re signed in.' : 'Signed in.')
    })

  const check = () =>
    run(async () => {
      if (!s.apiUrl.trim()) throw new Error('Enter your backend URL first.')
      const h = await health(s.apiUrl, 75_000)
      if (h.app !== 'clipforge' && !h.ok) throw new Error('That address did not answer like a ClipForge backend.')
      const on = h.publish ? Object.entries(h.publish).filter(([, v]) => v).map(([k]) => k) : []
      setMsg(
        `Backend is up. Video conversion (ffmpeg): ${h.ffmpeg ? 'yes' : 'no'}. ` +
          `Platforms set up: ${on.length ? on.join(', ') : 'none yet'}.`,
      )
    })

  const doPull = () =>
    run(async () => {
      const cloud = await pullClips(s.apiUrl, s.token)
      replaceAll(cloud)
      setMsg(`Pulled ${cloud.length} clip${cloud.length === 1 ? '' : 's'} from your account.`)
    })

  const doPush = () =>
    run(async () => {
      const r = await pushClips(s.apiUrl, s.token, clips)
      setMsg(`Pushed ${r.count} clip${r.count === 1 ? '' : 's'} to your account.`)
    })

  const signOut = () =>
    run(async () => {
      await logout(s.apiUrl, s.token)
      set({ token: '', email: '' })
      setMsg('Signed out.')
    })

  return (
    <div className="card card-pad">
      <div className="card-head">
        <h3 className="card-title">ClipForge backend</h3>
        <span className="card-hint">{loggedIn ? `signed in as ${s.email}` : 'needed for automatic posting'}</span>
      </div>

      <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>
        The backend stores your finished clips, converts them to MP4, and uploads them to the platforms — now or on a
        schedule. Clip editing works without it. See <code>BACKEND.md</code> to run one.
      </p>

      <div className="field">
        <label htmlFor="backend-url">Backend URL</label>
        <div className="row" style={{ gap: 8 }}>
          <input id="backend-url" style={{ flex: 1, minWidth: 0 }} value={s.apiUrl} onChange={(e) => set({ apiUrl: e.target.value })}
            placeholder="https://your-clipforge-backend" disabled={loggedIn} inputMode="url" autoCapitalize="off" />
          <button className="btn sm" onClick={check} disabled={busy || !s.apiUrl.trim()}>Check</button>
        </div>
      </div>

      {!loggedIn ? (
        <>
          <div className="segmented" style={{ marginBottom: 12 }}>
            <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Sign in</button>
            <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Create account</button>
          </div>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="backend-email">Email</label>
              <input id="backend-email" type="email" value={s.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" autoComplete="username" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="backend-password">Password</label>
              <input id="backend-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
            </div>
          </div>
          <button className="btn primary" style={{ marginTop: 14 }} onClick={() => void submit()} disabled={busy}>
            {busy ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>
        </>
      ) : (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn" onClick={() => void doPull()} disabled={busy}>↓ Pull clips from cloud</button>
          <button className="btn" onClick={() => void doPush()} disabled={busy}>↑ Push clips to cloud ({clips.length})</button>
          <button className="btn ghost sm" onClick={() => void signOut()} disabled={busy}>Sign out</button>
        </div>
      )}

      {msg && <div className="callout info" style={{ marginTop: 12 }} role="status">{msg}</div>}
      {error && <div className="callout" style={{ marginTop: 12 }} role="alert">{error}</div>}
      {loggedIn && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
          Pull replaces this device’s clip list with your account’s; push replaces your account’s with this device’s. Clip
          videos you published are kept on the backend; unpublished exports stay on the device that made them.
        </div>
      )}
    </div>
  )
}
