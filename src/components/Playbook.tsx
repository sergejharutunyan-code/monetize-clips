import { useStore } from '../store'

export function Playbook() {
  const { resetDemo, clearAll, clips } = useStore()

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Playbook</h1>
          <p className="page-desc">
            The operating model behind clip-and-distribute, and the rules that keep the accounts alive.
          </p>
        </div>
      </div>

      <div className="callout" style={{ marginBottom: 16 }}>
        <strong>Do this legally.</strong> Reuploading other people’s videos verbatim is copyright infringement and violates
        every platform’s terms — it leads to takedowns, demonetization, and permanent bans. Build a real business on content
        you <em>own</em>, have <em>licensed</em>, or have <em>written permission</em> to use — and transform it (your edit,
        commentary, captions, translation) so it’s additive, not a copy. The Rights field on every clip is there to force this
        decision before you publish.
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad prose">
          <h3>The core loop</h3>
          <div className="stack" style={{ gap: 12 }}>
            {STEPS.map((s, i) => (
              <div key={i} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                <span className="step-num">{i + 1}</span>
                <div>
                  <div style={{ fontWeight: 650, fontSize: 14 }}>{s.title}</div>
                  <div className="muted" style={{ fontSize: 13.5 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad prose">
            <h3>What actually pays</h3>
            <ul>
              <li><strong>Volume × consistency.</strong> One good edit reposted natively to 3 platforms is 3 shots at the algorithm. Daily beats sporadic.</li>
              <li><strong>The first 2 seconds.</strong> Retention is the whole game. A strong hook and a reason to watch till the end drive every payout.</li>
              <li><strong>Native packaging.</strong> Re-export per platform (no visible watermarks), tune captions and hashtags, post in-app.</li>
              <li><strong>Own the niche.</strong> A consistent theme trains the algorithm and compounds a followable identity.</li>
            </ul>
          </div>

          <div className="card card-pad prose">
            <h3>Where the money comes from</h3>
            <ul>
              <li><strong>Creator funds:</strong> TikTok Creator Rewards, YouTube Shorts revenue share, Instagram bonuses (region/invite dependent).</li>
              <li><strong>Off-platform:</strong> this is usually the bigger prize — sponsorships, affiliate links, driving traffic to a product, newsletter, or channel you own.</li>
              <li><strong>Licensing:</strong> if you produce original viral clips, you can license them out.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="card card-pad prose" style={{ marginTop: 16 }}>
        <h3>Staying compliant</h3>
        <div className="grid grid-3">
          <div>
            <strong style={{ fontSize: 13.5 }}>Rights first</strong>
            <p style={{ fontSize: 13 }}>Own it, license it, or get written permission. Fair-use is narrow and not a shield for reposting whole clips.</p>
          </div>
          <div>
            <strong style={{ fontSize: 13.5 }}>Transform it</strong>
            <p style={{ fontSize: 13 }}>Add commentary, editing, captions, or analysis. Platforms down-rank and demonetize unoriginal re-uploads.</p>
          </div>
          <div>
            <strong style={{ fontSize: 13.5 }}>Disclose &amp; credit</strong>
            <p style={{ fontSize: 13 }}>Tag original creators, mark sponsorships and AI-generated content, and follow each platform’s disclosure rules.</p>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3 className="card-title">Data</h3>
          <span className="card-hint">{clips.length} clips stored locally in your browser</span>
        </div>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>
          Everything you enter lives in this browser’s local storage — no account, no server. Export by copying from the
          library, or reset below.
        </p>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn" onClick={() => confirm('Reload the demo dataset? This replaces your current clips.') && resetDemo()}>
            Reload demo data
          </button>
          <button className="btn danger" onClick={() => confirm('Delete all clips? This cannot be undone.') && clearAll()}>
            Clear all data
          </button>
        </div>
      </div>
    </>
  )
}

const STEPS = [
  { title: 'Source', body: 'Pull from content you own or have cleared — your own long-form, licensed footage, or a creator who gave permission.' },
  { title: 'Clip', body: 'Cut the 15–60s moment with the strongest hook. One long video yields many clips.' },
  { title: 'Package', body: 'Add captions, a hook overlay, and a payoff. Re-export vertical (9:16), watermark-free.' },
  { title: 'Distribute', body: 'Post natively to TikTok, Instagram Reels, and YouTube Shorts. Stagger release times.' },
  { title: 'Measure', body: 'Track views, retention, and payout per platform. Double down on what hits.' },
  { title: 'Compound', body: 'Feed winners back into the next batch. Consistency trains the algorithm and grows a followable identity.' },
]
