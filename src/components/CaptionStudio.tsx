import { useMemo, useState } from 'react'
import { NICHES, HASHTAG_BANK, HOOK_FORMULAS, PLATFORM_META, PLATFORMS } from '../data'
import type { Platform } from '../types'

// Platform-specific packaging rules of thumb.
const PLATFORM_RULES: Record<Platform, { tagCount: number; ctaStyle: string }> = {
  tiktok: { tagCount: 5, ctaStyle: 'Follow for part 2 🔥' },
  instagram: { tagCount: 8, ctaStyle: 'Save this for later 📌 · Follow @youraccount' },
  youtube: { tagCount: 4, ctaStyle: 'Subscribe for daily clips ▶' },
}

export function CaptionStudio() {
  const [topic, setTopic] = useState('this clip')
  const [niche, setNiche] = useState<string>(NICHES[0])
  const [formulaIdx, setFormulaIdx] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)

  const hook = useMemo(() => {
    const tpl = HOOK_FORMULAS[formulaIdx].template
    return tpl
      .replaceAll('{subject}', topic)
      .replaceAll('{topic}', topic)
      .replaceAll('{adjective}', 'unbelievable')
      .replaceAll('{action}', 'blew up')
  }, [formulaIdx, topic])

  const tags = useMemo(() => {
    const bank = [...HASHTAG_BANK.base, ...(HASHTAG_BANK[niche] ?? [])]
    return bank
  }, [niche])

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400)
    })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Caption Studio</h1>
          <p className="page-desc">
            Generate a hook, caption, and platform-tuned hashtag set. Same clip, packaged natively for each feed.
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Inputs</h3>
          </div>
          <div className="field">
            <label>What’s the clip about?</label>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. the half-court buzzer beater" />
          </div>
          <div className="field">
            <label>Niche</label>
            <select value={niche} onChange={(e) => setNiche(e.target.value)}>
              {NICHES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Hook formula</label>
            <select value={formulaIdx} onChange={(e) => setFormulaIdx(Number(e.target.value))}>
              {HOOK_FORMULAS.map((f, i) => (
                <option key={f.label} value={i}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="card-head" style={{ marginTop: 6, marginBottom: 8 }}>
            <h3 className="card-title" style={{ fontSize: 13 }}>On-screen hook</h3>
          </div>
          <div className="gen-output row between" style={{ alignItems: 'flex-start' }}>
            <span>{hook}</span>
            <button className="btn ghost sm" onClick={() => copy(hook, 'hook')}>
              {copied === 'hook' ? '✓' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="stack">
          {PLATFORMS.map((pl) => {
            const rule = PLATFORM_RULES[pl]
            const tagSet = tags.slice(0, rule.tagCount).join(' ')
            const full = `${hook}\n\n${rule.ctaStyle}\n\n${tagSet}`
            return (
              <div key={pl} className="card card-pad">
                <div className="card-head">
                  <h3 className="card-title">
                    <span
                      style={{
                        display: 'inline-grid',
                        placeItems: 'center',
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        background: PLATFORM_META[pl].color,
                        color: '#fff',
                        fontSize: 11,
                        marginRight: 8,
                        verticalAlign: 'middle',
                      }}
                    >
                      {PLATFORM_META[pl].glyph}
                    </span>
                    {PLATFORM_META[pl].label}
                  </h3>
                  <button className="btn ghost sm" onClick={() => copy(full, pl)}>
                    {copied === pl ? '✓ Copied' : 'Copy caption'}
                  </button>
                </div>
                <div className="gen-output">{full}</div>
                <div className="card-hint" style={{ marginTop: 8 }}>
                  {PLATFORM_META[pl].note}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
