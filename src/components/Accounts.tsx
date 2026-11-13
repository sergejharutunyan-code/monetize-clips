import { useState } from 'react'
import type { Platform } from '../types'
import { PLATFORMS, PLATFORM_META } from '../data'
import { useBackend, useConnections } from '../backend/hooks'
import { connectUrl, disconnect, isSignedIn } from '../backend/api'
import { copyText } from '../publish'
import { AccountSync } from './AccountSync'
import { PlatformIcon } from './bits'

const NEEDS: Record<Platform, { account: string; app: string; limits: string }> = {
  youtube: {
    account: 'A Google account with a YouTube channel.',
    app: 'A Google Cloud project with “YouTube Data API v3” enabled and an OAuth client (Web application).',
    limits: 'Until Google verifies the project, API uploads are locked to private — you can flip them to public in YouTube Studio.',
  },
  instagram: {
    account: 'An Instagram professional account (Business or Creator — free to switch in the app).',
    app: 'A Meta developer app with the Instagram product (“API setup with Instagram login”).',
    limits: 'In development mode it works for accounts added as testers on the app. Posting for other people needs Meta’s app review.',
  },
  tiktok: {
    account: 'A TikTok account.',
    app: 'A TikTok developer app with Login Kit and the Content Posting API.',
    limits: 'Until TikTok audits the app, direct posts can only be private (“Only me”). Sending drafts to your TikTok inbox works before the audit.',
  },
}

/** Backend sign-in plus the three platform connections. */
export function Accounts({ notice, onDismissNotice }: { notice: { ok: boolean; text: string } | null; onDismissNotice: () => void }) {
  const backend = useBackend()
  const signedIn = isSignedIn(backend)
  const { info, loading, error, reload } = useConnections()
  const [busy, setBusy] = useState<Platform | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState<Platform | null>(null)

  const connect = async (p: Platform) => {
    setBusy(p)
    setMsg(null)
    try {
      // Leaves the app for the platform's sign-in page, then comes back here.
      window.location.assign(await connectUrl(backend.apiUrl, backend.token, p, window.location.origin + window.location.pathname))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not start the connection.')
      setBusy(null)
    }
  }

  const drop = async (p: Platform) => {
    if (!confirm(`Disconnect ${PLATFORM_META[p].label}? Scheduled posts to it will fail until you reconnect.`)) return
    setBusy(p)
    setMsg(null)
    try {
      await disconnect(backend.apiUrl, backend.token, p)
      reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not disconnect.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-desc">
            Connect YouTube, Instagram and TikTok once, then publish every clip to all three from here.
          </p>
        </div>
      </div>

      {notice && (
        <div className={`callout ${notice.ok ? 'info' : ''}`} style={{ marginBottom: 16 }} role="status">
          <div className="row between">
            <span>{notice.text}</span>
            <button className="link-btn" onClick={onDismissNotice}>Dismiss</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <AccountSync />
      </div>

      <div className="card card-pad">
        <div className="card-head">
          <h3 className="card-title">Platforms</h3>
          <span className="card-hint">
            {!signedIn ? 'sign in to the backend first' : loading ? 'checking…' : info ? `${PLATFORMS.filter((p) => info.platforms[p].connected).length} of 3 connected` : ''}
          </span>
        </div>

        {!signedIn && (
          <div className="callout info" style={{ marginBottom: 14 }}>
            <strong>Posting straight from ClipForge needs the backend</strong> — it holds each platform’s app keys and does the uploading.
            Without it you can still cut clips and post them yourself: every clip’s Publish screen has <em>Share to an app</em> (on phones),
            Download, and links to each platform’s upload page.
          </div>
        )}
        {error && <div className="callout" style={{ marginBottom: 14 }}>{error} <button className="link-btn" onClick={reload}>Retry</button></div>}
        {msg && <div className="callout" style={{ marginBottom: 14 }} role="alert">{msg}</div>}
        {info && !info.server.ffmpeg && (
          <div className="callout" style={{ marginBottom: 14 }}>
            <strong>ffmpeg is missing on the backend.</strong> Clips cannot be converted to MP4, which Instagram requires (and TikTok prefers).
            Install ffmpeg on that machine or use the provided Dockerfile.
          </div>
        )}

        <div className="grid grid-3">
          {PLATFORMS.map((p) => {
            const c = info?.platforms[p]
            return (
              <div key={p} className="account-card">
                <div className="row between" style={{ marginBottom: 10 }}>
                  <div className="row" style={{ gap: 9 }}>
                    <PlatformIcon platform={p} size={28} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{PLATFORM_META[p].label}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {p === 'youtube' ? 'Shorts' : p === 'instagram' ? 'Reels' : 'Videos'}
                      </div>
                    </div>
                  </div>
                  {c?.connected ? (
                    <span className="badge post-published">connected</span>
                  ) : c?.configured ? (
                    <span className="badge">not connected</span>
                  ) : c ? (
                    <span className="badge post-failed">needs setup</span>
                  ) : null}
                </div>

                {c?.connected && (
                  <div style={{ fontSize: 13.5, marginBottom: 10 }}>
                    Posting as <strong>{c.account || 'your account'}</strong>
                  </div>
                )}

                <ul className="needs">
                  <li>{NEEDS[p].account}</li>
                  {!c?.connected && <li>{NEEDS[p].app}</li>}
                  <li>{NEEDS[p].limits}</li>
                </ul>

                {c && !c.configured && (
                  <div className="platform-note" style={{ marginBottom: 10 }}>
                    {c.setup} Step-by-step in <code>BACKEND.md</code>.
                  </div>
                )}
                {c && (
                  <div className="redirect-uri">
                    <div className="muted" style={{ fontSize: 11 }}>Redirect URI to register in the developer console</div>
                    <div className="row" style={{ gap: 6 }}>
                      <code>{c.redirectUri}</code>
                      <button className="link-btn" onClick={() => void copyText(c.redirectUri).then((ok) => ok && setCopied(p))}>
                        {copied === p ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                  {c?.connected ? (
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn sm" onClick={() => void connect(p)} disabled={busy !== null}>Reconnect</button>
                      <button className="btn sm ghost danger" onClick={() => void drop(p)} disabled={busy !== null}>Disconnect</button>
                    </div>
                  ) : (
                    <button className="btn primary sm" onClick={() => void connect(p)} disabled={!signedIn || !c?.configured || busy !== null}>
                      {busy === p ? 'Opening…' : `Connect ${PLATFORM_META[p].label}`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {info && (
          <div className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            Backend address the platforms see: <code>{info.server.publicUrl}</code>
            {!info.server.reachable && ' — not public HTTPS. YouTube sign-in works on localhost; Instagram and TikTok only redirect back to a public https:// address, so run the backend on a host (or behind a tunnel) and set CLIPFORGE_PUBLIC_URL.'}
          </div>
        )}
      </div>
    </>
  )
}
