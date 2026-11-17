import { useState } from 'react'
import type { Clip } from '../types'
import { useStore } from '../store'

/** Edit a video's post details: title, caption, hashtags, stage. */
export function ClipModal({ existing, onClose }: { existing: Clip; onClose: () => void }) {
  const { updateClip } = useStore()
  const [title, setTitle] = useState(existing.title)
  const [caption, setCaption] = useState(existing.caption)
  const [tags, setTags] = useState(existing.hashtags.join(' '))
  const [status, setStatus] = useState(existing.status)

  const save = () => {
    if (!title.trim()) return
    updateClip(existing.id, {
      title: title.trim(),
      caption,
      hashtags: tags.split(/[\s,]+/).filter(Boolean).map((h) => `#${h.replace(/^#+/, '')}`),
      status,
    })
    onClose()
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Video details">
        <h2>Video details</h2>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="cm-title">Title</label>
          <input id="cm-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="cm-caption">Caption</label>
          <textarea id="cm-caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} />
        </div>
        <div className="field">
          <label htmlFor="cm-tags">Hashtags</label>
          <input id="cm-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#sleep #howto" />
        </div>
        <div className="field">
          <label htmlFor="cm-status">Stage</label>
          <select id="cm-status" value={status} onChange={(e) => setStatus(e.target.value as Clip['status'])}>
            {['idea', 'scripted', 'generating', 'editing', 'ready', 'scheduled', 'published'].map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="row between" style={{ marginTop: 18 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={!title.trim()}>Save</button>
        </div>
      </div>
    </div>
  )
}
