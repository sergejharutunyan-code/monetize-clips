import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Trend } from '../types'
import { formatById } from '../../shared/studio.mjs'
import { useEngine } from '../ai'
import { SOURCES, YT_CATEGORIES, examples, isSensitive, loadTrendSettings, loadTrends, manualTrend, saveTrendSettings, type TrendSettings } from '../trends'
import type { Go } from '../nav'

const FRESH: Record<string, string> = { today: 'today', this_week: 'this week', this_month: 'this month', evergreen: 'evergreen' }

/** Research what is trending and pick topics to turn into videos. */
export function Trends({ go }: { go: Go }) {
  const { savedTrends, saveTrend, unsaveTrend } = useStore()
  const engine = useEngine()
  const [s, setS] = useState<TrendSettings>(loadTrendSettings)
  const [results, setResults] = useState<Trend[]>(() => (loadTrendSettings().source === 'examples' ? examples() : []))
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'results' | 'saved'>('results')
  const [manual, setManual] = useState('')

  const set = (patch: Partial<TrendSettings>) => {
    const next = { ...s, ...patch }
    setS(next)
    saveTrendSettings(next)
  }

  useEffect(() => {
    if (!loading) return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [loading])

  const find = async (settings = s) => {
    setLoading(true)
    setElapsed(0)
    setError(null)
    setTab('results')
    try {
      setResults(await loadTrends(settings))
    } catch (e) {
      setResults([])
      setError(e instanceof Error ? e.message : 'Could not load trends.')
    } finally {
      setLoading(false)
    }
  }

  const shown = useMemo(() => {
    const list = tab === 'saved' ? savedTrends : results
    return s.hideSensitive && tab === 'results' ? list.filter((t) => t.source === 'ai' || t.source === 'examples' || !isSensitive(t)) : list
  }, [tab, savedTrends, results, s.hideSensitive])
  const hidden = tab === 'results' ? results.length - shown.length : 0
  const savedIds = new Set(savedTrends.map((t) => t.title))
  const source = SOURCES.find((x) => x.id === s.source) ?? SOURCES[0]

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Trends</h1>
          <p className="page-desc">Find what people are talking about right now, then turn a topic into an original animated short.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="segmented scroll-x" role="tablist" aria-label="Source" style={{ marginBottom: 10 }}>
          {SOURCES.map((x) => (
            <button key={x.id} className={s.source === x.id ? 'on' : ''} onClick={() => {
              set({ source: x.id })
              setError(null)
              if (x.id === 'examples') setResults(examples())
              else setResults([])
            }}>{x.label}</button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{source.needs}</div>

        {s.source === 'ai' && (
          <div className="field-row">
            <div className="field">
              <label htmlFor="tr-niche">Niche</label>
              <input id="tr-niche" value={s.niche} onChange={(e) => set({ niche: e.target.value })} placeholder="e.g. cooking hacks, pets, money for students" />
            </div>
            <div className="field">
              <label htmlFor="tr-focus">Anything else? <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
              <input id="tr-focus" value={s.focus} onChange={(e) => set({ focus: e.target.value })} placeholder="e.g. things parents are searching for" />
            </div>
          </div>
        )}
        {(s.source === 'ai' || s.source === 'google' || s.source === 'youtube') && (
          <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ maxWidth: 120 }}>
              <label htmlFor="tr-region">Region</label>
              <input id="tr-region" value={s.region} onChange={(e) => set({ region: e.target.value.toUpperCase().slice(0, 5) })} placeholder="US" />
            </div>
            {s.source === 'youtube' && (
              <>
                <div className="field" style={{ flex: '1 1 200px' }}>
                  <label htmlFor="tr-ytkey">YouTube Data API key</label>
                  <input id="tr-ytkey" type="password" value={s.youtubeKey} onChange={(e) => set({ youtubeKey: e.target.value })} placeholder="AIza… (or leave empty to use the backend)" />
                </div>
                <div className="field">
                  <label htmlFor="tr-ytcat">Category</label>
                  <select id="tr-ytcat" value={s.youtubeCategory} onChange={(e) => set({ youtubeCategory: e.target.value })}>
                    {YT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
          {s.source !== 'examples' && (
            <button className="btn primary" onClick={() => void find()} disabled={loading}>
              {loading ? `Searching… ${elapsed}s` : '🔎 Find trends'}
            </button>
          )}
          <label className="check-row" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={s.hideSensitive} onChange={(e) => set({ hideSensitive: e.target.checked })} />
            <span>Hide real people, deaths, crime and disasters</span>
          </label>
        </div>
        {s.source === 'ai' && engine && engine.engine === 'offline' && (
          <div className="callout" style={{ marginTop: 12 }}>
            AI research needs Claude. <button className="link-btn" onClick={() => go('accounts')}>Add your Anthropic key or connect a backend</button> — or use Wikipedia or Evergreen meanwhile.
          </div>
        )}
        {loading && s.source === 'ai' && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Claude is searching the web — this usually takes 30–90 seconds.</div>}
        {error && <div className="callout" style={{ marginTop: 12 }} role="alert">{error}</div>}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="player-input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or type any topic you have in mind…"
            onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) go('studio', { trend: manualTrend(manual) }) }} aria-label="Your own topic" />
          <button className="btn" onClick={() => go('studio', { trend: manualTrend(manual) })} disabled={!manual.trim()}>Write plot →</button>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-head">
          <div className="segmented" role="tablist">
            <button className={tab === 'results' ? 'on' : ''} onClick={() => setTab('results')}>Results ({results.length})</button>
            <button className={tab === 'saved' ? 'on' : ''} onClick={() => setTab('saved')}>Saved ({savedTrends.length})</button>
          </div>
          {hidden > 0 && <span className="card-hint">{hidden} hidden by the filter</span>}
        </div>
        {shown.length === 0 ? (
          <div className="empty">
            {tab === 'saved' ? 'Save topics you like and they wait here.' : loading ? 'Searching…' : s.source === 'examples' ? '' : 'Press “Find trends”.'}
          </div>
        ) : (
          <div className="grid grid-3">
            {shown.map((t) => (
              <TrendCard
                key={t.id}
                t={t}
                saved={savedIds.has(t.title)}
                onSave={() => (savedIds.has(t.title) ? unsaveTrend(savedTrends.find((x) => x.title === t.title)!.id) : saveTrend(t))}
                onWrite={(angle) => go('studio', { trend: t, angle })}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function TrendCard({ t, saved, onSave, onWrite }: { t: Trend; saved: boolean; onSave: () => void; onWrite: (angle?: string) => void }) {
  return (
    <div className="trend-card">
      {t.thumb && <img src={t.thumb} alt="" loading="lazy" className="trend-thumb" />}
      <div className="trend-body">
        <div className="clip-title" style={{ fontSize: 14.5, lineHeight: 1.3 }}>{t.title}</div>
        <div className="row wrap" style={{ gap: 5, margin: '6px 0' }}>
          {t.freshness && <span className="badge">{FRESH[t.freshness]}</span>}
          {t.traffic && <span className="badge">{t.traffic}</span>}
          {t.niche && <span className="badge">{t.niche}</span>}
        </div>
        {t.summary && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t.summary}</div>}
        {t.whyNow && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}><em>{t.whyNow}</em></div>}
        {t.angles && t.angles.length > 0 && (
          <div className="stack" style={{ gap: 4, marginTop: 8 }}>
            {t.angles.map((a) => (
              <button key={a.idea} className="angle-btn" onClick={() => onWrite(a.idea)} title="Write a plot for this angle">
                <span className="badge" style={{ fontSize: 10.5 }}>{formatById(a.format).label}</span> {a.idea}
              </button>
            ))}
          </div>
        )}
        {t.caution && <div className="platform-note" style={{ marginTop: 6 }}>⚠ {t.caution}</div>}
        {t.sources && t.sources.length > 0 && (
          <div className="trend-sources">
            {t.sources.slice(0, 3).map((src) => (
              <a key={src.url} href={src.url} target="_blank" rel="noreferrer">{src.title.length > 60 ? `${src.title.slice(0, 58)}…` : src.title} ↗</a>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 6, marginTop: 'auto', paddingTop: 10 }}>
          <button className="btn primary sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onWrite()}>Write plot →</button>
          <button className="btn sm" onClick={onSave} aria-pressed={saved}>{saved ? '★ Saved' : '☆ Save'}</button>
        </div>
      </div>
    </div>
  )
}
