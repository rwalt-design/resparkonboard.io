'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface InfraData {
  data_uploaded?: boolean
  users_added?: boolean
  hardware_hooked_up?: boolean
  accounting_integration?: boolean
  compliance_integration?: boolean
  reports_ready?: boolean
  crv_hifive?: boolean
}

interface ComfortEntry {
  score: number
  retrain?: boolean
}

interface Submission {
  id: string
  account: string
  slug: string
  submitted_at: string
  overall_score: number
  modules: { dispatch?: boolean; facility?: boolean; export?: boolean; brokerage?: boolean }
  infra: InfraData
  comfort: Record<string, ComfortEntry>
  specialist: string
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMFORT_LABELS: Record<string, { label: string; module: string }> = {
  d_add_jobs:      { label: 'Adding jobs',                                         module: 'Dispatch' },
  d_recurring:     { label: 'Setting recurring jobs',                               module: 'Dispatch' },
  d_custom_jobs:   { label: 'Adding custom jobs',                                   module: 'Dispatch' },
  d_track_assets:  { label: 'Tracking assets',                                      module: 'Dispatch' },
  d_add_assets:    { label: 'Adding assets',                                        module: 'Dispatch' },
  d_driver_app:    { label: "Drivers' comfort with the driver app",                 module: 'Dispatch' },
  f_tickets:       { label: 'Creating inbound and outbound tickets',                module: 'Facility' },
  f_accounts:      { label: 'Creating accounts (suppliers, companies, etc.)',       module: 'Facility' },
  f_po_so:         { label: 'Creating purchase orders and sales orders',            module: 'Facility' },
  f_inventory:     { label: 'Doing inventory adjustments',                          module: 'Facility' },
  f_arap:          { label: 'Managing AR/AP',                                       module: 'Facility' },
  f_voiding:       { label: 'Voiding transactions',                                 module: 'Facility' },
  f_payments:      { label: 'Marking payments as confirmed or received',            module: 'Facility' },
  f_cash_drawers:  { label: 'Cash drawers, safes, and banks',                       module: 'Facility' },
  f_price_lists:   { label: 'Price lists',                                          module: 'Facility' },
  f_settings:      { label: 'Facility settings (users, materials, documents, locations)', module: 'Facility' },
  e_workflows:     { label: 'Export workflows',                                     module: 'Export' },
  b_workflows:     { label: 'Brokerage workflows',                                  module: 'Brokerage' },
}

const MODULE_COLORS: Record<string, string> = {
  Dispatch:  '#1BB3BB',
  Facility:  '#7757F5',
  Export:    '#f59e0b',
  Brokerage: '#10b981',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function infraOk(infra: InfraData): boolean {
  return Object.values(infra).every(v => v !== false)
}

function isReady(sub: Submission): boolean {
  return sub.overall_score >= 4.0 && infraOk(sub.infra)
}

function hasRetrain(sub: Submission): boolean {
  return Object.values(sub.comfort).some(c => c.retrain === true)
}

function scoreColor(score: number): string {
  if (score >= 4) return '#10b981'
  if (score >= 3) return '#f59e0b'
  return '#ef4444'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateFull(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Trend Chart ─────────────────────────────────────────────────────────────

function TrendChart({ submissions }: { submissions: Submission[] }) {
  const sorted = [...submissions]
    .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
    .slice(-20)

  if (sorted.length < 2) {
    return (
      <div style={{
        height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-ui)',
        border: '1px dashed var(--border)', borderRadius: 8,
      }}>
        Not enough data for trend
      </div>
    )
  }

  const W = 600
  const H = 80
  const PAD = { top: 10, right: 16, bottom: 28, left: 28 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const minScore = 1
  const maxScore = 5

  const pts = sorted.map((s, i) => ({
    x: PAD.left + (i / (sorted.length - 1)) * chartW,
    y: PAD.top + chartH - ((s.overall_score - minScore) / (maxScore - minScore)) * chartH,
    score: s.overall_score,
    date: s.submitted_at,
  }))

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')

  // Pick label indices: first, last, and a few in between
  const labelIdxs = new Set<number>()
  labelIdxs.add(0)
  labelIdxs.add(sorted.length - 1)
  if (sorted.length > 4) {
    labelIdxs.add(Math.floor(sorted.length / 3))
    labelIdxs.add(Math.floor((2 * sorted.length) / 3))
  }

  // Grid lines at scores 2, 3, 4
  const gridScores = [2, 3, 4]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      aria-label="Comfort score trend"
    >
      {/* Grid lines */}
      {gridScores.map(gs => {
        const gy = PAD.top + chartH - ((gs - minScore) / (maxScore - minScore)) * chartH
        return (
          <g key={gs}>
            <line
              x1={PAD.left} y1={gy} x2={PAD.left + chartW} y2={gy}
              stroke="var(--border)" strokeWidth={0.8} strokeDasharray="3 3"
            />
            <text x={PAD.left - 5} y={gy + 4} fontSize={8} fill="var(--text-3)" textAnchor="end" fontFamily="var(--font-ui)">{gs}</text>
          </g>
        )
      })}

      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="#1BB3BB"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Area fill under line */}
      <polygon
        points={`${pts[0].x},${PAD.top + chartH} ${polyline} ${pts[pts.length - 1].x},${PAD.top + chartH}`}
        fill="#1BB3BB"
        fillOpacity={0.08}
      />

      {/* Dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#1BB3BB" stroke="var(--bg-surface)" strokeWidth={1.5}>
          <title>{`${formatDate(p.date)}: ${p.score.toFixed(1)}`}</title>
        </circle>
      ))}

      {/* X-axis labels */}
      {pts.map((p, i) =>
        labelIdxs.has(i) ? (
          <text
            key={i}
            x={p.x} y={H - 4}
            fontSize={8} fill="var(--text-3)"
            textAnchor="middle" fontFamily="var(--font-ui)"
          >
            {formatDate(p.date)}
          </text>
        ) : null
      )}
    </svg>
  )
}

// ─── Score Bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, max = 5 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100)
  const color = scoreColor(score)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
      <div style={{
        flex: 1, height: 5, background: 'var(--bg-surface2)', borderRadius: 99, overflow: 'hidden',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color, fontFamily: 'var(--font-ui)', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>
        {score.toFixed(1)}
      </span>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div style={{
      flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-ui)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-h)', fontFamily: 'var(--font-ui)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-ui)', marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PerformanceView() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data, error: err } = await supabase
        .from('onb_submissions')
        .select('*')
        .order('submitted_at', { ascending: false })

      if (err) {
        setError(err.message)
      } else {
        setSubmissions((data ?? []) as Submission[])
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived metrics ──────────────────────────────────────────────────────

  const avgScore = submissions.length
    ? submissions.reduce((s, r) => s + (r.overall_score ?? 0), 0) / submissions.length
    : 0

  const readyCount = submissions.filter(isReady).length
  const retrainCount = submissions.filter(hasRetrain).length

  // Aggregate comfort scores across all submissions
  const comfortAgg: Record<string, { total: number; count: number }> = {}
  for (const sub of submissions) {
    for (const [key, entry] of Object.entries(sub.comfort ?? {})) {
      if (!comfortAgg[key]) comfortAgg[key] = { total: 0, count: 0 }
      comfortAgg[key].total += entry.score ?? 0
      comfortAgg[key].count += 1
    }
  }

  const comfortAvgs = Object.entries(comfortAgg)
    .filter(([key]) => COMFORT_LABELS[key])
    .map(([key, { total, count }]) => ({
      key,
      avg: total / count,
      count,
      ...COMFORT_LABELS[key],
    }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 8)

  const recent = submissions.slice(0, 10)

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
        Error loading submissions: {error}
      </div>
    )
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (submissions.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', padding: '0 24px' }}>
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '40px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>↗</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-h)', fontFamily: 'var(--font-ui)', marginBottom: 10 }}>
            No readiness data yet
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-ui)', lineHeight: 1.6 }}>
            Performance metrics flow in automatically from Go-Live Readiness form submissions.
            Once clients complete their pre-launch assessments, comfort scores, infrastructure
            readiness, and module breakdowns will appear here.
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-ui)', background: 'var(--bg-surface2)', borderRadius: 6, padding: '8px 14px', display: 'inline-block' }}>
            The <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>onb_submissions</code> table is currently empty.
          </div>
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-h)', fontFamily: 'var(--font-ui)' }}>
          Go-Live Readiness
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-ui)' }}>
          Submission data from pre-launch readiness assessments
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <KpiCard
          label="Avg Comfort Score"
          value={
            <span style={{ color: scoreColor(avgScore) }}>
              {avgScore.toFixed(1)}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-3)', marginLeft: 2 }}> / 5.0</span>
            </span>
          }
          sub={`across ${submissions.length} submission${submissions.length !== 1 ? 's' : ''}`}
        />
        <KpiCard
          label="Ready for Go-Live"
          value={<span style={{ color: readyCount > 0 ? '#10b981' : 'var(--text-h)' }}>{readyCount}</span>}
          sub="score ≥ 4.0 and no infra failures"
        />
        <KpiCard
          label="Needs Retraining"
          value={<span style={{ color: retrainCount > 0 ? '#f59e0b' : 'var(--text-h)' }}>{retrainCount}</span>}
          sub="at least one topic flagged for retrain"
        />
      </div>

      {/* Trend chart */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '16px 20px', marginBottom: 24,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', fontFamily: 'var(--font-ui)', marginBottom: 12 }}>
          Score trend
          <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>last {Math.min(20, submissions.length)} submissions</span>
        </div>
        <TrendChart submissions={submissions} />
      </div>

      {/* Two-column lower section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24, alignItems: 'start' }}>

        {/* Lowest comfort scores */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', fontFamily: 'var(--font-ui)', marginBottom: 14 }}>
            Lowest comfort scores
            <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>bottom 8 topics</span>
          </div>
          {comfortAvgs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-ui)' }}>No comfort data yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {comfortAvgs.map(({ key, label, module, avg, count }) => (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                      background: MODULE_COLORS[module] + '22',
                      color: MODULE_COLORS[module],
                      fontFamily: 'var(--font-ui)', letterSpacing: '0.03em',
                      flexShrink: 0,
                    }}>
                      {module.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-ui)', flex: 1, lineHeight: 1.3 }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-ui)', flexShrink: 0 }}>
                      {count}
                    </span>
                  </div>
                  <ScoreBar score={avg} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent submissions */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', fontFamily: 'var(--font-ui)', marginBottom: 14 }}>
            Recent submissions
            <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>last 10</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-ui)' }}>
            <thead>
              <tr>
                {['Account', 'Score', 'Ready', 'Date'].map(h => (
                  <th key={h} style={{
                    fontSize: 10, color: 'var(--text-3)', fontWeight: 600,
                    textAlign: h === 'Score' || h === 'Ready' || h === 'Date' ? 'center' : 'left',
                    padding: '0 6px 8px', letterSpacing: '0.04em', textTransform: 'uppercase',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((sub, i) => {
                const ready = isReady(sub)
                return (
                  <tr
                    key={sub.id}
                    style={{
                      borderBottom: i < recent.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <td style={{ padding: '8px 6px', fontSize: 12, color: 'var(--text)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sub.account || sub.slug}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: scoreColor(sub.overall_score ?? 0) }}>
                        {(sub.overall_score ?? 0).toFixed(1)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                        background: ready ? '#10b98120' : '#ef444420',
                        color: ready ? '#10b981' : '#ef4444',
                        fontFamily: 'var(--font-ui)',
                      }}>
                        {ready ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {formatDateFull(sub.submitted_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
