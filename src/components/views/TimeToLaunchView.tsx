'use client'

import { useMemo } from 'react'
import type { Account } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SKU_COLORS: Record<string, string> = {
  essentials:          '#10b981',
  pro:                 '#1BB3BB',
  dispatch:            '#f59e0b',
  rail:                '#6b7280',
  exports:             '#3b82f6',
  uptimepm_core:       '#7757F5',
  uptimepm_pro:        '#6366f1',
  uptimepm_enterprise: '#4f46e5',
}
const SKU_LABELS: Record<string, string> = {
  essentials:          'Essentials',
  pro:                 'Pro',
  dispatch:            'Dispatch',
  rail:                'Rail',
  exports:             'Exports',
  uptimepm_core:       'UptimePM Core',
  uptimepm_pro:        'UptimePM Pro',
  uptimepm_enterprise: 'UptimePM Ent.',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysActive(account: Account) {
  return Math.max(1, Math.floor((Date.now() - new Date(account.created_at).getTime()) / 86400000))
}

function completionPct(account: Account) {
  const items = (account.milestones || []).flatMap(m => m.stages.flatMap(s => s.items))
  const req   = items.filter(i => i.required)
  if (!req.length) return 0
  const done  = req.filter(i => i.task_done || i.session_status === 'complete')
  return Math.round((done.length / req.length) * 100)
}

function isLaunched(account: Account) {
  // "Launched" = Go-Live milestone has a complete stage, or overall completion >= 100%
  const pct = completionPct(account)
  if (pct >= 100) return true
  const milestones = account.milestones || []
  const goLive = milestones.find(m => m.name.toLowerCase().includes('go') || m.name.toLowerCase().includes('launch'))
  return goLive ? goLive.stages.some(s => s.status === 'complete') : false
}

function milestoneSummary(account: Account) {
  return (account.milestones || []).map(m => {
    const items = m.stages.flatMap(s => s.items)
    const req   = items.filter(i => i.required)
    const done  = req.filter(i => i.task_done || i.session_status === 'complete')
    const pct   = req.length ? Math.round((done.length / req.length) * 100) : 0
    const allComplete = req.length > 0 && done.length === req.length
    const hasActive   = m.stages.some(s => s.status === 'active' || s.status === 'unlocked')
    const status: 'done' | 'active' | 'pending' = allComplete ? 'done' : hasActive ? 'active' : 'pending'
    return { name: m.name, pct, status }
  })
}

function currentStage(account: Account) {
  for (const m of account.milestones || []) {
    for (const s of m.stages) {
      if (s.status === 'active' || s.status === 'unlocked') return s.name
    }
  }
  return '—'
}

function mean(arr: number[]) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="ttl-stat-card" style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '20px 22px', flex: 1,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color: color || 'var(--accent)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{sub}</div>}
    </div>
  )
}

// Simple SVG line chart
function TrendChart({ data }: { data: { label: string; value: number }[] }) {
  const W = 580, H = 160, PAD = { t: 20, r: 20, b: 30, l: 40 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b

  if (data.length < 2) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: H, color: 'var(--text-4)', fontSize: 12 }}>
        Not enough data yet
      </div>
    )
  }

  const maxV = Math.max(...data.map(d => d.value))
  const minV = Math.min(...data.map(d => d.value))
  const range = maxV - minV || 1

  const pts = data.map((d, i) => ({
    x: PAD.l + (i / (data.length - 1)) * iw,
    y: PAD.t + ih - ((d.value - minV) / range) * ih,
    ...d,
  }))

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${PAD.t + ih} L ${pts[0].x} ${PAD.t + ih} Z`

  const improvement = data[0].value - data[data.length - 1].value
  const improved = improvement > 0

  return (
    <div style={{ position: 'relative' }}>
      {improved && (
        <div style={{
          position: 'absolute', top: 4, right: 0,
          fontSize: 10, fontWeight: 700, color: '#10b981',
          background: '#10b98115', border: '1px solid #10b98130',
          borderRadius: 99, padding: '2px 8px',
        }}>↓ {improvement}d improvement</div>
      )}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = PAD.t + ih * (1 - f)
          const v = Math.round(minV + f * range)
          return (
            <g key={f}>
              <line x1={PAD.l} y1={y} x2={PAD.l + iw} y2={y} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-3)">{v}d</text>
            </g>
          )
        })}
        {/* Area fill */}
        <path d={areaD} fill="url(#trendGrad)" opacity={0.3} />
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Line */}
        <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots + labels */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth={2} />
            <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill="var(--text-2)" fontWeight={600}>{p.value}d</text>
            <text x={p.x} y={PAD.t + ih + 16} textAnchor="middle" fontSize={9} fill="var(--text-3)">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// SVG scatter: ARR (x) vs days (y)
function ScatterChart({ points }: { points: { label: string; arr: number; days: number; sku: string; launched: boolean }[] }) {
  const W = 580, H = 280, PAD = { t: 20, r: 20, b: 40, l: 50 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b

  const maxArr  = Math.max(...points.map(p => p.arr),  10000)
  const maxDays = Math.max(...points.map(p => p.days), 10)

  const arrTicks  = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxArr * f))
  const dayTicks  = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxDays * f))

  const fmt = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`

  if (points.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: H, color: 'var(--text-4)', fontSize: 12 }}>
        No account data yet
      </div>
    )
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {/* Grid */}
      {dayTicks.map(v => {
        const y = PAD.t + ih - (v / maxDays) * ih
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={PAD.l + iw} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-3)">{v}</text>
          </g>
        )
      })}
      {arrTicks.map(v => {
        const x = PAD.l + (v / maxArr) * iw
        return (
          <g key={v}>
            <line x1={x} y1={PAD.t} x2={x} y2={PAD.t + ih} stroke="var(--border)" strokeWidth={1} />
            <text x={x} y={PAD.t + ih + 14} textAnchor="middle" fontSize={9} fill="var(--text-3)">{fmt(v)}</text>
          </g>
        )
      })}
      {/* Axis labels */}
      <text x={PAD.l + iw / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-2)">ARR</text>
      <text x={12} y={PAD.t + ih / 2} textAnchor="middle" fontSize={10} fill="var(--text-2)" transform={`rotate(-90, 12, ${PAD.t + ih / 2})`}>Days</text>
      {/* Points */}
      {points.map((p, i) => {
        const x = PAD.l + ((p.arr || 0) / maxArr) * iw
        const y = PAD.t + ih - (p.days / maxDays) * ih
        const color = SKU_COLORS[p.sku] || '#6b7280'
        return (
          <g key={i}>
            <circle
              cx={x} cy={y} r={8}
              fill={p.launched ? color : 'none'}
              stroke={color}
              strokeWidth={2}
              opacity={0.85}
            />
            <title>{p.label} — {p.arr ? fmt(p.arr) : 'no ARR'} / {p.days}d</title>
          </g>
        )
      })}
    </svg>
  )
}

// Bottleneck bar
function BottleneckBar({ name, avgDays, maxDays, isBottleneck }: { name: string; avgDays: number; maxDays: number; isBottleneck: boolean }) {
  const pct = maxDays > 0 ? (avgDays / maxDays) * 100 : 0
  const color = isBottleneck ? '#10b981' : '#1BB3BB'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--text)', minWidth: 130, flexShrink: 0 }}>{name}</span>
      <div style={{ flex: 1, background: 'var(--bg-surface2)', borderRadius: 4, height: 28, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 10, minWidth: 60 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{avgDays}d avg</span>
        </div>
      </div>
      {isBottleneck && (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: '#ef444415', border: '1px solid #ef444430', borderRadius: 4, padding: '2px 7px', flexShrink: 0 }}>bottleneck</span>
      )}
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

interface Props {
  accounts: Account[]
  onSelectAccount: (a: Account) => void
}

export function TimeToLaunchView({ accounts, onSelectAccount }: Props) {
  const data = useMemo(() => {
    const enriched = accounts.map(a => ({
      account: a,
      launched: isLaunched(a),
      days: daysActive(a),
      pct: completionPct(a),
      arr: a.arr || 0,
      stage: currentStage(a),
      milestones: milestoneSummary(a),
    }))

    const launched  = enriched.filter(e => e.launched)
    const active    = enriched.filter(e => !e.launched)

    // Avg days to launch (from launched accounts)
    const avgDays   = launched.length ? mean(launched.map(e => e.days)) : null
    // Fastest launch
    const fastest   = launched.length ? launched.reduce((a, b) => a.days < b.days ? a : b) : null

    // 6-month trend: group launched accounts by creation month, avg days
    const now = new Date()
    const monthBuckets: Record<string, number[]> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = d.toLocaleDateString('en-US', { month: 'short' })
      monthBuckets[key] = []
    }
    for (const e of launched) {
      const created = new Date(e.account.created_at)
      const key = created.toLocaleDateString('en-US', { month: 'short' })
      if (key in monthBuckets) monthBuckets[key].push(e.days)
    }
    // Also include active accounts by their current day count grouped by creation month
    for (const e of active) {
      const created = new Date(e.account.created_at)
      const key = created.toLocaleDateString('en-US', { month: 'short' })
      if (key in monthBuckets && e.pct > 0) monthBuckets[key].push(e.days)
    }
    const trendData = Object.entries(monthBuckets)
      .map(([label, vals]) => ({ label, value: vals.length ? mean(vals) : null }))
      .filter(d => d.value !== null) as { label: string; value: number }[]

    // Scatter points
    const scatter = enriched.map(e => ({
      label: e.account.name,
      arr: e.arr,
      days: e.days,
      sku: e.account.sku,
      launched: e.launched,
    }))

    // Bottleneck: per milestone name, collect days spent (estimated as pct * total_days / 100)
    const milestoneMap: Record<string, number[]> = {}
    for (const e of enriched) {
      for (const m of e.milestones) {
        if (!milestoneMap[m.name]) milestoneMap[m.name] = []
        const estDays = Math.round((m.pct / 100) * e.days)
        if (estDays > 0) milestoneMap[m.name].push(estDays)
      }
    }
    const bottleneckData = Object.entries(milestoneMap)
      .map(([name, vals]) => ({ name, avgDays: mean(vals) }))
      .filter(d => d.avgDays > 0)
      .sort((a, b) => b.avgDays - a.avgDays)

    const maxBottleneck = bottleneckData.length ? bottleneckData[0].avgDays : 1

    // Per account rows sorted by days desc
    const rows = [...enriched].sort((a, b) => b.days - a.days)

    return { launched, active, avgDays, fastest, trendData, scatter, bottleneckData, maxBottleneck, rows }
  }, [accounts])

  const skus = Array.from(new Set(accounts.map(a => a.sku)))

  return (
    <div className="ttl-wrap" style={{ padding: '24px 28px', maxWidth: 1280 }}>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-h)', marginBottom: 3 }}>Time To Launch</h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Onboarding velocity across your book of business</p>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="ttl-stats" style={{ display: 'flex', gap: 12, marginBottom: 20, marginTop: 20 }}>
        <StatCard
          label="Avg. Total Days"
          value={data.avgDays ?? '—'}
          sub="days to launch"
          color="var(--accent)"
        />
        <StatCard
          label="Active Accounts"
          value={data.active.length}
          sub="in progress"
          color="#7757F5"
        />
        <StatCard
          label="Launched"
          value={data.launched.length}
          sub="all time"
          color="#10b981"
        />
        <StatCard
          label="Fastest Launch"
          value={data.fastest ? `${data.fastest.days}d` : '—'}
          sub={data.fastest ? data.fastest.account.name : 'no launches yet'}
          color="#f59e0b"
        />
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="ttl-charts" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Trend */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Avg. Days to Launch — 6-Month Trend
          </div>
          <TrendChart data={data.trendData} />
        </div>

        {/* Scatter */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              ARR vs. Days to Launch
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {skus.map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-3)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: SKU_COLORS[s] || '#6b7280' }} />
                  {SKU_LABELS[s] || s}
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-3)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid var(--text-3)' }} />
                Active
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--text-3)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-3)' }} />
                Launched
              </div>
            </div>
          </div>
          <ScatterChart points={data.scatter} />
        </div>
      </div>

      {/* ── Bottleneck analysis ─────────────────────────────────────────────── */}
      {data.bottleneckData.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Avg. Days Per Milestone — Bottleneck Analysis
          </div>
          {data.bottleneckData.map((b, i) => (
            <BottleneckBar
              key={b.name}
              name={b.name}
              avgDays={b.avgDays}
              maxDays={data.maxBottleneck}
              isBottleneck={i === 0}
            />
          ))}
          {data.bottleneckData.length > 1 && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>
              <strong style={{ color: 'var(--text-2)' }}>{data.bottleneckData[0].name}</strong> is your biggest drag — averaging {data.bottleneckData[0].avgDays}d. Consider splitting it or adding async setup tasks.
            </p>
          )}
        </div>
      )}

      {/* ── Per account table ───────────────────────────────────────────────── */}
      <div className="ttl-table" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Per Account Detail</span>
        </div>

        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 100px 160px 70px 1fr',
          padding: '8px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface2)',
        }}>
          {['Account', 'Started', 'Stage', 'Days', 'Milestone Breakdown'].map(h => (
            <span key={h} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {data.rows.map(({ account, days, stage, milestones }, i) => (
          <div
            key={account.id}
            onClick={() => onSelectAccount(account)}
            style={{
              display: 'grid', gridTemplateColumns: '2fr 100px 160px 70px 1fr',
              padding: '11px 20px', borderBottom: i < data.rows.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>{account.name}</span>

            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {new Date(account.created_at).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-')}
            </span>

            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{stage}</span>

            <span style={{ fontSize: 13, fontWeight: 700, color: days > 60 ? '#ef4444' : days > 30 ? '#f59e0b' : 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {days}d
            </span>

            {/* Milestone pills */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {milestones.map((m, mi) => {
                const color = m.status === 'done' ? '#10b981' : m.status === 'active' ? '#f59e0b' : 'var(--border-b)'
                const textColor = m.status === 'done' ? '#10b981' : m.status === 'active' ? '#f59e0b' : 'var(--text-4)'
                return m.status === 'active' ? (
                  <span key={mi} style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 4,
                    background: color + '20', border: `1px solid ${color}50`, color: textColor,
                    fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                  }}>{m.pct}d</span>
                ) : (
                  <div key={mi} style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: m.status === 'done' ? color : 'none',
                    border: `1.5px solid ${color}`,
                  }} title={m.name} />
                )
              })}
            </div>
          </div>
        ))}

        {accounts.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            No accounts yet
          </div>
        )}
      </div>
    </div>
  )
}
