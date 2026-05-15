'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Item = {
  id: string
  type: string
  required: boolean
  task_name?: string
  task_done?: boolean
  session_name?: string
  session_status?: string
}
type Stage     = { id: string; name: string; items: Item[] }
type Milestone = { id: string; name: string; stages: Stage[] }
type Account   = { id: string; name: string; sku: string; addons: string[]; go_live_date?: string | null; milestones: Milestone[] }
type HardwareTask   = { id: string; name: string; type: string; make_model?: string; location_label?: string; completed: boolean }
type ReportTask     = { id: string; legacy_name: string; date_range?: string; purpose?: string }
type ComplianceTask = { id: string; name: string; category: string; completed: boolean }

// ─── Default visibility (smart pre-check logic) ─────────────────────────────────

const EXCLUDED_MILESTONES = new Set(['account creation', 'account setup'])
const EXCLUDED_STAGES     = new Set(['account creation'])
const EXCLUDED_ITEM_TYPES = new Set(['record', 'handoff', 'log', 'dependency', 'golive', 'report'])
const EXCLUDED_TASK_NAMES = new Set([
  'build handoff doc', 'handoff to csm', 'sub topics',
  'set up sandbox environment', 'add users',
  'log daily job/ticket usage', 'usage review',
  'update ob plan', 'update onboarding plan',
  'review pre-launch checklist',
  'outstanding item cleanup', 'outstanding items cleanup',
  'outstanding item clean up', 'outstanding items clean up',
])

const CUSTOMER_STAGES        = new Set(['user testing', 'uat', 'readiness review', 'sign-off', 'post launch', 'post launch check-in'])
const CUSTOMER_TASK_PREFIXES = ['return ', 'submit ']

// Always hide send-side of exchange pairs — never client-facing
function alwaysHide(item: Item): boolean {
  const name = (item.task_name || '').toLowerCase()
  return name.startsWith('send ')
}

function defaultChecked(item: Item): boolean {
  if (EXCLUDED_ITEM_TYPES.has(item.type)) return false
  if (item.type === 'task' || item.type === 'exchange') {
    const name = (item.task_name || '').toLowerCase()
    if (name.startsWith('send ')) return false
    if (EXCLUDED_TASK_NAMES.has(name)) return false
  }
  return true
}

function ownerLabel(item: Item, stageLower: string): 'customer' | 'session' | 'respark' {
  if (item.type === 'session') return 'session'
  if (CUSTOMER_STAGES.has(stageLower)) return 'customer'
  if (item.type === 'task' || item.type === 'exchange') {
    const name = (item.task_name || '').toLowerCase()
    if (CUSTOMER_TASK_PREFIXES.some(p => name.startsWith(p))) return 'customer'
  }
  return 'respark'
}

// ─── Storage ──────────────────────────────────────────────────────────────────

type Saved = { checked: string[]; unchecked: string[] }

function loadSaved(accountId: string): Saved | null {
  try {
    const s = localStorage.getItem(`respark-export-sel-${accountId}`)
    return s ? JSON.parse(s) : null
  } catch { return null }
}

function saveSel(accountId: string, checked: Set<string>, unchecked: Set<string>) {
  try {
    localStorage.setItem(`respark-export-sel-${accountId}`, JSON.stringify({
      checked: Array.from(checked),
      unchecked: Array.from(unchecked),
    }))
  } catch { /* ignore */ }
}

// ─── Badge ────────────────────────────────────────────────────────────────────

const BADGE: Record<string, React.CSSProperties> = {
  customer: { fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: '#dbeafe', color: '#1d4ed8', fontFamily: 'monospace', flexShrink: 0 },
  session:  { fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: '#E0F7F8', color: '#007580', fontFamily: 'monospace', flexShrink: 0 },
  respark:  { fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: '#E0F7F8', color: '#007580', fontFamily: 'monospace', flexShrink: 0 },
}

const BADGE_TEXT: Record<string, string> = {
  customer: 'customer',
  session:  'session · ReSpark',
  respark:  'ReSpark',
}

// ─── Row component ────────────────────────────────────────────────────────────

function CheckRow({
  id, label, owner, checked, onToggle,
}: {
  id: string; label: string; owner: 'customer' | 'session' | 'respark'; checked: boolean; onToggle: (id: string) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 6px 24px', cursor: 'pointer', borderRadius: 4, transition: 'background 0.1s' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(id)}
        style={{ width: 14, height: 14, accentColor: '#1BB3BB', flexShrink: 0, cursor: 'pointer' }}
      />
      <span style={{ fontSize: 12, color: checked ? '#1e293b' : '#94a3b8', flex: 1, textDecoration: checked ? 'none' : 'line-through', transition: 'color 0.1s' }}>
        {label}
      </span>
      <span style={BADGE[owner]}>{BADGE_TEXT[owner]}</span>
    </label>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ExportPlanModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const supabase = createClient()

  const [hardwareTasks, setHardwareTasks]   = useState<HardwareTask[]>([])
  const [reportTasks, setReportTasks]       = useState<ReportTask[]>([])
  const [complianceTasks, setComplianceTasks] = useState<ComplianceTask[]>([])
  const [checked, setChecked]   = useState<Set<string>>(new Set())
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  // Derive the full selected set: checked = explicitly on OR (not explicitly off AND default on)
  const allItems = useCallback((): Array<{ id: string; default: boolean }> => {
    const result: Array<{ id: string; default: boolean }> = []
    for (const m of account.milestones || []) {
      if (EXCLUDED_MILESTONES.has(m.name.toLowerCase().trim())) continue
      for (const s of m.stages || []) {
        if (EXCLUDED_STAGES.has(s.name.toLowerCase().trim())) continue
        for (const item of s.items || []) {
          if (!alwaysHide(item)) result.push({ id: item.id, default: defaultChecked(item) })
        }
      }
    }
    for (const t of hardwareTasks) result.push({ id: `hw-${t.id}`, default: true })
    for (const t of reportTasks) result.push({ id: `rpt-${t.id}`, default: true })
    for (const t of complianceTasks) result.push({ id: `cmp-${t.id}`, default: true })
    return result
  }, [account, hardwareTasks, reportTasks, complianceTasks])

  const isChecked = useCallback((id: string, def: boolean) => {
    if (checked.has(id)) return true
    if (unchecked.has(id)) return false
    return def
  }, [checked, unchecked])

  const selectedCount = allItems().filter(({ id, default: def }) => isChecked(id, def)).length
  const totalCount    = allItems().length

  useEffect(() => {
    async function load() {
      const [{ data: hw }, { data: rpt }, { data: cmp }] = await Promise.all([
        supabase.from('hardware_tasks').select('*').eq('account_id', account.id).order('sort_order'),
        supabase.from('report_tasks').select('*').eq('account_id', account.id).order('sort_order'),
        supabase.from('compliance_tasks').select('*').eq('account_id', account.id).order('sort_order'),
      ])
      setHardwareTasks(hw || [])
      setReportTasks(rpt || [])
      setComplianceTasks(cmp || [])

      const saved = loadSaved(account.id)
      if (saved) {
        setChecked(new Set(saved.checked))
        setUnchecked(new Set(saved.unchecked))
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id])

  const toggle = useCallback((id: string, def: boolean) => {
    const currently = isChecked(id, def)
    setChecked(prev => {
      const next = new Set(prev)
      if (currently) next.delete(id); else next.add(id)
      return next
    })
    setUnchecked(prev => {
      const next = new Set(prev)
      if (currently) next.add(id); else next.delete(id)
      return next
    })
  }, [isChecked])

  // Persist to localStorage whenever checked/unchecked changes (after loading)
  useEffect(() => {
    if (!loading) saveSel(account.id, checked, unchecked)
  }, [checked, unchecked, loading, account.id])

  const selectAll = () => {
    setChecked(new Set(allItems().map(i => i.id)))
    setUnchecked(new Set())
  }
  const clearAll = () => {
    setUnchecked(new Set(allItems().map(i => i.id)))
    setChecked(new Set())
  }

  const download = async () => {
    setSaving(true)
    try {
      const selectedIds = allItems()
        .filter(({ id, default: def }) => isChecked(id, def))
        .map(i => i.id)

      const res = await fetch('/api/export-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id, selectedIds }),
      })
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${account.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-plan.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      onClose()
    } catch {
      alert('Could not generate PDF — please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Visible milestones for rendering
  const visibleMilestones = (account.milestones || []).filter(
    m => !EXCLUDED_MILESTONES.has(m.name.toLowerCase().trim())
  )

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1200, backdropFilter: 'blur(2px)' }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 480,
        background: 'white', zIndex: 1201,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
        fontFamily: '"Inter", system-ui, sans-serif',
      }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Export Plan</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{account.name}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, lineHeight: 1, padding: '4px 6px', borderRadius: 4 }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {loading ? (
            <div style={{ padding: '32px 24px', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              {/* ── Onboarding Plan ── */}
              <SectionHeader label="Onboarding Plan" />

              {visibleMilestones.map((milestone, mi) => {
                const stageRows: React.ReactNode[] = []

                milestone.stages.forEach(stage => {
                  const stageLower = stage.name.toLowerCase().trim()
                  if (EXCLUDED_STAGES.has(stageLower)) return
                  const items = (stage.items || []).filter(i => !alwaysHide(i))
                  if (items.length === 0) return

                  stageRows.push(
                    <div key={stage.id}>
                      <div style={{ padding: '5px 12px 5px 16px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {stage.name}
                      </div>
                      {items.map(item => {
                        const label = item.type === 'session' ? (item.session_name || '') : (item.task_name || '')
                        const def = defaultChecked(item)
                        const owner = ownerLabel(item, stageLower)
                        return (
                          <CheckRow
                            key={item.id}
                            id={item.id}
                            label={label}
                            owner={owner}
                            checked={isChecked(item.id, def)}
                            onToggle={() => toggle(item.id, def)}
                          />
                        )
                      })}
                    </div>
                  )
                })

                if (stageRows.length === 0) return null

                return (
                  <div key={milestone.id} style={{ marginBottom: 8 }}>
                    <div style={{ padding: '8px 12px 4px 12px', fontSize: 12, fontWeight: 700, color: '#1e293b', borderTop: '1px solid #f1f5f9', marginTop: 4 }}>
                      {mi + 1}. {milestone.name}
                    </div>
                    {stageRows}
                  </div>
                )
              })}

              {/* ── Hardware ── */}
              {hardwareTasks.length > 0 && (
                <>
                  <SectionHeader label="Hardware" />
                  {hardwareTasks.map(task => (
                    <CheckRow
                      key={task.id}
                      id={`hw-${task.id}`}
                      label={task.name}
                      owner="respark"
                      checked={isChecked(`hw-${task.id}`, true)}
                      onToggle={() => toggle(`hw-${task.id}`, true)}
                    />
                  ))}
                </>
              )}

              {/* ── Reporting ── */}
              {reportTasks.length > 0 && (
                <>
                  <SectionHeader label="Reporting" />
                  {reportTasks.map(task => (
                    <CheckRow
                      key={task.id}
                      id={`rpt-${task.id}`}
                      label={task.legacy_name}
                      owner="customer"
                      checked={isChecked(`rpt-${task.id}`, true)}
                      onToggle={() => toggle(`rpt-${task.id}`, true)}
                    />
                  ))}
                </>
              )}

              {/* ── Compliance ── */}
              {complianceTasks.length > 0 && (
                <>
                  <SectionHeader label="Compliance" />
                  {complianceTasks.map(task => (
                    <CheckRow
                      key={task.id}
                      id={`cmp-${task.id}`}
                      label={task.name}
                      owner="customer"
                      checked={isChecked(`cmp-${task.id}`, true)}
                      onToggle={() => toggle(`cmp-${task.id}`, true)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>
            {selectedCount} of {totalCount} items
          </span>
          <button
            onClick={selectAll}
            style={{ fontSize: 12, fontWeight: 500, color: '#64748b', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}
          >
            All
          </button>
          <button
            onClick={clearAll}
            style={{ fontSize: 12, fontWeight: 500, color: '#64748b', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}
          >
            None
          </button>
          <button
            onClick={download}
            disabled={saving || selectedCount === 0}
            style={{
              fontSize: 13, fontWeight: 600, color: 'white',
              background: saving || selectedCount === 0 ? '#94a3b8' : '#1BB3BB',
              border: 'none', borderRadius: 6, padding: '8px 18px', cursor: saving || selectedCount === 0 ? 'default' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {saving ? 'Generating…' : '⬇ Download PDF'}
          </button>
        </div>
      </div>
    </>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: '10px 12px 6px 12px',
      fontSize: 10, fontWeight: 700, color: '#1BB3BB',
      textTransform: 'uppercase', letterSpacing: '0.1em',
      borderTop: '2px solid #E0F7F8', marginTop: 8,
    }}>
      {label}
    </div>
  )
}
