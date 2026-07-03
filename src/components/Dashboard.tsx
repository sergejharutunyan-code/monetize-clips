import { useStore } from '../store'
import { totals, byPlatform, clipRollup, revenueTrend } from '../metrics'
import { PLATFORM_META } from '../data'
import { fmtNum, fmtMoney, fmtDate } from '../utils'
import { BarChart, HBars } from './charts'
import type { Clip } from '../types'

export function Dashboard({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { clips } = useStore()
  const t = totals(clips)
  const platforms = byPlatform(clips)
  const top = clipRollup(clips).filter((r) => r.views > 0).slice(0, 5)
  const trend = revenueTrend(clips, 14)
  const pipeline = clips.filter((c) => c.status !== 'published')

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-desc">
            Your clip-to-cash pipeline across TikTok, Instagram, and YouTube — at a glance.
          </p>
        </div>
        <button className="btn primary" onClick={() => onNavigate('library')}>
          + New clip
        </button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Est. revenue" value={fmtMoney(t.revenue)} delta="from published clips" color="var(--series-2)" up />
        <StatTile label="Total views" value={fmtNum(t.views)} delta={`${t.published} live posts`} color="var(--series-1)" />
        <StatTile label="Avg. engagement" value={`${t.engagement}%`} delta="likes + comments + shares" color="var(--series-4)" />
        <StatTile label="In pipeline" value={`${pipeline.length}`} delta={`${t.scheduled} scheduled`} color="var(--series-3)" />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Revenue — last 14 days</h3>
            <span className="card-hint">est. USD by publish date</span>
          </div>
          <BarChart data={trend} color="var(--series-2)" prefix="$" valueFmt={(n) => n.toFixed(2)} />
        </div>
        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Revenue by platform</h3>
            <span className="card-hint">published clips</span>
          </div>
          <HBars
            data={platforms.map((p) => ({ label: p.label, value: p.revenue, color: p.color }))}
            prefix="$"
            valueFmt={(n) => n.toFixed(2)}
          />
          <div style={{ marginTop: 16 }} className="callout info">
            RPM assumptions — TikTok ${PLATFORM_META.tiktok.rpm}, Instagram ${PLATFORM_META.instagram.rpm}, YouTube $
            {PLATFORM_META.youtube.rpm} per 1K views. Tune these to your real payouts.
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Top performing clips</h3>
            <button className="btn ghost sm" onClick={() => onNavigate('analytics')}>
              View analytics →
            </button>
          </div>
          {top.length === 0 ? (
            <div className="empty">No published clips yet.</div>
          ) : (
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Clip</th>
                    <th className="num">Views</th>
                    <th className="num">Est. $</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((r) => (
                    <tr key={r.clip.id}>
                      <td>
                        <div className="clip-title">{r.clip.title}</div>
                        <div className="clip-source">{r.clip.niche}</div>
                      </td>
                      <td className="num">{fmtNum(r.views)}</td>
                      <td className="num">{fmtMoney(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Pipeline</h3>
            <button className="btn ghost sm" onClick={() => onNavigate('scheduler')}>
              Open scheduler →
            </button>
          </div>
          {pipeline.length === 0 ? (
            <div className="empty">Pipeline clear — everything is published.</div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {pipeline.slice(0, 6).map((c) => (
                <PipelineRow key={c.id} clip={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function StatTile({
  label,
  value,
  delta,
  color,
  up,
}: {
  label: string
  value: string
  delta: string
  color: string
  up?: boolean
}) {
  return (
    <div className="card stat">
      <div className="stat-label">
        <span className="stat-dot" style={{ background: color }} />
        {label}
      </div>
      <div className="stat-value">{value}</div>
      <div className={`stat-delta ${up ? 'up' : ''}`}>{delta}</div>
    </div>
  )
}

function PipelineRow({ clip }: { clip: Clip }) {
  return (
    <div className="row between">
      <div style={{ minWidth: 0 }}>
        <div className="clip-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {clip.title}
        </div>
        <div className="clip-source">
          {clip.sourceCreator} · added {fmtDate(clip.createdAt)}
        </div>
      </div>
      <span className={`badge ${clip.status}`}>{clip.status}</span>
    </div>
  )
}
