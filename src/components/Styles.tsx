import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { StylePreset } from '../types'
import { STYLE_PRESETS } from '../../shared/studio.mjs'
import { drawComposite } from '../render'
import { uid } from '../data'

/** The channel's look: art style, host character, voice and caption design, used in every prompt. */
export function Styles() {
  const { styles, defaultStyleId, setDefaultStyle, saveStyle, removeStyle } = useStore()
  const [editing, setEditing] = useState<StylePreset | null>(null)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Styles</h1>
          <p className="page-desc">
            A distinctive, consistent look is what makes a channel recognizable. Every prompt repeats the style and the host character word for word.
          </p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ ...styles.find((s) => s.id === defaultStyleId)!, id: uid('style'), name: 'My style', builtIn: false })}>
          + New style
        </button>
      </div>

      <div className="grid grid-3">
        {styles.map((s) => {
          const builtIn = STYLE_PRESETS.some((p) => p.id === s.id)
          const changed = builtIn && !s.builtIn
          return (
            <div key={s.id} className="style-card">
              <CaptionSample style={s} />
              <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div className="row between">
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                  {s.id === defaultStyleId && <span className="badge post-published">default</span>}
                </div>
                <div className="muted" style={{ fontSize: 12.5, margin: '6px 0' }}>{s.look}</div>
                <div style={{ fontSize: 12.5 }}><strong>Host:</strong> {s.character}</div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}><strong>Voice:</strong> {s.voice}</div>
                <div className="row wrap" style={{ gap: 6, marginTop: 'auto', paddingTop: 10 }}>
                  {s.id !== defaultStyleId && <button className="btn sm" onClick={() => setDefaultStyle(s.id)}>Use by default</button>}
                  <button className="btn ghost sm" onClick={() => setEditing({ ...s })}>Edit</button>
                  {(!builtIn || changed) && (
                    <button className="btn ghost sm danger" onClick={() => confirm(builtIn ? `Reset ${s.name} to the original?` : `Delete ${s.name}?`) && removeStyle(s.id)}>
                      {builtIn ? 'Reset' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <StyleEditor
          style={editing}
          onClose={() => setEditing(null)}
          onSave={(s) => {
            saveStyle(s)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

/** A small rendered caption in the style, so the look of the text is visible before exporting. */
function CaptionSample({ style }: { style: StylePreset }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    c.width = 540
    c.height = 300
    drawComposite(ctx, null, 0, 0, 1, { captions: [{ start: 0, end: 5, text: 'Wait for it…' }], style: style.caption })
  }, [style])
  return <canvas ref={ref} className="style-sample" aria-label={`Caption sample for ${style.name}`} />
}

const FIELDS: { key: keyof StylePreset; label: string; hint: string }[] = [
  { key: 'look', label: 'Art style', hint: 'Describe the medium, lines and textures. No studio or artist names.' },
  { key: 'palette', label: 'Palette', hint: 'A few named colors.' },
  { key: 'motion', label: 'Motion', hint: 'How things move: frame rate feel, squash and stretch, transitions.' },
  { key: 'character', label: 'Host character', hint: 'Name, then a precise look that never changes.' },
  { key: 'voice', label: 'Narrator voice', hint: 'How the narration should sound.' },
  { key: 'music', label: 'Music', hint: 'Background music mood and instruments.' },
]

function StyleEditor({ style, onClose, onSave }: { style: StylePreset; onClose: () => void; onSave: (s: StylePreset) => void }) {
  const [s, setS] = useState(style)
  const set = (patch: Partial<StylePreset>) => setS((p) => ({ ...p, ...patch }))
  const setCap = (patch: Partial<StylePreset['caption']>) => setS((p) => ({ ...p, caption: { ...p.caption, ...patch } }))
  const brand = /\b(pixar|disney|ghibli|dreamworks|simpsons|south park|marvel|pokemon|pokémon|nintendo|looney|cartoon network|nickelodeon|wes anderson|miyazaki)\b/i
  const flagged = FIELDS.some((f) => brand.test(String(s[f.key] ?? '')))

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit style">
        <h2>{style.name}</h2>
        <div className="field">
          <label htmlFor="st-name">Name</label>
          <input id="st-name" value={s.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        {FIELDS.map((f) => (
          <div key={f.key} className="field">
            <label htmlFor={`st-${f.key}`}>{f.label}</label>
            <textarea id={`st-${f.key}`} rows={2} value={String(s[f.key] ?? '')} onChange={(e) => set({ [f.key]: e.target.value } as Partial<StylePreset>)} />
            <span className="muted" style={{ fontSize: 11.5 }}>{f.hint}</span>
          </div>
        ))}
        {flagged && (
          <div className="callout" style={{ marginBottom: 12 }}>
            This names a studio, franchise or artist. Describe the look in plain visual words instead: it keeps the style your own and avoids prompts that video tools refuse.
          </div>
        )}
        <div className="field-label">Captions</div>
        <div className="row wrap" style={{ gap: 12, marginBottom: 12 }}>
          <label className="mini-field">Font
            <select value={s.caption.font} onChange={(e) => setCap({ font: e.target.value as StylePreset['caption']['font'] })}>
              <option value="block">Block</option>
              <option value="rounded">Rounded</option>
              <option value="marker">Marker</option>
            </select>
          </label>
          <label className="mini-field">Box
            <select value={s.caption.box} onChange={(e) => setCap({ box: e.target.value as StylePreset['caption']['box'] })}>
              <option value="none">Outline</option>
              <option value="pill">Pill</option>
              <option value="paper">Paper card</option>
            </select>
          </label>
          <label className="mini-field">Text<input type="color" value={s.caption.fill} onChange={(e) => setCap({ fill: e.target.value })} /></label>
          <label className="mini-field">Outline/box<input type="color" value={s.caption.stroke} onChange={(e) => setCap({ stroke: e.target.value })} /></label>
          <label className="mini-field">Title card<input type="color" value={s.caption.accent} onChange={(e) => setCap({ accent: e.target.value })} /></label>
          <label className="check-row" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={s.caption.uppercase} onChange={(e) => setCap({ uppercase: e.target.checked })} /> <span>CAPS</span>
          </label>
        </div>
        <CaptionSample style={s} />
        <div className="row between" style={{ marginTop: 16 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(s)} disabled={!s.name.trim() || !s.look.trim() || !s.character.trim()}>Save style</button>
        </div>
      </div>
    </div>
  )
}
