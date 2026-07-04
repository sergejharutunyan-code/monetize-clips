import { useState } from 'react'
import type { Clip, AspectRatio } from '../types'
import { NICHES, HASHTAG_BANK } from '../data'
import { useStore } from '../store'

const emptyDraft = () => ({
  title: '',
  sourceTitle: '',
  sourceCreator: '',
  rights: 'owned' as Clip['rights'],
  hook: '',
  caption: '',
  hashtags: [...HASHTAG_BANK.base.slice(0, 3)],
  niche: NICHES[0] as string,
  durationSec: 30,
  aspectRatio: '9:16' as AspectRatio,
  status: 'idea' as Clip['status'],
  videoUrl: '',
})

export function ClipModal({ existing, onClose }: { existing?: Clip; onClose: () => void }) {
  const { addClip, updateClip } = useStore()
  const [d, setD] = useState(existing ? { ...existing } : emptyDraft())
  const [tagInput, setTagInput] = useState('')

  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((p) => ({ ...p, [k]: v }))

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^#*/, '')
    if (!tag) return
    const withHash = `#${tag}`
    if (!d.hashtags.includes(withHash)) set('hashtags', [...d.hashtags, withHash])
    setTagInput('')
  }

  const save = () => {
    if (!d.title.trim()) return
    if (existing) {
      updateClip(existing.id, d)
    } else {
      const { title, sourceTitle, sourceCreator, rights, hook, caption, hashtags, niche, durationSec, aspectRatio, status, videoUrl } = d
      addClip({ title, sourceTitle, sourceCreator, rights, hook, caption, hashtags, niche, durationSec, aspectRatio, status, videoUrl: videoUrl || undefined })
    }
    onClose()
  }

  const suggested = (HASHTAG_BANK[d.niche] ?? []).filter((h) => !d.hashtags.includes(h))

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{existing ? 'Edit clip' : 'New clip'}</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 18 }}>
          Track a clip from source video through to published post.
        </p>

        <div className="field">
          <label>Clip title</label>
          <input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. The line that broke the internet" autoFocus />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Source video</label>
            <input value={d.sourceTitle} onChange={(e) => set('sourceTitle', e.target.value)} placeholder="Original long-form title" />
          </div>
          <div className="field">
            <label>Source creator / channel</label>
            <input value={d.sourceCreator} onChange={(e) => set('sourceCreator', e.target.value)} placeholder="Who made the original" />
          </div>
        </div>

        <div className="field">
          <label>Rights &amp; clearance</label>
          <select value={d.rights} onChange={(e) => set('rights', e.target.value as Clip['rights'])}>
            <option value="owned">I own this content</option>
            <option value="licensed">Licensed / stock</option>
            <option value="permission">Creator gave permission</option>
            <option value="unverified">Not verified yet</option>
          </select>
          {d.rights === 'unverified' && (
            <span style={{ fontSize: 12, color: 'var(--critical)' }}>
              Reuploading others’ content without rights risks takedowns, demonetization, and account bans. Clear rights before publishing.
            </span>
          )}
        </div>

        <div className="field">
          <label>Hook (first 1–3 seconds)</label>
          <input value={d.hook} onChange={(e) => set('hook', e.target.value)} placeholder="The scroll-stopping opening line" />
        </div>

        <div className="field">
          <label>Clip video URL (optional)</label>
          <input value={d.videoUrl ?? ''} onChange={(e) => set('videoUrl', e.target.value)} placeholder="https://…/clip.mp4 — play it in the Validate tab" />
        </div>

        <div className="field">
          <label>Caption</label>
          <textarea value={d.caption} onChange={(e) => set('caption', e.target.value)} placeholder="Caption text for the post" />
        </div>

        <div className="field">
          <label>Hashtags</label>
          <div className="chips" style={{ marginBottom: 8 }}>
            {d.hashtags.map((h) => (
              <span key={h} className="chip tag">
                {h}
                <button onClick={() => set('hashtags', d.hashtags.filter((x) => x !== h))}>×</button>
              </span>
            ))}
          </div>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addTag(tagInput)
              }
            }}
            placeholder="Type a tag and press Enter"
          />
          {suggested.length > 0 && (
            <div className="chips" style={{ marginTop: 8 }}>
              {suggested.slice(0, 6).map((h) => (
                <button key={h} className="chip" onClick={() => set('hashtags', [...d.hashtags, h])}>
                  + {h}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field-row">
          <div className="field">
            <label>Niche</label>
            <select value={d.niche} onChange={(e) => set('niche', e.target.value)}>
              {NICHES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={d.status} onChange={(e) => set('status', e.target.value as Clip['status'])}>
              <option value="idea">Idea</option>
              <option value="editing">Editing</option>
              <option value="ready">Ready</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Duration (seconds)</label>
            <input
              type="number"
              min={1}
              value={d.durationSec}
              onChange={(e) => set('durationSec', Math.max(1, Number(e.target.value) || 0))}
            />
          </div>
          <div className="field">
            <label>Aspect ratio</label>
            <select value={d.aspectRatio} onChange={(e) => set('aspectRatio', e.target.value as AspectRatio)}>
              <option value="9:16">9:16 (vertical)</option>
              <option value="1:1">1:1 (square)</option>
              <option value="16:9">16:9 (landscape)</option>
            </select>
          </div>
        </div>

        <div className="row between" style={{ marginTop: 22 }}>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!d.title.trim()}>
            {existing ? 'Save changes' : 'Add clip'}
          </button>
        </div>
      </div>
    </div>
  )
}
