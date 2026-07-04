import { useState } from 'react'
import { useStore } from '../store'
import { loadBackend, saveBackend, register, login, logout, pullClips, pushClips } from '../backend/api'

export function AccountSync() {
  const { clips, replaceAll } = useStore()
  const [s, setS] = useState(() => loadBackend())
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loggedIn = Boolean(s.token && s.apiUrl)
  const set = (patch: Partial<typeof s>) => {
    const next = { ...s, ...patch }
    setS(next)
    saveBackend(next)
  }

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
        <h3 className="card-title">Account &amp; Sync</h3>
        <span className="card-hint">{loggedIn ? s.email : 'optional — needs a backend'}</span>
      </div>

      <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>
        Runs fully offline by default. Connect a ClipForge backend to keep your clips in an account and
        sync across devices. See <code>BACKEND.md</code> to deploy one.
      </p>

      <div className="field">
        <label>Backend URL</label>
        <input value={s.apiUrl} onChange={(e) => set({ apiUrl: e.target.value })} placeholder="https://your-clipforge-backend" disabled={loggedIn} />
      </div>

      {!loggedIn ? (
        <>
          <div className="segmented" style={{ marginBottom: 12 }}>
            <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Sign in</button>
            <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Create account</button>
          </div>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Email</label>
              <input type="email" value={s.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters"
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
            </div>
          </div>
          <button className="btn primary" style={{ marginTop: 14 }} onClick={submit} disabled={busy}>
            {busy ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>
        </>
      ) : (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn" onClick={doPull} disabled={busy}>↓ Pull from cloud</button>
          <button className="btn primary" onClick={doPush} disabled={busy}>↑ Push to cloud ({clips.length})</button>
          <button className="btn ghost sm" onClick={signOut} disabled={busy}>Sign out</button>
        </div>
      )}

      {msg && <div className="callout info" style={{ marginTop: 12 }}>{msg}</div>}
      {error && <div className="callout" style={{ marginTop: 12 }}>{error}</div>}
      {loggedIn && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
          Pull replaces local clips with your account’s; push replaces your account’s with local. (Simple full-set sync.)
        </div>
      )}
    </div>
  )
}
