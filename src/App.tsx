import { useEffect, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { Discover } from './components/Discover'
import { ClipEditor } from './components/ClipEditor'
import { Library } from './components/Library'
import { Scheduler } from './components/Scheduler'
import { Validate } from './components/Validate'
import { CaptionStudio } from './components/CaptionStudio'
import { Playbook } from './components/Playbook'
import { Accounts } from './components/Accounts'
import { PublishModal } from './components/PublishModal'
import { PublishSync } from './components/PublishSync'
import { PLATFORM_META } from './data'
import type { Platform } from './types'
import { health, loadBackend, saveBackend } from './backend/api'

type View = 'dashboard' | 'discover' | 'editor' | 'library' | 'validate' | 'scheduler' | 'accounts' | 'studio' | 'playbook'

const NAV: { id: View; label: string; ico: string }[] = [
  { id: 'dashboard', label: 'Dashboard', ico: '◲' },
  { id: 'discover', label: 'Discover', ico: '✨' },
  { id: 'editor', label: 'Clip Editor', ico: '✂' },
  { id: 'library', label: 'Clip Library', ico: '▤' },
  { id: 'validate', label: 'Validate', ico: '▶' },
  { id: 'scheduler', label: 'Publish', ico: '⬆' },
  { id: 'accounts', label: 'Accounts', ico: '⚇' },
  { id: 'studio', label: 'Caption Studio', ico: '✎' },
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

  const openAccounts = () => {
    setPublishing(null)
    setView('accounts')
  }

  return (
    <div className="app">
      <PublishSync />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">ClipForge</div>
            <div className="brand-sub">Clip · distribute · monetize</div>
          </div>
        </div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${view === n.id ? 'active' : ''}`}
            onClick={() => setView(n.id)}
          >
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
        {view === 'dashboard' && <Dashboard onNavigate={(v) => setView(v as View)} />}
        {view === 'discover' && <Discover />}
        {/* The editor stays mounted so a loaded source and an export in progress survive a look at another page. */}
        <div className={view === 'editor' ? undefined : 'offstage'} aria-hidden={view !== 'editor'}>
          <ClipEditor active={view === 'editor'} onPublish={setPublishing} />
        </div>
        {view === 'library' && <Library onPublish={setPublishing} />}
        {view === 'validate' && <Validate />}
        {view === 'scheduler' && <Scheduler onPublish={setPublishing} onOpenAccounts={openAccounts} />}
        {view === 'accounts' && <Accounts notice={notice} onDismissNotice={() => setNotice(null)} />}
        {view === 'studio' && <CaptionStudio />}
        {view === 'playbook' && <Playbook />}
      </main>

      {publishing && <PublishModal clipId={publishing} onClose={() => setPublishing(null)} onOpenAccounts={openAccounts} />}
    </div>
  )
}
