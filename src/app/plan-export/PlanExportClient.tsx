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

const EXCLUDED_MILESTONES = new Set(['account creation', 'account setup'])
const EXCLUDED_STAGES     = new Set(['account creation'])
// 'exchange' is NOT excluded — we show the "Return" side (send side filtered below by name prefix)
const EXCLUDED_ITEM_TYPES = new Set(['record', 'handoff', 'log', 'dependency', 'golive', 'report'])
const EXCLUDED_TASK_NAMES = new Set([
  'build handoff doc', 'handoff to csm', 'sub topics',
  'set up sandbox environment', 'add users',
  'log daily job/ticket usage', 'usage review',
  'update ob plan', 'update onboarding plan',
  'review pre-launch checklist', 'outstanding item cleanup',
  'outstanding items cleanup',
])

// Stages where all items are customer-owned
const CUSTOMER_STAGES = new Set(['user testing', 'uat', 'readiness review', 'sign-off', 'post launch', 'post launch check-in'])

// Tasks owned by the customer based on name prefix
const CUSTOMER_TASK_PREFIXES = ['return ', 'submit ']

// "Write down your questions" note: only in user testing and before post-launch check-in
const NOTE_STAGES = new Set(['user testing', 'uat', 'post launch'])

// Stages whose items are owned by the customer (in addition to per-item prefix checks)
// readiness review: customer fills out the checklist and attends the Q&A

const GO_LIVE_BEFORE_STAGES = new Set(['post launch', 'post launch check-in'])

function isVisible(item: Item): boolean {
  if (EXCLUDED_ITEM_TYPES.has(item.type)) return false
  // Filter send-side of exchange pairs and excluded task names (applies to task + exchange types)
  if (item.type === 'task' || item.type === 'exchange') {
    const name = (item.task_name || '').toLowerCase()
    if (name.startsWith('send ')) return false
    if (EXCLUDED_TASK_NAMES.has(name)) return false
  }
  return true
}

function isCustomerOwned(item: Item, stageLower: string): boolean {
  if (CUSTOMER_STAGES.has(stageLower)) return true
  if (item.type === 'task' || item.type === 'exchange') {
    const name = (item.task_name || '').toLowerCase()
    if (CUSTOMER_TASK_PREFIXES.some(p => name.startsWith(p))) return true
  }
  return false
}

type Item = {
  id: string
  type: string
  required: boolean
  task_name?: string
  task_done?: boolean
  session_name?: string
  session_status?: string
}

type Stage = {
  id: string
  name: string
  items: Item[]
}

type Milestone = {
  id: string
  name: string
  stages: Stage[]
}

type Account = {
  id: string
  name: string
  sku: string
  addons: string[]
  arr: number
  go_live_date?: string | null
  milestones: Milestone[]
}

type Rep = { name: string; role: string; email: string }

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

// ─── Go-Live Marker ────────────────────────────────────────────────────────────

function GoLiveMarker({ date }: { date?: string | null }) {
  const label = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Target Go-Live'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 20px',
      background: '#E0F7F8',
      borderTop: '2px solid #1BB3BB',
      borderBottom: '2px solid #1BB3BB',
    }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1BB3BB', flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#007580', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Go Live</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', fontFamily: '"DM Mono", monospace' }}>{label}</div>
      </div>
    </div>
  )
}

// ─── Page header (inner pages) ────────────────────────────────────────────────

function PageHeader({ account, section }: { account: Account; section: string }) {
  const skuLabel = SKU_LABELS[account.sku] || account.sku
  const addonLabels = (account.addons || []).map(a => ADDON_LABELS[a] || a).join(', ')
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, paddingBottom: 16, borderBottom: '2px solid #1BB3BB' }}>
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-respark-dark.svg" alt="ReSpark" style={{ height: 22, display: 'block', marginBottom: 12 }} />
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{account.name}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          <strong style={{ color: '#1e293b' }}>{skuLabel}</strong>
          {addonLabels ? ` + ${addonLabels}` : ''}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right', fontFamily: '"DM Mono", monospace' }}>
        {section}
      </div>
    </div>
  )
}

function Footer({ accountName, today }: { accountName: string; today: string }) {
  return (
    <div style={{ marginTop: 48, paddingTop: 16, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#94a3b8' }}>Generated by ReSpark</span>
      <span style={{ fontSize: 11, color: '#94a3b8' }}>{accountName} · {today}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #e2e8f0' }}>
      {children}
    </div>
  )
}

// Badge styles
const sessionBadge: React.CSSProperties  = { fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: '#E0F7F8', color: '#007580', fontFamily: '"DM Mono", monospace' }
const customerBadge: React.CSSProperties = { fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: '#dbeafe', color: '#1d4ed8', fontFamily: '"DM Mono", monospace' }
const resparkBadge: React.CSSProperties  = { fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: '#E0F7F8', color: '#007580', fontFamily: '"DM Mono", monospace' }

// ─── Main component ────────────────────────────────────────────────────────────

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

  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) setChecked(JSON.parse(stored))
    } catch { /* ignore */ }
    setHydrated(true)
  }, [storageKey])

  const toggle = useCallback((id: string, def: boolean) => {
    setChecked(prev => {
      const current = id in prev ? prev[id] : def
      const next = { ...prev, [id]: !current }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [storageKey])

  const isChecked = (id: string, def: boolean) =>
    hydrated ? (id in checked ? checked[id] : def) : def

  const visibleMilestones = (account.milestones || []).filter(
    m => !EXCLUDED_MILESTONES.has(m.name.toLowerCase().trim())
  )

  const hwDone = hardwareTasks.filter(t => isChecked(`hw-${t.id}`, t.completed)).length

  let goLiveInserted = false

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: 'Inter', system-ui, sans-serif; color: #1e293b; background: white !important; font-size: 13px; line-height: 1.5; }
        @media print {
          html, body { background: white !important; font-size: 11px; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        .check-row:hover { background: #f8fafc !important; cursor: pointer; }
      `}</style>

      <div style={{ maxWidth: 800, margin: '0 auto', background: 'white', color: '#1e293b', minHeight: '100vh', fontFamily: '"Inter", system-ui, sans-serif' }}>

        {/* ─── COVER PAGE ─────────────────────────────────────────────────── */}
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '60px 56px' }}>
          <div style={{ marginBottom: 'auto' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-respark-dark.svg" alt="ReSpark" style={{ height: 28, display: 'block' }} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1BB3BB', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20, fontFamily: '"DM Mono", monospace' }}>
              Onboarding Transition Plan
            </div>
            <div style={{ fontSize: 42, fontWeight: 800, color: '#1e293b', lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 10 }}>
              {account.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40 }}>
              <div style={{ height: 2, width: 32, background: '#1BB3BB', borderRadius: 99 }} />
              <span style={{ fontSize: 18, fontWeight: 500, color: '#64748b', letterSpacing: '-0.01em' }}>ReSpark Transition</span>
            </div>

            {account.go_live_date && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: '#E0F7F8', borderRadius: 10, padding: '14px 20px', alignSelf: 'flex-start', marginBottom: 28 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1BB3BB', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#007580', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Target Go-Live</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', fontFamily: '"DM Mono", monospace' }}>
                    {new Date(account.go_live_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
            )}

            <div style={{ maxWidth: 480 }}>
              <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 12 }}>
                This document outlines your onboarding plan with ReSpark, including the key milestones, training sessions, hardware setup, and reporting requirements for your transition. Use it to track progress and stay aligned with your implementation team throughout the process.
              </p>
              <p style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.6 }}>
                All timelines, sessions, and deliverables outlined in this plan are subject to change based on project scope, client readiness, and scheduling. Your ReSpark team will keep you informed of any updates.
              </p>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>{rep.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>{rep.role} · ReSpark</div>
              <div style={{ fontSize: 12, color: '#1BB3BB', fontFamily: '"DM Mono", monospace' }}>{rep.email}</div>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: '"DM Mono", monospace' }}>Generated {today}</div>
          </div>
        </div>

        {/* ─── PAGE 1: PLAN ───────────────────────────────────────────────── */}
        <div className="page-break" style={{ padding: '40px 56px 60px' }}>
          <PageHeader account={account} section="Onboarding Plan" />

          {visibleMilestones.map((milestone, mi) => {
            const stageBlocks: React.ReactNode[] = []

            milestone.stages.forEach(stage => {
              const stageLower = stage.name.toLowerCase().trim()
              if (EXCLUDED_STAGES.has(stageLower)) return

              const items = stage.items.filter(isVisible)
              const showNote = NOTE_STAGES.has(stageLower)

              // Inject Go-Live marker before post-launch stage
              if (GO_LIVE_BEFORE_STAGES.has(stageLower) && !goLiveInserted) {
                goLiveInserted = true
                stageBlocks.push(<GoLiveMarker key={`golive-${stage.id}`} date={account.go_live_date} />)
              }

              if (items.length === 0 && !showNote) return

              const stageIsCustomer = CUSTOMER_STAGES.has(stageLower)

              stageBlocks.push(
                <div key={stage.id}>
                  <div style={{ padding: '7px 14px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stage.name}</span>
                    {stageIsCustomer && <span style={{ fontSize: 9, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Customer</span>}
                  </div>

                  {items.map(item => {
                    const def = item.type === 'task' ? !!item.task_done : item.session_status === 'complete'
                    const itemChecked = isChecked(item.id, def)
                    const label = item.type === 'session' ? item.session_name : item.task_name
                    const customer = isCustomerOwned(item, stageLower)
                    return (
                      <div
                        key={item.id}
                        className="check-row"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 28px', borderBottom: '1px solid #f8fafc' }}
                        onClick={() => toggle(item.id, def)}
                      >
                        <Checkbox checked={itemChecked} onChange={() => toggle(item.id, def)} />
                        <span style={{ fontSize: 12, color: itemChecked ? '#94a3b8' : '#1e293b', textDecoration: itemChecked ? 'line-through' : 'none', flex: 1, userSelect: 'none' }}>
                          {label}
                        </span>
                        {item.type === 'session' && <span style={sessionBadge}>session · ReSpark</span>}
                        {customer && item.type !== 'session' && <span style={customerBadge}>customer</span>}
                        {!customer && item.type !== 'session' && <span style={resparkBadge}>ReSpark</span>}
                      </div>
                    )
                  })}

                  {showNote && (
                    <div style={{ padding: '10px 14px 10px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>✏</span>
                      <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.5 }}>
                        Write down your questions to bring to the upcoming session.
                      </span>
                    </div>
                  )}
                </div>
              )
            })

            if (stageBlocks.length === 0) return null

            return (
              <div key={milestone.id} style={{ marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '11px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{mi + 1}. {milestone.name}</div>
                </div>
                {stageBlocks}
              </div>
            )
          })}

          <Footer accountName={account.name} today={today} />
        </div>

        {/* ─── PAGE 2: HARDWARE ───────────────────────────────────────────── */}
        <div className="page-break" style={{ padding: '40px 56px 60px' }}>
          <PageHeader account={account} section="Hardware" />

          {hardwareTasks.length === 0 ? (
            <div style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: '32px 24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No hardware items on record.
            </div>
          ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 110px 160px 1fr', gap: '0 12px', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                {['', 'Name', 'Type', 'Make / Model', 'Location'].map((h, i) => (
                  <div key={i} style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', padding: '5px 14px 5px 46px', borderBottom: '1px solid #f1f5f9', background: '#fffbeb' }}>
                {hwDone} of {hardwareTasks.length} confirmed
              </div>
              {hardwareTasks.map((task, idx) => {
                const itemChecked = isChecked(`hw-${task.id}`, task.completed)
                return (
                  <div
                    key={task.id}
                    className="check-row"
                    style={{ display: 'grid', gridTemplateColumns: '32px 1fr 110px 160px 1fr', gap: '0 12px', alignItems: 'center', padding: '9px 14px', borderBottom: idx < hardwareTasks.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                    onClick={() => toggle(`hw-${task.id}`, task.completed)}
                  >
                    <Checkbox checked={itemChecked} onChange={() => toggle(`hw-${task.id}`, task.completed)} />
                    <span style={{ fontSize: 12, color: itemChecked ? '#94a3b8' : '#1e293b', textDecoration: itemChecked ? 'line-through' : 'none', userSelect: 'none' }}>{task.name}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{HARDWARE_TYPE_LABELS[task.type] || task.type}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{task.make_model || '—'}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{task.location_label || '—'}</span>
                  </div>
                )
              })}
            </div>
          )}

          <Footer accountName={account.name} today={today} />
        </div>

        {/* ─── PAGE 3: REPORTING & COMPLIANCE ─────────────────────────────── */}
        <div className="page-break" style={{ padding: '40px 56px 60px' }}>
          <PageHeader account={account} section="Reporting & Compliance" />

          <div style={{ marginBottom: 32 }}>
            <SectionLabel>Reports</SectionLabel>
            {reportTasks.length === 0 ? (
              <div style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No reports on record.
              </div>
            ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 0.7fr 1fr', gap: '0 12px', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  {['', 'Legacy Report Name', 'Date Range', 'Purpose'].map((h, i) => (
                    <div key={i} style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                  ))}
                </div>
                {reportTasks.map((task, idx) => {
                  const itemChecked = isChecked(`rpt-${task.id}`, false)
                  return (
                    <div
                      key={task.id}
                      className="check-row"
                      style={{ display: 'grid', gridTemplateColumns: '32px 1fr 0.7fr 1fr', gap: '0 12px', alignItems: 'center', padding: '9px 14px', borderBottom: idx < reportTasks.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                      onClick={() => toggle(`rpt-${task.id}`, false)}
                    >
                      <Checkbox checked={itemChecked} onChange={() => toggle(`rpt-${task.id}`, false)} />
                      <span style={{ fontSize: 12, color: itemChecked ? '#94a3b8' : '#1e293b', textDecoration: itemChecked ? 'line-through' : 'none', userSelect: 'none' }}>{task.legacy_name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{task.date_range || '—'}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{task.purpose || '—'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Compliance</SectionLabel>
            {complianceTasks.length === 0 ? (
              <div style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No compliance items on record.
              </div>
            ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px', gap: '0 12px', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
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
                      style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px', gap: '0 12px', alignItems: 'center', padding: '9px 14px', borderBottom: idx < complianceTasks.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                      onClick={() => toggle(`cmp-${task.id}`, task.completed)}
                    >
                      <Checkbox checked={itemChecked} onChange={() => toggle(`cmp-${task.id}`, task.completed)} />
                      <span style={{ fontSize: 12, color: itemChecked ? '#94a3b8' : '#1e293b', textDecoration: itemChecked ? 'line-through' : 'none', userSelect: 'none' }}>{task.name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{CATEGORY_LABELS[task.category] || task.category}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <Footer accountName={account.name} today={today} />
        </div>
      </div>
    </>
  )
}
