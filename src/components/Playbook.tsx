import { useStore } from '../store'

const STEPS = [
  { title: 'Trend', body: 'Pick a topic people are searching for or arguing about this week. The trend is the topic, never someone else’s footage.' },
  { title: 'Plot', body: 'One question in the first two seconds, one change per scene, a payoff at the end. 30–60 seconds, about 2.5 spoken words per second.' },
  { title: 'Generate', body: 'Every Higgsfield prompt repeats the same style and host description, so clips made separately still look like one show.' },
  { title: 'Assemble', body: 'Your voice (or one consistent voice) over the clips, captions burned in, title card up front.' },
  { title: 'Publish', body: 'Same video natively on TikTok, Reels and Shorts; stagger the times and label it as AI-generated where asked.' },
  { title: 'Learn', body: 'Keep the formats that hold attention, drop the ones that do not, and keep the host and style fixed so people recognize you.' },
]

export function Playbook() {
  const { clearAll, clips } = useStore()

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Playbook</h1>
          <p className="page-desc">How to run a channel of original animated shorts — and the rules that keep it safe to monetize.</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad prose">
          <h3>The loop</h3>
          <div className="stack" style={{ gap: 12 }}>
            {STEPS.map((s, i) => (
              <div key={s.title} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
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
            <h3>What makes these videos work</h3>
            <ul>
              <li><strong>A recognizable host.</strong> One character, one look, one voice, in every video. That is the “distinctive style” people follow.</li>
              <li><strong>The first two seconds.</strong> Open on the question or the moment it goes wrong — not on an intro.</li>
              <li><strong>Say it, show it, caption it.</strong> Narration tells the story; the picture acts it out; the caption adds the punchline or the number.</li>
              <li><strong>Variety inside the format.</strong> Rotate stories, how-tos, explainers and myth-busters so the feed does not look mass-produced.</li>
            </ul>
          </div>
          <div className="card card-pad prose">
            <h3>Where the money comes from</h3>
            <ul>
              <li><strong>Creator programs:</strong> YouTube Partner Program (Shorts revenue share), TikTok Creator Rewards (videos over one minute), Instagram bonuses where offered.</li>
              <li><strong>Off-platform:</strong> sponsorships and affiliate links fit how-tos and explainers naturally.</li>
              <li><strong>The character itself:</strong> an original host can become merch, a series or a licensed asset — because you own it.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="card card-pad prose" style={{ marginTop: 16 }}>
        <h3>Staying original and monetizable</h3>
        <div className="grid grid-3">
          <div>
            <strong style={{ fontSize: 13.5 }}>Original by design</strong>
            <p style={{ fontSize: 13 }}>
              No real people, brands, logos or franchise characters, and no “in the style of” a studio or artist — the prompts and the style editor steer away from all of them.
              Stories are fictional composites, never a retelling of someone’s post.
            </p>
          </div>
          <div>
            <strong style={{ fontSize: 13.5 }}>Label AI content</strong>
            <p style={{ fontSize: 13 }}>
              Turn on TikTok’s AI-generated label and Instagram’s AI info. YouTube asks about realistic altered content — cartoons usually do not need it, but disclose anything that could pass as real.
            </p>
          </div>
          <div>
            <strong style={{ fontSize: 13.5 }}>Not “mass-produced”</strong>
            <p style={{ fontSize: 13 }}>
              YouTube does not pay for repetitive, low-effort or mass-produced videos. Your own voice, a real point of view, accurate facts and varied formats are what keep a channel eligible.
            </p>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Also check your Higgsfield plan allows commercial use, and fact-check how-tos and explainers before posting — the Studio’s fact notes flag what to look at.
        </p>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3 className="card-title">Data</h3>
          <span className="card-hint">{clips.length} videos stored in this browser</span>
        </div>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>
          Videos, saved trends, styles, clip files and voiceovers live in this browser. Connect a backend in Accounts to keep a copy in an account.
        </p>
        <button className="btn danger" onClick={() => confirm('Delete all videos from this browser? This cannot be undone.') && clearAll()}>
          Clear all videos
        </button>
      </div>
    </>
  )
}
