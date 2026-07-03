import { useStore } from '../store'
import { byPlatform, clipRollup, revenueTrend, totals } from '../metrics'
import { PLATFORM_META } from '../data'
import { fmtNum, fmtMoney } from '../utils'
import { BarChart, Donut } from './charts'

export function Analytics() {
  const { clips } = useStore()
  const t = totals(clips)
  const platforms = byPlatform(clips)
  const rollup = clipRollup(clips).filter((r) => r.views > 0)
  const trend = revenueTrend(clips, 14)
  const shareData = platforms
    .filter((p) => p.views > 0)
    .map((p) => ({ label: p.label, value: p.views, color: p.color }))

  const topViews = rollup.slice(0, 7).map((r, i) => ({
    label: r.clip.title.length > 22 ? r.clip.title.slice(0, 20) + '…' : r.clip.title,
    value: r.views,
    color: `var(--series-${(i % 7) + 1})`,
  }))

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-desc">Where the views and payouts are coming from. Estimates use your per-platform RPM.</p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Mini label="Views" value={fmtNum(t.views)} color="var(--series-1)" />
        <Mini label="Est. revenue" value={fmtMoney(t.revenue)} color="var(--series-2)" />
        <Mini label="Live posts" value={`${t.published}`} color="var(--series-4)" />
        <Mini label="Engagement" value={`${t.engagement}%`} color="var(--series-3)" />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">View share by platform</h3>
          </div>
          {shareData.length === 0 ? (
            <div className="empty">No views yet.</div>
          ) : (
            <>
              <Donut data={shareData} />
              <div className="legend" style={{ marginTop: 18, justifyContent: 'center' }}>
                {shareData.map((d) => (
                  <span key={d.label} className="lg">
                    <span className="sw" style={{ background: d.color }} />
                    {d.label} · {fmtNum(d.value)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <h3 className="card-title">Revenue trend</h3>
            <span className="card-hint">last 14 days</span>
          </div>
          <BarChart data={trend} color="var(--series-2)" prefix="$" valueFmt={(n) => n.toFixed(2)} />
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3 className="card-title">Views by clip</h3>
        </div>
        {topViews.length === 0 ? (
          <div className="empty">Publish a clip to see performance.</div>
        ) : (
          <BarChart data={topViews} color="var(--series-1)" height={220} />
        )}
      </div>

      <div className="card card-pad">
        <div className="card-head">
          <h3 className="card-title">Platform breakdown</h3>
          <span className="card-hint">table view</span>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Platform</th>
                <th className="num">Posts</th>
                <th className="num">Views</th>
                <th className="num">RPM</th>
                <th className="num">Est. revenue</th>
              </tr>
            </thead>
            <tbody>
              {platforms.map((p) => (
                <tr key={p.platform}>
                  <td>
                    <span className="badge">
                      <span className="swatch" style={{ background: p.color }} />
                      {p.label}
                    </span>
                  </td>
                  <td className="num">{p.posts}</td>
                  <td className="num">{fmtNum(p.views)}</td>
                  <td className="num">${PLATFORM_META[p.platform].rpm.toFixed(2)}</td>
                  <td className="num">{fmtMoney(p.revenue)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                <td className="num">{platforms.reduce((s, p) => s + p.posts, 0)}</td>
                <td className="num">{fmtNum(platforms.reduce((s, p) => s + p.views, 0))}</td>
                <td className="num">—</td>
                <td className="num">{fmtMoney(platforms.reduce((s, p) => s + p.revenue, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card stat">
      <div className="stat-label">
        <span className="stat-dot" style={{ background: color }} />
        {label}
      </div>
      <div className="stat-value" style={{ fontSize: 26 }}>
        {value}
      </div>
    </div>
  )
}
