import { useState } from 'react'
import { loadAISettings, saveAISettings, useEngine, type AIMode } from '../ai'
import { useBackend, useHiggsfield } from '../backend/hooks'
import { isSignedIn } from '../backend/api'

const MODES: { id: AIMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Automatic', hint: 'The backend’s Claude when you are signed in to one that has a key, otherwise your own key.' },
  { id: 'key', label: 'My API key', hint: 'Calls Claude straight from this browser with your Anthropic key. Works on the GitHub Pages site, no backend needed.' },
  { id: 'backend', label: 'Backend', hint: 'Always the backend’s key (ANTHROPIC_API_KEY on the server).' },
  { id: 'offline', label: 'Offline', hint: 'Template writer only. No research, generic scripts.' },
]

/** Claude (trend research + plot writing) settings. */
export function AICard() {
  const [s, setS] = useState(loadAISettings)
  const [show, setShow] = useState(false)
  const engine = useEngine()
  const set = (patch: Partial<typeof s>) => {
    const next = { ...s, ...patch }
    setS(next)
    saveAISettings(next)
  }
  return (
    <div className="card card-pad">
      <div className="card-head">
        <h3 className="card-title">Claude · research &amp; writing</h3>
        <span className={`badge ${engine?.engine === 'offline' ? '' : 'post-published'}`}>{engine?.label ?? 'checking…'}</span>
      </div>
      <div className="segmented scroll-x" role="group" aria-label="AI mode" style={{ marginBottom: 8 }}>
        {MODES.map((m) => (
          <button key={m.id} className={s.mode === m.id ? 'on' : ''} onClick={() => set({ mode: m.id })}>{m.label}</button>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{MODES.find((m) => m.id === s.mode)?.hint}</div>
      {(s.mode === 'key' || s.mode === 'auto') && (
        <div className="field" style={{ marginBottom: 6 }}>
          <label htmlFor="ai-key">Your Anthropic API key</label>
          <div className="row" style={{ gap: 6 }}>
            <input id="ai-key" type={show ? 'text' : 'password'} value={s.apiKey} onChange={(e) => set({ apiKey: e.target.value.trim() })}
              placeholder="sk-ant-…" autoComplete="off" spellCheck={false} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn sm" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
          </div>
          <span className="muted" style={{ fontSize: 11.5 }}>
            Kept only in this browser and sent only to api.anthropic.com. Create one at console.anthropic.com → API keys; set a monthly spend limit there.
            Research uses web search (billed per search) and takes 30–90 seconds.
          </span>
        </div>
      )}
    </div>
  )
}

/** Whether Higgsfield generation runs through the backend. */
export function HiggsfieldCard() {
  const backend = useBackend()
  const hf = useHiggsfield()
  const signedIn = isSignedIn(backend)
  return (
    <div className="card card-pad">
      <div className="card-head">
        <h3 className="card-title">Higgsfield · video generation</h3>
        <span className={`badge ${hf.available ? 'post-published' : ''}`}>{hf.loading ? 'checking…' : hf.available ? 'API connected' : 'copy & paste'}</span>
      </div>
      {hf.available ? (
        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
          The backend generates each clip with the Higgsfield API, saves the result and fills it into Assemble. Generations use your Higgsfield balance.
        </p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>
            Without the API, the Studio gives you ready prompts: paste each into Higgsfield (9:16), download the clip, and upload it next to its prompt.
          </p>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 0 }}>
            To generate from here: create an API key at console.higgsfield.ai, set <code>HIGGSFIELD_KEY_ID</code> and <code>HIGGSFIELD_KEY_SECRET</code> on the backend
            {signedIn ? '' : ', and sign in to it above'}. Details in BACKEND.md.
          </p>
        </>
      )}
    </div>
  )
}
