'use client'

import { useState, useEffect, useCallback } from 'react'
import type { HardwareTask, ReportTask, ComplianceTask } from '@/types'

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
  ai_commercial:   'Commercial Agent',
  ai_operations:   'Operations Agent',
  ai_finance:      'Finance Agent',
  ai_dispatch:     'Dispatch Agent',
  supplier_portal: 'Supplier Portal',
  integrated_gl:   'Integrated GL',
  brokerage:       'Brokerage',
  crv_processing:  'CRV Processing',
  dispatch:        'Dispatch',
  rail:            'Rail',
  exports:         'Exports',
}

const HARDWARE_TYPE_LABELS: Record<string, string> = {
  floor_scale: 'Floor Scale',
  truck_scale: 'Truck Scale',
  camera:      'Camera',
  tablet:      'Tablet',
  other:       'Other',
}

const CATEGORY_LABELS: Record<string, string> = {
  government_upload:  'Gov Upload',
  regulatory_config:  'Regulatory',
  document_template:  'Doc Template',
  other:              'Other',
}

const REPORT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: '#6b7280' },
  in_progress:  { label: 'In Progress', color: '#f59e0b' },
  complete:     { label: 'Complete',    color: '#10b981' },
}

// Milestones to EXCLUDE from the client-facing export
const EXCLUDED_MILESTONE_NAMES = ['account creation', 'account setup']

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
  go_live_date?: string | null
  contacts: Contact[]
  milestones: Milestone[]
}

function isCustomerItem(item: Item): boolean {
  if (item.type === 'task') return item.task_assignee === 'customer'
  if (item.type === 'session') return true
  return false
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
        border: checked ? 'none' : '1.5px solid #cbd5e1',
        background: checked ? '#10b981' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {checked && <span style={{ fontSize: 9, color: 'white', fontWeight: 800, lineHeight: 1 }}>✓</span>}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

type Rep = { name: string; role: string; email: string }

export function PlanExportClient({
  account,
  hardwareTasks,
  reportTasks,
  complianceTasks,
  rep,
}: {
  account: Account
  hardwareTasks: HardwareTask[]
  reportTasks: ReportTask[]
  complianceTasks: ComplianceTask[]
  rep: Rep
}) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const storageKey = `respark-export-checks-${account.id}`

  // Client-side checkmarks — hydrated from localStorage
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) setChecked(JSON.parse(stored))
    } catch { /* ignore */ }
    setHydrated(true)
  }, [storageKey])

  const toggle = useCallback((id: string, defaultChecked: boolean) => {
    setChecked(prev => {
      const current = id in prev ? prev[id] : defaultChecked
      const next = { ...prev, [id]: !current }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [storageKey])

  const isChecked = (id: string, defaultChecked: boolean) =>
    hydrated ? (id in checked ? checked[id] : defaultChecked) : defaultChecked

  // Filter out excluded milestones
  const visibleMilestones = (account.milestones || []).filter(
    m => !EXCLUDED_MILESTONE_NAMES.includes(m.name.toLowerCase().trim())
  )

  const skuLabel = SKU_LABELS[account.sku] || account.sku
  const addonLabels = (account.addons || []).map(a => ADDON_LABELS[a] || a).join(', ')

  // Progress across plan items
  const allPlanItems = visibleMilestones.flatMap(m =>
    m.stages.flatMap(s => s.items.filter(isCustomerItem))
  )
  const planTotal = allPlanItems.filter(i => i.required).length
  const planDone = allPlanItems.filter(i => {
    if (!i.required) return false
    const def = i.type === 'task' ? !!i.task_done : i.session_status === 'complete'
    return isChecked(i.id, def)
  }).length
  const planPct = planTotal ? Math.round((planDone / planTotal) * 100) : 0

  const hwDone = hardwareTasks.filter(t => isChecked(`hw-${t.id}`, t.completed)).length
  const hwTotal = hardwareTasks.length

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, sans-serif; color: #1e293b; background: #f8fafc; font-size: 13px; line-height: 1.5; }
        @media print {
          body { background: white; font-size: 11px; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        .check-row:hover { background: #f8fafc !important; }
        .check-row:hover .check-box { border-color: #1BB3BB !important; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
      `}</style>

      <div style={{ maxWidth: 800, margin: '0 auto', fontFamily: '"Inter", system-ui, sans-serif' }}>

        {/* ─── COVER PAGE ────────────────────────────────────────────────── */}
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          padding: '60px 56px',
        }}>
          {/* Top bar */}
          <div style={{ marginBottom: 'auto' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-respark-light.svg" alt="ReSpark" style={{ height: 28, display: 'block' }} />
          </div>

          {/* Center content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0 }}>
            {/* Eyebrow */}
            <div style={{
              fontSize: 11, fontWeight: 700, color: '#1BB3BB',
              textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20,
              fontFamily: '"DM Mono", monospace',
            }}>
              Onboarding Transition Plan
            </div>

            {/* Main title */}
            <div style={{ fontSize: 42, fontWeight: 800, color: '#1e293b', lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 10 }}>
              {account.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40 }}>
              <div style={{ height: 2, width: 32, background: '#1BB3BB', borderRadius: 99 }} />
              <span style={{ fontSize: 18, fontWeight: 500, color: '#64748b', letterSpacing: '-0.01em' }}>ReSpark Transition</span>
            </div>

            {/* Go live date */}
            {account.go_live_date && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 12,
                background: '#E0F7F8', borderRadius: 10, padding: '14px 20px',
                alignSelf: 'flex-start', marginBottom: 48,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1BB3BB', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#007580', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Target Go-Live</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', fontFamily: '"DM Mono", monospace' }}>
                    {new Date(account.go_live_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rep contact info — bottom */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>{rep.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>{rep.role} · ReSpark</div>
              <div style={{ fontSize: 12, color: '#1BB3BB', fontFamily: '"DM Mono", monospace' }}>{rep.email}</div>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: '"DM Mono", monospace', textAlign: 'right' }}>
              Generated {today}
            </div>
          </div>
        </div>

        {/* ─── PAGE 1: PLAN ──────────────────────────────────────────────── */}
        <div className="page-break" style={{ padding: '40px 56px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, paddingBottom: 18, borderBottom: '2px solid #1BB3BB' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
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
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', marginBottom: 5 }}>{account.name}</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                <strong style={{ color: '#1e293b' }}>{skuLabel}</strong>
                {addonLabels ? ` + ${addonLabels}` : ''}
              </span>
              {account.arr > 0 && (
                <span style={{ fontSize: 12, color: '#64748b' }}>ARR <strong style={{ color: '#1e293b' }}>${account.arr.toLocaleString()}</strong></span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8', fontFamily: '"DM Mono", monospace' }}>
            {today}<br />
            <span style={{ color: '#1BB3BB', fontWeight: 600 }}>{planPct}% complete</span>
          </div>
        </div>

        {/* Contacts */}
        {(account.contacts || []).length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Contacts</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
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

        {/* Plan stages */}
        <SectionLabel>Onboarding Plan</SectionLabel>
        <div>
          {visibleMilestones.map((milestone, mi) => {
            const stageBlocks = milestone.stages
              .map(stage => {
                const items = stage.items.filter(isCustomerItem)
                if (items.length === 0) return null
                return (
                  <div key={stage.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', flex: 1 }}>{stage.name}</span>
                    </div>
                    {items.map(item => {
                      const defaultChecked = item.type === 'task' ? !!item.task_done : item.session_status === 'complete'
                      const itemChecked = isChecked(item.id, defaultChecked)
                      if (item.type === 'task') {
                        return (
                          <div
                            key={item.id}
                            className="check-row"
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 14px 7px 28px', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                            onClick={() => toggle(item.id, defaultChecked)}
                          >
                            <div className="check-box" style={{ marginTop: 1 }}>
                              <Checkbox checked={itemChecked} onChange={() => toggle(item.id, defaultChecked)} />
                            </div>
                            <span style={{ fontSize: 12, color: itemChecked ? '#94a3b8' : '#1e293b', textDecoration: itemChecked ? 'line-through' : 'none', flex: 1, userSelect: 'none' }}>
                              {item.task_name}
                            </span>
                            {!item.required && <span style={{ fontSize: 10, color: '#94a3b8' }}>optional</span>}
                          </div>
                        )
                      }
                      if (item.type === 'session') {
                        return (
                          <div
                            key={item.id}
                            className="check-row"
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px 7px 28px', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                            onClick={() => toggle(item.id, defaultChecked)}
                          >
                            <div className="check-box">
                              <Checkbox checked={itemChecked} onChange={() => toggle(item.id, defaultChecked)} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 500, color: itemChecked ? '#94a3b8' : '#1e293b', flex: 1, userSelect: 'none' }}>
                              {item.session_name}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '0 5px', borderRadius: 3, background: '#E0F7F8', color: '#007580', fontFamily: '"DM Mono", monospace' }}>session</span>
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

            const mItems = milestone.stages.flatMap(s => s.items.filter(isCustomerItem))
            const mDone = mItems.filter(i => {
              const def = i.type === 'task' ? !!i.task_done : i.session_status === 'complete'
              return isChecked(i.id, def)
            }).length
            const mTotal = mItems.length
            const mPct = mTotal ? Math.round((mDone / mTotal) * 100) : 0
            const mColor = mPct === 100 ? '#10b981' : mPct > 0 ? '#1BB3BB' : '#94a3b8'

            return (
              <div key={milestone.id} style={{ marginBottom: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{mi + 1}. {milestone.name}</div>
                    {mTotal > 0 && (
                      <div style={{ background: '#e2e8f0', borderRadius: 99, height: 3, width: 100, overflow: 'hidden', marginTop: 5 }}>
                        <div style={{ width: `${mPct}%`, height: '100%', background: mColor, borderRadius: 99 }} />
                      </div>
                    )}
                  </div>
                  {mTotal > 0 && <span style={{ fontSize: 11, color: '#64748b', fontFamily: '"DM Mono", monospace' }}>{mDone}/{mTotal}</span>}
                </div>
                {stageBlocks}
              </div>
            )
          })}
        </div>

        </div>{/* end plan page */}

        {/* ─── PAGE 2: HARDWARE ─────────────────────────────────────────── */}
        <div className="page-break" style={{ padding: '40px 56px 60px', borderTop: '2px solid #1BB3BB' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1BB3BB', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Hardware</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{account.name} — Hardware Checklist</div>
            </div>
            {hwTotal > 0 && (
              <span style={{ fontSize: 12, color: '#64748b', fontFamily: '"DM Mono", monospace' }}>{hwDone}/{hwTotal} complete</span>
            )}
          </div>

          {hardwareTasks.length === 0 ? (
            <div style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: '32px 24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No hardware items on record yet.
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 110px 160px 1fr', gap: '0 12px', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
                {['', 'Name', 'Type', 'Make / Model', 'Location'].map((h, i) => (
                  <div key={i} style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                ))}
              </div>
              {hardwareTasks.map((task, idx) => {
                const itemChecked = isChecked(`hw-${task.id}`, task.completed)
                return (
                  <div
                    key={task.id}
                    className="check-row"
                    style={{
                      display: 'grid', gridTemplateColumns: '32px 1fr 110px 160px 1fr',
                      gap: '0 12px', alignItems: 'center', padding: '9px 14px',
                      borderBottom: idx < hardwareTasks.length - 1 ? '1px solid #f1f5f9' : 'none',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggle(`hw-${task.id}`, task.completed)}
                  >
                    <div className="check-box">
                      <Checkbox checked={itemChecked} onChange={() => toggle(`hw-${task.id}`, task.completed)} />
                    </div>
                    <span style={{ fontSize: 12, color: itemChecked ? '#94a3b8' : '#1e293b', textDecoration: itemChecked ? 'line-through' : 'none', userSelect: 'none' }}>{task.name}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{HARDWARE_TYPE_LABELS[task.type] || task.type}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{task.make_model || '—'}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{task.location_label || '—'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── PAGE 3: REPORTING & COMPLIANCE ──────────────────────────── */}
        <div className="page-break" style={{ padding: '40px 56px 60px', borderTop: '2px solid #1BB3BB' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1BB3BB', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Reporting & Compliance</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{account.name} — Reports & Compliance</div>
          </div>

          {/* Reports */}
          <div style={{ marginBottom: 28 }}>
            <SectionLabel>Reports</SectionLabel>
            {reportTasks.length === 0 ? (
              <div style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No reports on record.
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 0.7fr 1fr 0.8fr', gap: '0 12px', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
                  {['', 'Legacy Report Name', 'Date Range', 'Purpose', 'Status'].map((h, i) => (
                    <div key={i} style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                  ))}
                </div>
                {reportTasks.map((task, idx) => {
                  const defaultChecked = task.status === 'complete'
                  const itemChecked = isChecked(`rpt-${task.id}`, defaultChecked)
                  const statusCfg = REPORT_STATUS_LABELS[task.status] || REPORT_STATUS_LABELS.not_started
                  return (
                    <div
                      key={task.id}
                      className="check-row"
                      style={{
                        display: 'grid', gridTemplateColumns: '32px 1fr 0.7fr 1fr 0.8fr',
                        gap: '0 12px', alignItems: 'center', padding: '9px 14px',
                        borderBottom: idx < reportTasks.length - 1 ? '1px solid #f1f5f9' : 'none',
                        cursor: 'pointer',
                      }}
                      onClick={() => toggle(`rpt-${task.id}`, defaultChecked)}
                    >
                      <div className="check-box">
                        <Checkbox checked={itemChecked} onChange={() => toggle(`rpt-${task.id}`, defaultChecked)} />
                      </div>
                      <span style={{ fontSize: 12, color: itemChecked ? '#94a3b8' : '#1e293b', textDecoration: itemChecked ? 'line-through' : 'none', userSelect: 'none' }}>{task.legacy_name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{task.date_range || '—'}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{task.purpose || '—'}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: statusCfg.color }}>{statusCfg.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Compliance */}
          <div>
            <SectionLabel>Compliance</SectionLabel>
            {complianceTasks.length === 0 ? (
              <div style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No compliance items on record.
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px', gap: '0 12px', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
                  {['', 'Item', 'Category'].map((h, i) => (
                    <div key={i} style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                  ))}
                </div>
                {complianceTasks.map((task, idx) => {
                  const itemChecked = isChecked(`cmp-${task.id}`, task.completed)
                  return (
                    <div
                      key={task.id}
                      className="check-row"
                      style={{
                        display: 'grid', gridTemplateColumns: '32px 1fr 120px',
                        gap: '0 12px', alignItems: 'center', padding: '9px 14px',
                        borderBottom: idx < complianceTasks.length - 1 ? '1px solid #f1f5f9' : 'none',
                        cursor: 'pointer',
                      }}
                      onClick={() => toggle(`cmp-${task.id}`, task.completed)}
                    >
                      <div className="check-box">
                        <Checkbox checked={itemChecked} onChange={() => toggle(`cmp-${task.id}`, task.completed)} />
                      </div>
                      <span style={{ fontSize: 12, color: itemChecked ? '#94a3b8' : '#1e293b', textDecoration: itemChecked ? 'line-through' : 'none', userSelect: 'none' }}>{task.name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{CATEGORY_LABELS[task.category] || task.category}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Generated by onboard.io</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{account.name} · {today}</span>
          </div>
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: '#94a3b8',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #e2e8f0',
    }}>
      {children}
    </div>
  )
}
