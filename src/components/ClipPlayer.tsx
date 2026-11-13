import { useRef, useState } from 'react'
import type { Clip } from '../types'
import { useStore } from '../store'
import { fmtDuration } from '../utils'
import { newMediaId, putBlob, useClipVideo } from '../media'

const RATIO: Record<Clip['aspectRatio'], string> = {
  '9:16': '9 / 16',
  '1:1': '1 / 1',
  '16:9': '16 / 9',
}

const CHECKLIST = [
  'Hook lands in the first 2 seconds',
  'Framing matches the target ratio, full-bleed',
  'No competitor logo or watermark',
  'Captions are legible on a phone',
  'There’s a clear payoff / reason to finish',
]

/**
 * Native HTML5 video player for validating a clip before it goes out. Load the
 * rendered clip (upload a file or point it at a hosted URL), watch it in the
 * right aspect-ratio frame with the hook overlaid, run the checklist, and mark
 * it validated — a real status that gates scheduling.
 */
export function ClipPlayer({ clip: opened, onClose }: { clip: Clip; onClose: () => void }) {
  const { clips, updateClip } = useStore()
  // Follow the live clip so changes made here (attach, validate) show immediately.
  const clip = clips.find((c) => c.id === opened.id) ?? opened
  const videoRef = useRef<HTMLVideoElement>(null)
  const [urlDraft, setUrlDraft] = useState(clip.mediaId ? '' : (clip.videoUrl ?? ''))
  const [showHook, setShowHook] = useState(true)
  const [checks, setChecks] = useState<boolean[]>(() => CHECKLIST.map(() => false))
  const [error, setError] = useState(false)

  // Plays the copy saved on this device when there is one, else the clip's URL.
  const { src } = useClipVideo(clip)

  // An attached file is saved on this device and becomes the clip's video.
  const onFile = async (file: File | undefined) => {
    if (!file) return
    const id = newMediaId()
    await putBlob(id, file)
    updateClip(clip.id, { localMediaId: id, mediaId: undefined, videoUrl: undefined, validated: false, validatedAt: undefined })
    setUrlDraft('')
    setError(false)
  }

  const saveUrl = () => {
    const u = urlDraft.trim()
    if (!u) return
    updateClip(clip.id, { videoUrl: u, localMediaId: undefined, mediaId: undefined })
    setError(false)
  }

  const passed = checks.filter(Boolean).length
  const setValidated = (v: boolean) =>
    updateClip(clip.id, { validated: v, validatedAt: v ? new Date().toISOString() : undefined })

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal player-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ marginBottom: 2 }}>Validate clip</h2>
            <p className="muted" style={{ fontSize: 13, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {clip.title}
            </p>
          </div>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>

        <div className="player-grid">
          <div>
            <div className="player-stage">
              <div className="player-frame" style={{ aspectRatio: RATIO[clip.aspectRatio] }}>
                {src && !error ? (
                  <video
                    key={src}
                    ref={videoRef}
                    src={src}
                    poster={clip.thumb}
                    controls
                    playsInline
                    onError={() => setError(true)}
                  />
                ) : (
                  <div className="player-empty">
                    <div style={{ fontSize: 34, marginBottom: 8 }}>🎬</div>
                    <div style={{ fontWeight: 600 }}>{error ? 'Couldn’t load that video' : 'No video loaded'}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                      {error ? 'Check the URL/format, or upload a file.' : 'Upload a file or paste a URL →'}
                    </div>
                  </div>
                )}
                {showHook && clip.hook && src && !error && (
                  <div className="player-hook">{clip.hook}</div>
                )}
              </div>
            </div>
            <div className="row between" style={{ marginTop: 10 }}>
              <span className="badge">{clip.aspectRatio} · {fmtDuration(clip.durationSec)}</span>
              <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={showHook} onChange={(e) => setShowHook(e.target.checked)} />
                Overlay hook
              </label>
            </div>
          </div>

          <div className="stack" style={{ gap: 16 }}>
            <div>
              <div className="field-label">Load clip video</div>
              <label className="btn sm" style={{ justifyContent: 'center', width: '100%' }}>
                ⬆ Upload a file
                <input
                  type="file"
                  accept="video/*"
                  style={{ display: 'none' }}
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </label>
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <input
                  className="player-input"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://…/clip.mp4"
                />
                <button className="btn sm" onClick={saveUrl}>Save</button>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                The file is saved on this device and becomes this clip’s video (what Publish sends out).
              </div>
            </div>

            <div>
              <div className="field-label">Review checklist</div>
              <div className="stack" style={{ gap: 6 }}>
                {CHECKLIST.map((item, i) => (
                  <label key={i} className="check-row">
                    <input
                      type="checkbox"
                      checked={checks[i]}
                      onChange={(e) =>
                        setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))
                      }
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {passed}/{CHECKLIST.length} checks
              </div>
            </div>

            {clip.validated ? (
              <div className="stack" style={{ gap: 8 }}>
                <span className="badge published" style={{ alignSelf: 'flex-start' }}>✓ Validated</span>
                <button className="btn ghost sm danger" style={{ alignSelf: 'flex-start' }} onClick={() => setValidated(false)}>
                  Undo validation
                </button>
              </div>
            ) : (
              <button
                className="btn primary"
                disabled={!src || error}
                title={!src ? 'Load a video first' : passed < CHECKLIST.length ? 'You can validate before every box is ticked' : ''}
                onClick={() => setValidated(true)}
              >
                Mark validated →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
