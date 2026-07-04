import { useState } from 'react'
import type { SourceVideo, TwoPartConcept, ConceptPart } from '../types'
import { seedDiscovery } from '../discovery'
import { NICHES, PLATFORM_META, uid } from '../data'
import { useStore } from '../store'
import {
  analyzeVideo,
  loadAISettings,
  saveAISettings,
  type AIProvider,
} from '../ai'

export function Discover() {
  const [feed, setFeed] = useState<SourceVideo[]>(() => seedDiscovery())
  const [active, setActive] = useState<SourceVideo | null>(null)
  const [settings, setSettings] = useState(() => loadAISettings())

  const setProvider = (provider: AIProvider) => {
    const next = { ...settings, provider }
    setSettings(next)
    saveAISettings(next)
  }
  const setProxy = (proxyUrl: string) => {
    const next = { ...settings, proxyUrl }
    setSettings(next)
    saveAISettings(next)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Discover</h1>
          <p className="page-desc">
            Start from an example or paste your own video, then let AI break it into a two-part clip series — a hook and its payoff — ready to drop into your pipeline.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3 className="card-title">AI engine</h3>
          <span className="card-hint">powers the workshop</span>
        </div>
        <div className="row wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
          <div>
            <div className="segmented">
              <button
                className={settings.provider === 'local' ? 'on' : ''}
                onClick={() => setProvider('local')}
              >
                Local (offline)
              </button>
              <button
                className={settings.provider === 'claude' ? 'on' : ''}
                onClick={() => setProvider('claude')}
              >
                Claude API
              </button>
            </div>
            <div className="card-hint" style={{ marginTop: 6 }}>
              {settings.provider === 'local'
                ? 'Template engine — instant, no key, great for workshopping the format.'
                : 'Calls your Claude proxy server. Falls back to Local if it’s unreachable.'}
            </div>
          </div>
          {settings.provider === 'claude' && (
            <div className="field" style={{ marginBottom: 0, flex: '1 1 260px' }}>
              <label>Proxy URL</label>
              <input value={settings.proxyUrl} onChange={(e) => setProxy(e.target.value)} placeholder="http://localhost:8787" />
            </div>
          )}
        </div>
        {settings.provider === 'claude' && (
          <div className="callout info" style={{ marginTop: 14 }}>
            Run the bundled proxy with <code>ANTHROPIC_API_KEY=… node server/index.mjs</code>. It holds the key server-side and calls Claude — the browser never sees it. See the project README.
          </div>
        )}
      </div>

      <AddByUrl onAdd={(v) => setFeed((f) => [v, ...f])} onWorkshop={setActive} />

      <div className="card card-pad">
        <div className="card-head">
          <h3 className="card-title">Example sources</h3>
          <span className="card-hint">starting points to workshop</span>
        </div>
        <div className="grid grid-3">
          {feed.map((v) => (
            <VideoCard key={v.id} video={v} onWorkshop={() => setActive(v)} />
          ))}
        </div>
      </div>

      {active && <WorkshopModal video={active} onClose={() => setActive(null)} />}
    </>
  )
}

function VideoCard({ video, onWorkshop }: { video: SourceVideo; onWorkshop: () => void }) {
  return (
    <div style={{ background: 'var(--page)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 14px 0', fontSize: 30 }}>{video.thumbGlyph}</div>
      <div style={{ padding: '8px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="clip-title" style={{ fontSize: 14, lineHeight: 1.3 }}>{video.title}</div>
        <div className="clip-source" style={{ marginTop: 4 }}>
          {PLATFORM_META[video.origin].label} · {video.creator}
        </div>
        <div className="row" style={{ gap: 8, margin: '10px 0' }}>
          <span className="badge">{video.niche}</span>
        </div>
        <div className="muted" style={{ fontSize: 12.5, flex: 1 }}>{video.why}</div>
        <button className="btn primary sm" style={{ marginTop: 12, justifyContent: 'center' }} onClick={onWorkshop}>
          ✎ Workshop into clips
        </button>
      </div>
    </div>
  )
}

function AddByUrl({
  onAdd,
  onWorkshop,
}: {
  onAdd: (v: SourceVideo) => void
  onWorkshop: (v: SourceVideo) => void
}) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [niche, setNiche] = useState<string>(NICHES[0])

  const submit = () => {
    if (!title.trim()) return
    const v: SourceVideo = {
      id: uid(),
      title: title.trim(),
      creator: 'Pasted source',
      origin: 'youtube',
      url: url.trim() || undefined,
      niche,
      why: 'Added manually.',
      thumbGlyph: '📎',
    }
    onAdd(v)
    setUrl('')
    setTitle('')
    onWorkshop(v)
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h3 className="card-title">Workshop any video</h3>
        <span className="card-hint">paste a link or describe it</span>
      </div>
      <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0, flex: '2 1 260px' }}>
          <label>What’s the video? (title / premise)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The half-court buzzer beater to win it all" />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 180px' }}>
          <label>URL (optional)</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: '0 1 150px' }}>
          <label>Niche</label>
          <select value={niche} onChange={(e) => setNiche(e.target.value)}>
            {NICHES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <button className="btn primary" onClick={submit} disabled={!title.trim()}>
          Workshop →
        </button>
      </div>
    </div>
  )
}

function WorkshopModal({ video, onClose }: { video: SourceVideo; onClose: () => void }) {
  const { addConcept } = useStore()
  const [loading, setLoading] = useState(false)
  const [concept, setConcept] = useState<TwoPartConcept | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const run = async () => {
    setLoading(true)
    setNote(null)
    try {
      const { concept: c, fallbackReason } = await analyzeVideo({
        title: video.title,
        creator: video.creator,
        niche: video.niche,
      })
      setConcept(c)
      if (fallbackReason) setNote(`Claude proxy unreachable — used the local engine. (${fallbackReason})`)
    } finally {
      setLoading(false)
    }
  }

  const save = () => {
    if (!concept) return
    addConcept(concept)
    setSaved(true)
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 100%)' }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ marginBottom: 2 }}>Clip workshop</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              {video.thumbGlyph} {video.title}
            </p>
          </div>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>

        {!concept && (
          <div className="empty" style={{ padding: '30px 12px' }}>
            <p className="muted" style={{ marginBottom: 16 }}>
              Generate a two-part breakdown: Part 1 hooks and cuts on a cliffhanger, Part 2 delivers the payoff.
            </p>
            <button className="btn primary" onClick={run} disabled={loading}>
              {loading ? 'Analyzing…' : '✨ Generate two-part concept'}
            </button>
          </div>
        )}

        {concept && (
          <>
            <div className="row" style={{ gap: 8, margin: '10px 0 12px' }}>
              <span className="badge">{concept.niche}</span>
              <span className="badge">
                <span className="swatch" style={{ background: concept.provider === 'claude' ? 'var(--series-4)' : 'var(--series-1)' }} />
                {concept.provider === 'claude' ? 'Claude' : 'Local engine'}
              </span>
            </div>

            {note && <div className="callout" style={{ marginBottom: 14 }}>{note}</div>}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                Why it travels
              </div>
              <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>{concept.angle}</p>
            </div>

            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              <PartCard part={concept.part1} accent="var(--series-1)" />
              <PartCard part={concept.part2} accent="var(--series-2)" />
            </div>

            <div className="row between" style={{ marginTop: 20 }}>
              <button className="btn ghost" onClick={run} disabled={loading}>
                {loading ? 'Regenerating…' : '↻ Regenerate'}
              </button>
              {saved ? (
                <span className="badge published" style={{ fontSize: 12.5 }}>✓ Saved 2 clips to Library</span>
              ) : (
                <button className="btn primary" onClick={save}>
                  Save as two-part series →
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PartCard({ part, accent }: { part: ConceptPart; accent: string }) {
  return (
    <div style={{ background: 'var(--page)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, borderTop: `3px solid ${accent}` }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{part.label}</div>
        <span className="badge">{part.clipWindow}</span>
      </div>

      <Field label="Premise — short">{part.premiseShort}</Field>
      <Field label="Premise — broad strokes">{part.premiseBroad}</Field>
      <Field label="On-screen hook"><em>“{part.hook}”</em></Field>
      <Field label="Caption">{part.caption}</Field>

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '10px 0 5px' }}>
        Hashtags
      </div>
      <div className="chips">
        {part.hashtags.map((h) => (
          <span key={h} className="chip tag">{h}</span>
        ))}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{children}</div>
    </div>
  )
}
