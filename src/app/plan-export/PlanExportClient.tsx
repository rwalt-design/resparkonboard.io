'use client'

const SKU_LABELS: Record<string, string> = {
  essentials:          'Essentials',
  pro:                 'Pro',
  dispatch:            'Dispatch',
  rail:                'Rail',
  exports:             'Exports',
  uptimepm_core:       'UptimePM Core',
  uptimepm_pro:        'UptimePM Pro',
  uptimepm_enterprise: 'UptimePM Enterprise',
}
const ADDON_LABELS: Record<string, string> = {
  brokerage: 'Brokerage',
  export: 'Export Compliance',
  api: 'API',
}
const STATUS_COLORS: Record<string, string> = {
  pending: '#94a3b8',
  sent: '#1BB3BB',
  received: '#f59e0b',
  complete: '#10b981',
}
const STATUS_BG: Record<string, string> = {
  pending: '#f1f5f9',
  sent: '#E0F7F8',
  received: '#fef3c7',
  complete: '#d1fae5',
}
const STATUS_TEXT_COLOR: Record<string, string> = {
  pending: '#94a3b8',
  sent: '#007580',
  received: '#92400e',
  complete: '#065f46',
}

type Item = {
  id: string
  type: string
  required: boolean
  task_name?: string
  task_assignee?: string
  task_done?: boolean
  session_name?: string
  session_status?: string
}

type Stage = {
  id: string
  name: string
  status: string
  items: Item[]
}

type Milestone = {
  id: string
  name: string
  stages: Stage[]
}

type Request = {
  id: string
  label: string
  status: string
}

type Contact = {
  id: string
  name: string
  role?: string
  email?: string
}

type Account = {
  id: string
  name: string
  sku: string
  addons: string[]
  arr: number
  contacts: Contact[]
  requests: Request[]
  milestones: Milestone[]
}

function isCustomerItem(item: Item): boolean {
  if (item.type === 'task') return item.task_assignee === 'customer'
  if (item.type === 'session') return true
  return false
}

function statusBadge(status: string) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
      background: STATUS_BG[status] || '#f1f5f9',
      color: STATUS_TEXT_COLOR[status] || '#94a3b8',
      fontFamily: '"DM Mono", monospace', textTransform: 'capitalize' as const,
    }}>{status}</span>
  )
}

export function PlanExportClient({ account }: { account: Account }) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const skuLabel = SKU_LABELS[account.sku] || account.sku
  const addonLabels = (account.addons || []).map(a => ADDON_LABELS[a] || a).join(', ')

  // Count customer-facing items
  const allItems = (account.milestones || []).flatMap(m =>
    m.stages.flatMap(s => s.items.filter(isCustomerItem))
  )
  const totalRequired = allItems.filter(i => i.required).length
  const doneRequired = allItems.filter(i => i.required && (i.task_done || i.session_status === 'complete')).length
  const totalPct = totalRequired ? Math.round((doneRequired / totalRequired) * 100) : 0

  // Compute active milestone/stage for header
  let currentStage = ''
  for (const m of account.milestones || []) {
    for (const s of m.stages) {
      if (s.status === 'active' || s.status === 'unlocked') {
        currentStage = s.name; break
      }
    }
    if (currentStage) break
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --accent: #1BB3BB; --text: #1e293b; --muted: #64748b;
          --dim: #94a3b8; --border: #e2e8f0; --bg: #f8fafc; --surface: #ffffff;
          --mono: 'DM Mono', monospace; --ui: 'Inter', system-ui, sans-serif;
        }
        body { font-family: var(--ui); color: var(--text); background: var(--bg); font-size: 13px; line-height: 1.5; }
        @media print {
          body { background: white; font-size: 11px; }
          .no-print { display: none !important; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
      `}</style>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 40px 60px', fontFamily: '"Inter", system-ui, sans-serif' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, paddingBottom: 20, borderBottom: '2px solid #1BB3BB' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'linear-gradient(135deg, #1BB3BB, #007580)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: '#fff', fontFamily: '"DM Mono", monospace',
              }}>ob</div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.02em' }}>
                onboard<span style={{ color: '#1BB3BB' }}>.io</span>
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{account.name}</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                <strong style={{ color: '#1e293b' }}>{skuLabel}</strong>
                {addonLabels ? ` + ${addonLabels}` : ''}
              </span>
              {account.arr > 0 && (
                <span style={{ fontSize: 12, color: '#64748b' }}>ARR <strong style={{ color: '#1e293b' }}>${account.arr.toLocaleString()}</strong></span>
              )}
              {currentStage && (
                <span style={{ fontSize: 12, color: '#64748b' }}>Stage <strong style={{ color: '#1e293b' }}>{currentStage}</strong></span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8', fontFamily: '"DM Mono", monospace' }}>
            Generated {today}<br />
            <span style={{ color: '#1BB3BB', fontWeight: 600 }}>{totalPct}% complete</span>
          </div>
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Checklist</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1BB3BB', fontFamily: '"DM Mono", monospace' }}>{totalPct}%</div>
            <div style={{ background: '#e2e8f0', borderRadius: 99, height: 6, overflow: 'hidden', margin: '6px 0 4px' }}>
              <div style={{ width: `${totalPct}%`, height: '100%', borderRadius: 99, background: totalPct >= 75 ? '#10b981' : totalPct >= 40 ? '#1BB3BB' : '#f59e0b' }} />
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{doneRequired} of {totalRequired} items complete</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Milestones</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1BB3BB', fontFamily: '"DM Mono", monospace' }}>{(account.milestones || []).length}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {(account.milestones || []).filter(m => m.stages.every(s => s.status === 'complete')).length} complete
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Contacts</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1BB3BB', fontFamily: '"DM Mono", monospace' }}>{(account.contacts || []).length}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{(account.contacts || []).map(c => c.name).join(', ') || '—'}</div>
          </div>
        </div>

        {/* Contacts */}
        {(account.contacts || []).length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #e2e8f0' }}>Contacts</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {account.contacts.map(c => (
                <div key={c.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.name}</div>
                  {c.role && <div style={{ fontSize: 11, color: '#64748b' }}>{c.role}</div>}
                  {c.email && <div style={{ fontSize: 11, color: '#1BB3BB', fontFamily: '"DM Mono", monospace', marginTop: 3 }}>{c.email}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Requests */}
        {(account.requests || []).length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #e2e8f0' }}>Documents &amp; Requests</div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              {account.requests.map((r, idx) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px',
                  borderBottom: idx < account.requests.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: STATUS_COLORS[r.status] || '#e2e8f0' }} />
                  <span style={{ fontSize: 12, color: '#1e293b', flex: 1 }}>{r.label}</span>
                  {statusBadge(r.status)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plan — customer items only */}
        <div style={{ marginBottom: 8 }}>
          {(account.milestones || []).map((milestone, mi) => {
            const stageBlocks = milestone.stages
              .map(stage => {
                const customerItems = stage.items.filter(isCustomerItem)
                if (customerItems.length === 0) return null
                const stageDone = customerItems.filter(i => i.required && (i.task_done || i.session_status === 'complete')).length
                const stageTotal = customerItems.filter(i => i.required).length
                const stageStatusColor = stage.status === 'complete' ? '#065f46' : stage.status === 'active' ? '#007580' : '#94a3b8'
                const stageStatusBg = stage.status === 'complete' ? '#d1fae5' : stage.status === 'active' ? '#E0F7F8' : '#f1f5f9'

                return (
                  <div key={stage.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#fafafa' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', flex: 1 }}>{stage.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4, background: stageStatusBg, color: stageStatusColor, fontFamily: '"DM Mono", monospace', textTransform: 'capitalize' }}>{stage.status}</span>
                      {stageTotal > 0 && <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: '"DM Mono", monospace' }}>{stageDone}/{stageTotal}</span>}
                    </div>
                    {customerItems.map(item => {
                      if (item.type === 'task') {
                        return (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 16px 7px 32px', borderBottom: '1px solid #f8fafc' }}>
                            <div style={{
                              width: 14, height: 14, borderRadius: 3, flexShrink: 0, marginTop: 1,
                              border: item.task_done ? 'none' : '1.5px solid #cbd5e1',
                              background: item.task_done ? '#10b981' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {item.task_done && <span style={{ fontSize: 8, color: 'white', fontWeight: 700 }}>✓</span>}
                            </div>
                            <span style={{ fontSize: 12, color: item.task_done ? '#94a3b8' : '#1e293b', textDecoration: item.task_done ? 'line-through' : 'none', flex: 1 }}>{item.task_name}</span>
                            {!item.required && <span style={{ fontSize: 10, color: '#94a3b8' }}>optional</span>}
                          </div>
                        )
                      }
                      if (item.type === 'session') {
                        return (
                          <div key={item.id} style={{ padding: '8px 16px 8px 32px', borderBottom: '1px solid #f8fafc' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                                border: item.session_status === 'complete' ? 'none' : '1.5px solid #cbd5e1',
                                background: item.session_status === 'complete' ? '#10b981' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {item.session_status === 'complete' && <span style={{ fontSize: 8, color: 'white', fontWeight: 700 }}>✓</span>}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{item.session_name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '0 5px', borderRadius: 3, background: '#E0F7F8', color: '#007580', fontFamily: '"DM Mono", monospace' }}>session</span>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })}
                  </div>
                )
              })
              .filter(Boolean)

            if (stageBlocks.length === 0) return null

            const milestoneCustomerItems = milestone.stages.flatMap(s => s.items.filter(isCustomerItem))
            const mDone = milestoneCustomerItems.filter(i => i.required && (i.task_done || i.session_status === 'complete')).length
            const mTotal = milestoneCustomerItems.filter(i => i.required).length
            const mPct = mTotal ? Math.round((mDone / mTotal) * 100) : 0
            const mColor = mPct === 100 ? '#10b981' : mPct > 0 ? '#1BB3BB' : '#94a3b8'

            return (
              <div key={milestone.id} style={{ marginBottom: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{mi + 1}. {milestone.name}</div>
                    {mTotal > 0 && (
                      <div style={{ background: '#e2e8f0', borderRadius: 99, height: 4, width: 120, overflow: 'hidden', marginTop: 5 }}>
                        <div style={{ width: `${mPct}%`, height: '100%', background: mColor, borderRadius: 99 }} />
                      </div>
                    )}
                  </div>
                  {mTotal > 0 && <span style={{ fontSize: 11, color: '#64748b', fontFamily: '"DM Mono", monospace' }}>{mDone}/{mTotal} · {mPct}%</span>}
                </div>
                {stageBlocks}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Generated by onboard.io</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{account.name} · {today}</span>
        </div>
      </div>

      {/* Print button */}
      <button
        className="no-print"
        onClick={() => window.print()}
        style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#1BB3BB', color: 'white', border: 'none',
          borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: '"Inter", system-ui', boxShadow: '0 4px 16px rgba(27,179,187,0.4)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ⬇ Save as PDF
      </button>
    </>
  )
}
