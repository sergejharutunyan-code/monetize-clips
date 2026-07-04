import { useEffect, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { Discover } from './components/Discover'
import { Library } from './components/Library'
import { Scheduler } from './components/Scheduler'
import { Validate } from './components/Validate'
import { CaptionStudio } from './components/CaptionStudio'
import { Playbook } from './components/Playbook'

type View = 'dashboard' | 'discover' | 'library' | 'validate' | 'scheduler' | 'studio' | 'playbook'

const NAV: { id: View; label: string; ico: string }[] = [
  { id: 'dashboard', label: 'Dashboard', ico: '◲' },
  { id: 'discover', label: 'Discover', ico: '✨' },
  { id: 'library', label: 'Clip Library', ico: '▤' },
  { id: 'validate', label: 'Validate', ico: '▶' },
  { id: 'scheduler', label: 'Scheduler', ico: '◷' },
  { id: 'studio', label: 'Caption Studio', ico: '✎' },
  { id: 'playbook', label: 'Playbook', ico: '★' },
]

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('clipforge.theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('clipforge.theme', theme)
  }, [theme])

  return (
    <div className="app">
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
        {view === 'library' && <Library />}
        {view === 'validate' && <Validate />}
        {view === 'scheduler' && <Scheduler />}
        {view === 'studio' && <CaptionStudio />}
        {view === 'playbook' && <Playbook />}
      </main>
    </div>
  )
}
