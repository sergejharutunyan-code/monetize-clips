import { useEffect, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { Trends } from './components/Trends'
import { Studio } from './components/Studio'
import { Library } from './components/Library'
import { Assemble } from './components/Assemble'
import { Scheduler } from './components/Scheduler'
import { Styles } from './components/Styles'
import { Playbook } from './components/Playbook'
import { Accounts } from './components/Accounts'
import { PublishModal } from './components/PublishModal'
import { PublishSync } from './components/PublishSync'
import { RenderSync } from './components/RenderSync'
import { PLATFORM_META } from './data'
import type { Platform } from './types'
import type { Focus, Go, View } from './nav'
import { health, loadBackend, saveBackend } from './backend/api'

const NAV: { id: View; label: string; ico: string }[] = [
  { id: 'dashboard', label: 'Dashboard', ico: '◲' },
  { id: 'trends', label: 'Trends', ico: '📈' },
  { id: 'studio', label: 'Studio', ico: '✎' },
  { id: 'videos', label: 'Videos', ico: '▤' },
  { id: 'assemble', label: 'Assemble', ico: '🎬' },
  { id: 'publish', label: 'Publish', ico: '⬆' },
  { id: 'styles', label: 'Styles', ico: '🎨' },
  { id: 'accounts', label: 'Accounts', ico: '⚇' },
  { id: 'playbook', label: 'Playbook', ico: '★' },
]

interface Notice {
  ok: boolean
  text: string
}

/** A platform sign-in sends the browser back here with the outcome in the URL hash. */
function readOAuthReturn(): Notice | null {
  const hash = window.location.hash.replace(/^#/, '')
  const done = /^connected=(\w+)$/.exec(hash)
  const failed = /^connect_error=(\w+):(.*)$/.exec(hash)
  if (!done && !failed) return null
  history.replaceState(null, '', window.location.pathname + window.location.search)
  const name = (id: string) => PLATFORM_META[id as Platform]?.label ?? id
  if (done) return { ok: true, text: `${name(done[1])} is connected. You can publish to it now.` }
  let reason = failed![2]
  try {
    reason = decodeURIComponent(reason)
  } catch {
    // keep raw
  }
  return { ok: false, text: `Could not connect ${name(failed![1])}: ${reason}` }
}

export default function App() {
  const [notice, setNotice] = useState<Notice | null>(readOAuthReturn)
  const [view, setView] = useState<View>(() => (notice ? 'accounts' : 'dashboard'))
  const [focus, setFocus] = useState<Focus>({})
  const [publishing, setPublishing] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('clipforge.theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('clipforge.theme', theme)
  }, [theme])

  // When the app is served by the ClipForge backend itself, use it without asking for a URL.
  useEffect(() => {
    if (loadBackend().apiUrl || !/^https?:$/.test(window.location.protocol)) return
    health(window.location.origin, 5000)
      .then((h) => {
        if (h.app === 'clipforge' && !loadBackend().apiUrl) saveBackend({ ...loadBackend(), apiUrl: window.location.origin })
      })
      .catch(() => {})
  }, [])

  const go: Go = (v, f = {}) => {
    setPublishing(null)
    setFocus(f)
    setView(v)
    window.scrollTo({ top: 0 })
  }

  // Remount the studio when it opens on a different video or trend, so its form starts fresh.
  const studioKey = focus.clipId ?? focus.trend?.id ?? 'new'

  return (
    <div className="app">
      <PublishSync />
      <RenderSync />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">ClipForge</div>
            <div className="brand-sub">Trends → animated shorts</div>
          </div>
        </div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
            <span className="ico">{n.ico}</span>
            {n.label}
          </button>
        ))}
        <div className="nav-spacer" />
        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <span>{theme === 'dark' ? '☀' : '☾'}</span>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </aside>

      <main className="main">
        {view === 'dashboard' && <Dashboard go={go} />}
        {view === 'trends' && <Trends go={go} />}
        {view === 'studio' && <Studio key={studioKey} focus={focus} go={go} />}
        {view === 'videos' && <Library go={go} onPublish={setPublishing} />}
        {view === 'assemble' && <Assemble focus={focus} go={go} onPublish={setPublishing} />}
        {view === 'publish' && <Scheduler onPublish={setPublishing} onOpenAccounts={() => go('accounts')} />}
        {view === 'styles' && <Styles />}
        {view === 'accounts' && <Accounts notice={notice} onDismissNotice={() => setNotice(null)} />}
        {view === 'playbook' && <Playbook />}
      </main>

      {publishing && <PublishModal clipId={publishing} onClose={() => setPublishing(null)} onOpenAccounts={() => go('accounts')} />}
    </div>
  )
}
