import { useState } from 'react'
import { fmtNum } from '../utils'

interface Tip {
  x: number
  y: number
  label: string
  value: string
}

/** Single-series vertical bar chart with hover tooltips and direct value labels. */
export function BarChart({
  data,
  color = 'var(--series-1)',
  height = 200,
  valueFmt = fmtNum,
  prefix = '',
}: {
  data: { label: string; value: number }[]
  color?: string
  height?: number
  valueFmt?: (n: number) => string
  prefix?: string
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const w = 640
  const padL = 8
  const padR = 8
  const padB = 26
  const padT = 14
  const plotH = height - padB - padT
  const max = Math.max(1, ...data.map((d) => d.value))
  const n = data.length
  const slot = (w - padL - padR) / n
  const barW = Math.min(38, slot * 0.6)

  return (
    <div className="chart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${height}`} role="img">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={padL}
            x2={w - padR}
            y1={padT + plotH * (1 - g)}
            y2={padT + plotH * (1 - g)}
            stroke="var(--grid)"
            strokeWidth={1}
          />
        ))}
        {data.map((d, i) => {
          const bh = (d.value / max) * plotH
          const x = padL + slot * i + (slot - barW) / 2
          const y = padT + plotH - bh
          return (
            <g key={i}>
              <rect
                x={x}
                y={padT}
                width={barW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() =>
                  setTip({
                    x: x + barW / 2,
                    y,
                    label: d.label,
                    value: prefix + valueFmt(d.value),
                  })
                }
                onMouseLeave={() => setTip(null)}
              />
              <rect x={x} y={y} width={barW} height={Math.max(0, bh)} rx={4} fill={color} />
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" className="tick">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      {tip && <ChartTip tip={tip} w={w} />}
    </div>
  )
}

/** Horizontal categorical bars — one entity per row, direct-labeled. */
export function HBars({
  data,
  prefix = '',
  valueFmt = fmtNum,
}: {
  data: { label: string; value: number; color: string }[]
  prefix?: string
  valueFmt?: (n: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="chart" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map((d, i) => (
        <div key={i}>
          <div className="row between" style={{ marginBottom: 5 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{d.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {prefix}
              {valueFmt(d.value)}
            </span>
          </div>
          <div style={{ height: 10, background: 'var(--surface-2)', borderRadius: 5 }}>
            <div
              style={{
                width: `${(d.value / max) * 100}%`,
                height: '100%',
                background: d.color,
                borderRadius: 5,
                minWidth: 4,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Donut with center total. Legend is rendered by the caller. */
export function Donut({
  data,
  size = 168,
}: {
  data: { label: string; value: number; color: string }[]
  size?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const r = size / 2
  const stroke = 26
  const rad = r - stroke / 2
  const circ = 2 * Math.PI * rad
  let offset = 0

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {data.map((d, i) => {
          const frac = d.value / total
          const dash = frac * circ
          const seg = (
            <circle
              key={i}
              cx={r}
              cy={r}
              r={rad}
              fill="none"
              stroke={d.color}
              strokeWidth={active === i ? stroke + 4 : stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              style={{ transition: 'stroke-width 0.12s' }}
            />
          )
          offset += dash
          return seg
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {active === null ? fmtNum(total) : fmtNum(data[active].value)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {active === null ? 'total' : data[active].label}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChartTip({ tip, w }: { tip: Tip; w: number }) {
  const leftPct = (tip.x / w) * 100
  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        top: 0,
        transform: 'translate(-50%, -4px)',
        background: 'var(--text-primary)',
        color: 'var(--surface)',
        padding: '5px 9px',
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 600,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: 'var(--shadow)',
      }}
    >
      {tip.label}: {tip.value}
    </div>
  )
}
