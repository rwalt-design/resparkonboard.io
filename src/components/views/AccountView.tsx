'use client'

import { useState, useEffect, useContext, createContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Account, Milestone, Stage, Item, Interaction, OrgMember, Contact, Request, ChecklistItem, LogEntry, Sku, Addon, SessionActionItem, PlanTemplate, TrainingTemplate, SessionTemplate, QuickLogType, QuickLogOutcome } from '@/types'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Tooltip } from '@/components/Tooltip'

const SKU_LABELS: Record<string, string> = {
  dispatch: 'Dispatch',
  facility_management: 'Facility Mgmt',
  full_suite: 'Full Suite',
}
const SKU_COLORS: Record<string, string> = {
  dispatch: '#f59e0b',
  facility_management: '#8b5cf6',
  full_suite: '#3b82f6',
}
const HEALTH_OPTIONS = [
  { value: 'active',       label: 'Active',       color: '#10b981', tip: 'Onboarding is progressing normally' },
  { value: 'stalled',      label: 'Stalled',      color: '#f59e0b', tip: 'Progress has slowed — follow-up needed' },
  { value: 'on_hold',      label: 'On Hold',      color: '#6b7280', tip: 'Intentionally paused by the customer' },
  { value: 'unresponsive', label: 'Unresponsive', color: '#ef4444', tip: 'Customer not responding to outreach' },
  { value: 'blocked',      label: 'Blocked',      color: '#ef4444', tip: 'External blocker preventing progress' },
]

const STAGE_STATUS_TIPS: Record<string, string> = {
  locked:   'Not yet available — previous stage must be completed first',
  active:   'Currently in progress',
  unlocked: 'Available to start',
  complete: 'All required items finished',
}
const STAGE_STATUS_COLORS: Record<string, string> = {
  locked: 'var(--text-3)',
  active: '#3b82f6',
  unlocked: '#f59e0b',
  complete: '#10b981',
}
const INTERACTION_ICONS: Record<string, string> = {
  email: '✉️', call: '📞', meeting: '🗓', note: '📝', session: '🎓',
  called: '📞', texted: '💬', bumped_email: '📧', sent_follow_up: '📨',
  internal_note: '📝', custom: '⚡',
}

// Date helpers
const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() }
const daysFromToday = (dateStr?: string | null): number | null => {
  if (!dateStr) return null
  const target = new Date(dateStr); target.setHours(0,0,0,0)
  return Math.round((target.getTime() - startOfToday()) / 86400000)
}
const daysSince = (dateStr?: string | null): number | null => {
  if (!dateStr) return null
  const past = new Date(dateStr); past.setHours(0,0,0,0)
  return Math.max(0, Math.round((startOfToday() - past.getTime()) / 86400000))
}

interface Props {
  account: Account
  orgMembers: OrgMember[]
  currentMember: OrgMember | undefined
  planTemplates?: PlanTemplate[]
  trainingTemplates?: TrainingTemplate[]
  sessionTemplates?: SessionTemplate[]
  onBack: () => void
  onRefresh: () => void
}

type TabId = 'plan' | 'timeline' | 'details' | 'ai'

export function AccountView({ account, orgMembers, currentMember, planTemplates = [], trainingTemplates: _trainingTemplates = [], sessionTemplates: _sessionTemplates = [], onBack, onRefresh }: Props) {
  const [tab, setTab] = useState<TabId>('plan')
  const [localAccount, setLocalAccount] = useState<Account>(account)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)

  // Compute stats
  const allItems = (localAccount.milestones || []).flatMap(m => m.stages.flatMap(s => s.items))
  const required = allItems.filter(i => i.required)
  const done = required.filter(i => i.task_done || i.session_status === 'complete')
  const completionPct = required.length ? Math.round((done.length / required.length) * 100) : 0

  const interactions = [...(localAccount.interactions || [])].sort(
    (a, b) => new Date(b.event_at ?? b.created_at).getTime() - new Date(a.event_at ?? a.created_at).getTime()
  )
  const daysSinceContact = interactions.length > 0
    ? Math.floor((Date.now() - new Date(interactions[0].event_at ?? interactions[0].created_at).getTime()) / 86400000)
    : null

  const openTaskCount = (localAccount.open_tasks || []).filter(t => !t.done).length

  const exportPlan = () => {
    const a = document.createElement('a')
    a.href = `/api/export-plan?account=${localAccount.id}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('accounts').delete().eq('id', localAccount.id)
    onRefresh()
    onBack()
  }

  const updateHealth = async (status: string) => {
    const supabase = createClient()
    await supabase.from('accounts').update({ health_status: status }).eq('id', localAccount.id)
    setLocalAccount(prev => ({ ...prev, health_status: status as Account['health_status'] }))
    onRefresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Account header */}
      <div style={{
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        padding: '16px 24px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={onBack} style={{
            background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 12,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font-ui)',
          }}>← Back</button>

          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-h)', flex: 1 }}>{localAccount.name}</h1>

          {/* SKU badge */}
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
            background: (SKU_COLORS[localAccount.sku] || 'var(--text-2)') + '22',
            color: SKU_COLORS[localAccount.sku] || 'var(--text-2)',
            fontFamily: 'var(--font-mono)',
          }}>{SKU_LABELS[localAccount.sku] || localAccount.sku}</span>

          {(localAccount.addons || []).map(a => (
            <span key={a} style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
              background: 'var(--border)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)',
            }}>{a}</span>
          ))}
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          {localAccount.arr > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              ARR <strong style={{ color: 'var(--text-h)' }}>${localAccount.arr.toLocaleString()}</strong>
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            Progress <strong style={{ color: 'var(--text-h)' }}>{completionPct}%</strong>
          </span>
          {(() => {
            const d = daysFromToday(localAccount.go_live_date)
            if (d === null) return (
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Go Live not set</span>
            )
            const color = d < 0 ? '#ef4444' : d <= 14 ? '#f59e0b' : 'var(--text-h)'
            const label = d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : `in ${d}d`
            return (
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                Go Live <strong style={{ color }}>{label}</strong>
              </span>
            )
          })()}
          {(() => {
            const d = daysSince(localAccount.kickoff_date)
            if (d === null) return (
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>KO not set</span>
            )
            return (
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                Days since KO <strong style={{ color: 'var(--text-h)' }}>{d}</strong>
              </span>
            )
          })()}
          {daysSinceContact !== null && (
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              Last contact <strong style={{ color: daysSinceContact >= 14 ? '#ef4444' : 'var(--text-h)' }}>
                {daysSinceContact === 0 ? 'today' : `${daysSinceContact}d ago`}
              </strong>
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            Open tasks <strong style={{ color: openTaskCount > 0 ? 'var(--text-h)' : 'var(--text-3)' }}>{openTaskCount}</strong>
          </span>

          {/* Health dropdown */}
          {(() => {
            const h = HEALTH_OPTIONS.find(o => o.value === (localAccount.health_status || 'active')) || HEALTH_OPTIONS[0]
            return (
              <select
                value={localAccount.health_status || 'active'}
                onChange={e => updateHealth(e.target.value)}
                style={{
                  background: h.color + '14', border: `1px solid ${h.color}40`,
                  borderRadius: 6, padding: '3px 8px', color: h.color,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                  appearance: 'none', WebkitAppearance: 'none', outline: 'none',
                }}
              >
                {HEALTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )
          })()}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setEditingDetails(true)} style={ghostBtn}>✎ Edit Details</button>
            <button onClick={() => setTab('timeline')} style={ghostBtn}>+ Log Interaction</button>
            <button onClick={exportPlan} style={ghostBtn}>⬇ Export Plan</button>
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 11, color: '#ef4444' }}>Delete this account?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{ ...ghostBtn, color: '#ef4444', borderColor: '#ef444440' }}
                >{deleting ? 'Deleting…' : 'Yes, delete'}</button>
                <button onClick={() => setConfirmDelete(false)} style={ghostBtn}>Cancel</button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ ...ghostBtn, color: 'var(--text-3)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
              >Delete</button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background: 'var(--bg-surface2)', borderRadius: 99, height: 4, overflow: 'hidden' }}>
          <div style={{
            width: `${completionPct}%`, height: '100%', borderRadius: 99,
            background: completionPct >= 75 ? '#10b981' : '#3b82f6',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        {(['plan', 'timeline', 'details', 'ai'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none',
            borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
            padding: '10px 18px', marginBottom: -1,
            color: tab === t ? 'var(--text-h)' : 'var(--text-2)',
            fontSize: 13, fontWeight: tab === t ? 600 : 400,
            cursor: 'pointer', fontFamily: 'var(--font-ui)',
            textTransform: 'capitalize',
          }}>{t === 'ai' ? '✦ AI' : t}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'plan' && (
          <PlanTab
            account={localAccount}
            onUpdate={updated => { setLocalAccount(updated); onRefresh() }}
          />
        )}
        {tab === 'timeline' && (
          <TimelineTab
            account={localAccount}
            orgMembers={orgMembers}
            currentMember={currentMember}
            onUpdate={updated => { setLocalAccount(updated); onRefresh() }}
          />
        )}
        {tab === 'details' && (
          <DetailsTab
            account={localAccount}
            planTemplates={planTemplates}
            onUpdate={updated => { setLocalAccount(updated); onRefresh() }}
            onRefresh={onRefresh}
          />
        )}
        {tab === 'ai' && (
          <AITab account={localAccount} />
        )}
      </div>

      {editingDetails && (
        <AccountDetailsModal
          account={localAccount}
          onClose={() => setEditingDetails(false)}
          onUpdate={updated => { setLocalAccount(updated); onRefresh() }}
        />
      )}
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
  padding: '5px 12px', color: 'var(--text-2)', fontSize: 12,
  cursor: 'pointer', fontFamily: 'var(--font-ui)',
}

// ─── Plan Tab ────────────────────────────────────────────────────────────────

// Signals to nested stage/checklist components whether to force-expand or force-collapse.
// undefined = let the component decide on its own.
const ExpandAllCtx = createContext<boolean | undefined>(undefined)

function PlanTab({ account, onUpdate }: { account: Account; onUpdate: (a: Account) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    [account.milestones?.[0]?.id || '']: true,
  })
  const [addingMilestone, setAddingMilestone] = useState(false)
  const [milestoneName, setMilestoneName] = useState('')
  const [sessionModal, setSessionModal] = useState<Item | null>(null)
  const supabase = createClient()

  const toggleMilestone = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const [expandAllState, setExpandAllState] = useState<boolean | undefined>(undefined)
  const allExpanded = (account.milestones || []).every(m => !!expanded[m.id])
  const toggleAll = () => {
    const next = !allExpanded
    setExpanded(Object.fromEntries((account.milestones || []).map(m => [m.id, next])))
    setExpandAllState(next)
  }

  const handleAddMilestone = async () => {
    if (!milestoneName.trim()) return
    const { data: milestone } = await supabase.from('milestones').insert({
      account_id: account.id,
      name: milestoneName.trim(),
      order_index: (account.milestones || []).length,
    }).select('id, account_id, name, order_index').single()
    if (milestone) {
      const newMilestone: Milestone = { ...milestone, stages: [] }
      onUpdate({ ...account, milestones: [...(account.milestones || []), newMilestone] })
      setExpanded(prev => ({ ...prev, [milestone.id]: true }))
      setMilestoneName('')
      setAddingMilestone(false)
    }
  }

  const handleSessionUpdate = (updated: Item) => {
    onUpdate({
      ...account,
      milestones: (account.milestones || []).map(m => ({
        ...m,
        stages: m.stages.map(s => ({
          ...s,
          items: s.items.map(i => i.id === updated.id ? updated : i),
        })),
      })),
    })
    setSessionModal(updated)
  }

  return (
    <ExpandAllCtx.Provider value={expandAllState}>
    <div style={{ padding: '20px 24px' }}>
      <style>{`.drag-handle { opacity: 0 } *:hover > .drag-handle { opacity: 1 } .timeline-row:hover .item-delete-btn { opacity: 1 } *:hover > .item-delete-btn { opacity: 1 !important }`}</style>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          onClick={toggleAll}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 5,
            padding: '3px 10px', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontWeight: 500,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}
        >{allExpanded ? '↑ Collapse all' : '↓ Expand all'}</button>
      </div>
      {(account.milestones || []).map((milestone, mi) => (
        <MilestoneBlock
          key={milestone.id}
          milestone={milestone}
          index={mi}
          open={!!expanded[milestone.id]}
          onToggle={() => toggleMilestone(milestone.id)}
          account={account}
          onUpdate={onUpdate}
          onOpenSession={setSessionModal}
          onDelete={async () => {
            const supabase = createClient()
            const { error } = await supabase.from('milestones').delete().eq('id', milestone.id)
            if (error) { console.error('Delete milestone failed:', error.message); return }
            onUpdate({ ...account, milestones: (account.milestones || []).filter(m => m.id !== milestone.id) })
          }}
        />
      ))}
      {sessionModal && (
        <SessionModal
          item={sessionModal}
          onClose={() => setSessionModal(null)}
          onUpdate={handleSessionUpdate}
        />
      )}

      {/* Add milestone */}
      {addingMilestone ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <input
            autoFocus
            value={milestoneName}
            onChange={e => setMilestoneName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddMilestone(); if (e.key === 'Escape') { setAddingMilestone(false); setMilestoneName('') } }}
            placeholder="Milestone name..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={handleAddMilestone} style={primaryBtn}>Add</button>
          <button onClick={() => { setAddingMilestone(false); setMilestoneName('') }} style={ghostBtn}>✕</button>
        </div>
      ) : (
        <button
          onClick={() => setAddingMilestone(true)}
          style={{
            display: 'block', width: '100%', background: 'none',
            border: '1px dashed var(--border)', borderRadius: 8,
            padding: '10px', textAlign: 'center',
            color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)',
            marginTop: (account.milestones || []).length > 0 ? 4 : 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border-b)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >+ Add Milestone</button>
      )}
    </div>
    </ExpandAllCtx.Provider>
  )
}

// Inline editable name — shows a pencil icon on hover, becomes an input on click
function InlineEdit({ value, onSave, style }: {
  value: string
  onSave: (v: string) => Promise<void>
  style?: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [hovered, setHovered] = useState(false)

  const commit = async () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) await onSave(trimmed)
    else setDraft(value)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface2)', border: '1px solid #3b82f6', borderRadius: 4,
          padding: '1px 6px', color: 'var(--text-h)', outline: 'none', minWidth: 0, flex: 1,
          fontSize: style?.fontSize, fontWeight: style?.fontWeight, fontFamily: 'var(--font-ui)',
        }}
      />
    )
  }

  return (
    <span
      style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ ...style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      <span
        onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true) }}
        style={{
          fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0, lineHeight: 1,
          opacity: hovered ? 1 : 0, transition: 'opacity 0.1s',
        }}
        title="Rename"
      >✎</span>
    </span>
  )
}

function MilestoneBlock({ milestone, index, open, onToggle, account, onUpdate, onOpenSession, onDelete }: {
  milestone: Milestone; index: number; open: boolean; onToggle: () => void
  account: Account; onUpdate: (a: Account) => void; onOpenSession: (item: Item) => void; onDelete?: () => void
}) {
  const [localStages, setLocalStages] = useState<Stage[]>(milestone.stages)
  useEffect(() => { setLocalStages(milestone.stages) }, [milestone.stages])

  const stageSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const supabase = createClient()

  const handleStageDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = localStages.findIndex(s => s.id === active.id)
    const newIdx = localStages.findIndex(s => s.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const newStages = arrayMove(localStages, oldIdx, newIdx).map((s, i) => ({ ...s, order_index: i }))
    setLocalStages(newStages)
    onUpdate({
      ...account,
      milestones: (account.milestones || []).map(m =>
        m.id !== milestone.id ? m : { ...m, stages: newStages }
      ),
    })
    await Promise.all(newStages.map(s =>
      supabase.from('stages').update({ order_index: s.order_index }).eq('id', s.id)
    ))
  }

  const saveMilestoneName = async (name: string) => {
    await supabase.from('milestones').update({ name }).eq('id', milestone.id)
    onUpdate({
      ...account,
      milestones: (account.milestones || []).map(m =>
        m.id === milestone.id ? { ...m, name } : m
      ),
    })
  }

  const allItems = localStages.flatMap(s => s.items)
  const req = allItems.filter(i => i.required)
  const done = req.filter(i => i.task_done || i.session_status === 'complete')
  const pct = req.length ? Math.round((done.length / req.length) * 100) : 0
  const isComplete = localStages.every(s => s.status === 'complete')
  const [addingStage, setAddingStage] = useState(false)
  const [stageName, setStageName] = useState('')

  const handleDeleteStage = async (stageId: string) => {
    const { error } = await supabase.from('stages').delete().eq('id', stageId)
    if (error) { console.error('Delete failed:', error.message); return }
    const next = localStages.filter(s => s.id !== stageId)
    setLocalStages(next)
    onUpdate({ ...account, milestones: (account.milestones || []).map(m => m.id !== milestone.id ? m : { ...m, stages: next }) })
  }

  const handleAddStage = async () => {
    if (!stageName.trim()) return
    const { data: stage } = await supabase.from('stages').insert({
      milestone_id: milestone.id,
      name: stageName.trim(),
      status: 'locked',
      order_index: localStages.length,
    }).select('id, milestone_id, name, status, order_index').single()
    if (stage) {
      const newStage: Stage = { ...stage, items: [] }
      onUpdate({
        ...account,
        milestones: (account.milestones || []).map(m =>
          m.id !== milestone.id ? m : { ...m, stages: [...m.stages, newStage] }
        ),
      })
      setStageName('')
      setAddingStage(false)
    }
  }

  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', cursor: 'pointer',
          background: 'var(--bg-surface)', borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface3)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
      >
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-h)', display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          {index + 1}.&nbsp;
          <InlineEdit value={milestone.name} onSave={saveMilestoneName} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-h)' }} />
        </span>
        {isComplete && <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>Complete</span>}
        <div style={{ width: 80, background: 'var(--bg-surface2)', borderRadius: 99, height: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#10b981' : '#3b82f6', borderRadius: 99 }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 32, textAlign: 'right' }}>{pct}%</span>
        {onDelete && (
          <DeleteBtn onClick={onDelete} size={16} />
        )}
      </div>
      {open && (
        <div>
          <DndContext sensors={stageSensors} collisionDetection={closestCenter} onDragEnd={handleStageDragEnd}>
            <SortableContext items={localStages.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {localStages.map((stage, si) => (
                <SortableRow key={stage.id} id={stage.id}>
                  <StageBlock
                    stage={stage}
                    index={si}
                    account={account}
                    milestone={{ ...milestone, stages: localStages }}
                    onUpdate={onUpdate}
                    onOpenSession={onOpenSession}
                    onDelete={() => handleDeleteStage(stage.id)}
                  />
                </SortableRow>
              ))}
            </SortableContext>
          </DndContext>
          {/* Add stage row */}
          {addingStage ? (
            <div style={{ display: 'flex', gap: 8, padding: '8px 16px 10px 28px', background: 'var(--bg-stage)', borderTop: '1px solid var(--bg-surface3)' }}>
              <input
                autoFocus
                value={stageName}
                onChange={e => setStageName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddStage(); if (e.key === 'Escape') { setAddingStage(false); setStageName('') } }}
                placeholder="Stage name..."
                style={{ ...inputStyle, flex: 1, fontSize: 12 }}
              />
              <button onClick={handleAddStage} style={{ ...primaryBtn, fontSize: 11, padding: '4px 12px' }}>Add</button>
              <button onClick={() => { setAddingStage(false); setStageName('') }} style={{ ...ghostBtn, fontSize: 11, padding: '4px 10px' }}>✕</button>
            </div>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setAddingStage(true) }}
              style={{
                display: 'block', width: '100%', background: 'none', border: 'none',
                borderTop: '1px solid var(--bg-surface3)',
                padding: '7px 16px 7px 28px', textAlign: 'left',
                color: 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
            >+ Add Stage</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Exchange grouping ────────────────────────────────────────────────────────
type ItemGroup =
  | { kind: 'exchange'; id: string; send: Item; receive: Item }
  | { kind: 'single';   id: string; item: Item }

function groupItems(items: Item[]): ItemGroup[] {
  const result: ItemGroup[] = []
  let i = 0
  while (i < items.length) {
    const cur = items[i]
    const nxt = items[i + 1]
    if (
      cur.type === 'task' && nxt?.type === 'task' &&
      cur.task_assignee === 'personal' && nxt.task_assignee === 'customer' &&
      cur.task_name?.startsWith('Send ') && nxt.task_name?.startsWith('Return ')
    ) {
      result.push({ kind: 'exchange', id: cur.id, send: cur, receive: nxt })
      i += 2
    } else {
      result.push({ kind: 'single', id: cur.id, item: cur })
      i++
    }
  }
  return result
}

// ─── Sortable wrappers ────────────────────────────────────────────────────────
function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.35 : 1,
        position: 'relative',
      }}
      {...attributes}
    >
      {/* Drag handle — left edge, hover-visible */}
      <div
        {...listeners}
        style={{
          position: 'absolute', left: 6, top: 0, bottom: 0,
          width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          color: 'var(--border-b)', fontSize: 11, userSelect: 'none',
          opacity: 0, transition: 'opacity 0.1s',
        }}
        className="drag-handle"
        title="Drag to reorder"
      >⠿</div>
      {children}
    </div>
  )
}

function useHover() {
  const [hovered, setHovered] = useState(false)
  return { hovered, onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
}

function DeleteBtn({ onClick, size = 14, stopProp = true }: { onClick: () => void; size?: number; stopProp?: boolean }) {
  const h = useHover()
  return (
    <button
      onClick={e => { if (stopProp) e.stopPropagation(); onClick() }}
      title="Remove"
      {...h}
      style={{
        background: 'none', border: 'none', padding: '0 3px',
        color: h.hovered ? '#ef4444' : 'var(--text-3)', fontSize: size, lineHeight: 1,
        cursor: 'pointer', flexShrink: 0, opacity: h.hovered ? 1 : 0.25, transition: 'opacity 0.1s, color 0.1s',
      }}
    >×</button>
  )
}

function ExchangeRow({ sendItem, returnItem, stageStatus, onUpdate, accountId, onDelete }: {
  sendItem: Item; returnItem: Item; stageStatus: string; onUpdate: (i: Item) => void; accountId: string; onDelete?: () => void
}) {
  const supabase = createClient()
  const locked = stageStatus === 'locked'
  const label = sendItem.task_name?.replace(/^Send /, '') ?? ''
  const { toggleBtn, panel } = useItemChecklist(sendItem, onUpdate)
  const [requested, setRequested] = useState(false)

  const toggle = async (item: Item) => {
    if (locked) return
    const newDone = !item.task_done
    await supabase.from('items').update({ task_done: newDone }).eq('id', item.id)
    onUpdate({ ...item, task_done: newDone })
  }

  const requestAgain = async () => {
    if (locked) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('interactions').insert({
      account_id: accountId,
      type: 'email',
      summary: `Followed up: re-requested ${label}`,
      detail: `Sent a follow-up request for the "${label}" document.`,
      user_id: user?.id || null,
    })
    setRequested(true)
    setTimeout(() => setRequested(false), 3000)
  }

  const bothDone = sendItem.task_done && returnItem.task_done
  const awaitingReturn = sendItem.task_done && !returnItem.task_done

  const pill = (done: boolean | undefined, pillLabel: string, color: string, onClick: () => void) => (
    <button onClick={onClick} disabled={locked} style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '2px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      cursor: locked ? 'default' : 'pointer', fontFamily: 'var(--font-ui)',
      background: done ? '#10b98115' : color + '10',
      border: `1px solid ${done ? '#10b98140' : color + '35'}`,
      color: done ? '#10b981' : color,
      transition: 'all 0.1s',
    }}>
      <span style={{ fontSize: 9 }}>{done ? '●' : '○'}</span> {pillLabel}
    </button>
  )

  return (
    <div style={{ opacity: locked ? 0.45 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 6px 44px' }}>
        <span style={{ fontSize: 13, color: bothDone ? 'var(--text-3)' : 'var(--text)', flex: 1, textDecoration: bothDone ? 'line-through' : 'none' }}>{label}</span>
        {pill(sendItem.task_done, 'Sent', '#3b82f6', () => toggle(sendItem))}
        {pill(returnItem.task_done, 'Received', '#f59e0b', () => toggle(returnItem))}
        {awaitingReturn && !locked && (
          <button
            onClick={requestAgain}
            style={{
              background: requested ? '#10b98115' : 'none',
              border: `1px solid ${requested ? '#10b98140' : 'var(--border)'}`,
              borderRadius: 4, padding: '1px 8px', fontSize: 10, fontWeight: 600,
              color: requested ? '#10b981' : 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'var(--font-ui)', flexShrink: 0,
              transition: 'all 0.2s',
            }}
          >
            {requested ? '✓ Logged' : '↩ Request Again'}
          </button>
        )}
        {toggleBtn}
        {onDelete && <DeleteBtn onClick={onDelete} />}
      </div>
      {panel}
    </div>
  )
}


function StageBlock({ stage, index: _index, account, milestone, onUpdate, onOpenSession, onDelete }: {
  stage: Stage; index: number; account: Account; milestone: Milestone; onUpdate: (a: Account) => void; onOpenSession: (item: Item) => void; onDelete?: () => void
}) {
  const [open, setOpen] = useState(stage.status === 'active' || stage.status === 'unlocked')
  const expandAll = useContext(ExpandAllCtx)
  useEffect(() => { if (expandAll !== undefined) setOpen(expandAll) }, [expandAll])
  const [addingItem, setAddingItem] = useState(false)
  const [itemType, setItemType] = useState<'task' | 'dependency' | 'exchange' | 'session' | 'log' | 'handoff' | 'golive'>('task')
  const [itemName, setItemName] = useState('')
  const [itemRequired, setItemRequired] = useState(true)
  const [localItems, setLocalItems] = useState<Item[]>(stage.items)
  const supabase = createClient()

  // Keep local items in sync when parent updates (e.g. after adding an item)
  useEffect(() => { setLocalItems(stage.items) }, [stage.items])

  const saveStageName = async (name: string) => {
    await supabase.from('stages').update({ name }).eq('id', stage.id)
    onUpdate({
      ...account,
      milestones: (account.milestones || []).map(m =>
        m.id !== milestone.id ? m : {
          ...m,
          stages: m.stages.map(s => s.id === stage.id ? { ...s, name } : s),
        }
      ),
    })
  }

  const itemSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleItemDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const groups = groupItems(localItems)
    const oldIdx = groups.findIndex(g => g.id === active.id)
    const newIdx = groups.findIndex(g => g.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const newGroups = arrayMove(groups, oldIdx, newIdx)
    let idx = 0
    const newItems: Item[] = newGroups.flatMap(g =>
      g.kind === 'exchange'
        ? [{ ...g.send, order_index: idx++ }, { ...g.receive, order_index: idx++ }]
        : [{ ...g.item, order_index: idx++ }]
    )
    setLocalItems(newItems)
    // Propagate new order to parent so re-renders don't reset the order
    onUpdate({
      ...account,
      milestones: (account.milestones || []).map(m =>
        m.id !== milestone.id ? m : {
          ...m,
          stages: m.stages.map(s =>
            s.id !== stage.id ? s : { ...s, items: newItems }
          ),
        }
      ),
    })
    await Promise.all(newItems.map(item =>
      supabase.from('items').update({ order_index: item.order_index }).eq('id', item.id)
    ))
  }

  const statusColor = STAGE_STATUS_COLORS[stage.status] || 'var(--text-3)'

  const incompleteRequired = localItems.filter(item => {
    if (!item.required) return false
    if (item.type === 'task' || item.type === 'dependency' || item.type === 'handoff') return !item.task_done
    if (item.type === 'session') return item.session_status !== 'complete'
    if (item.type === 'golive') return !item.task_done
    return false
  })
  const allRequiredDone = incompleteRequired.length === 0

  const handleAdvance = async () => {
    await supabase.from('stages').update({ status: 'complete' }).eq('id', stage.id)

    const stageIdx = milestone.stages.findIndex(s => s.id === stage.id)
    const isLastInMilestone = stageIdx === milestone.stages.length - 1

    if (!isLastInMilestone) {
      const nextStage = milestone.stages[stageIdx + 1]
      await supabase.from('stages').update({ status: 'active' }).eq('id', nextStage.id)
    }
    // Cross-milestone advancement is intentionally omitted — CSM manually opens the next milestone.

    onUpdate({
      ...account,
      milestones: (account.milestones || []).map(m => {
        if (m.id !== milestone.id) return m
        return {
          ...m,
          stages: m.stages.map((s, si) => {
            if (s.id === stage.id) return { ...s, status: 'complete' as const }
            if (!isLastInMilestone && si === stageIdx + 1) return { ...s, status: 'active' as const }
            return s
          }),
        }
      }),
    })
  }

  const handleItemUpdate = (updatedItem: Item) => {
    onUpdate({
      ...account,
      milestones: (account.milestones || []).map(m =>
        m.id !== milestone.id ? m : {
          ...m,
          stages: m.stages.map(s =>
            s.id !== stage.id ? s : {
              ...s,
              items: s.items.map(i => i.id === updatedItem.id ? updatedItem : i),
            }
          ),
        }
      ),
    })
  }

  const handleAddItem = async () => {
    if (itemType !== 'golive' && !itemName.trim()) return
    const insertPayload: Record<string, unknown> = {
      stage_id: stage.id,
      type: itemType === 'exchange' ? 'task' : itemType,
      required: itemRequired,
      order_index: localItems.length,
    }

    if (itemType === 'golive') {
      insertPayload.task_name = itemName.trim() || 'Go Live'
      insertPayload.task_done = false
    } else if (itemType === 'task' || itemType === 'log') {
      insertPayload.task_name     = itemName.trim()
      insertPayload.task_assignee = 'personal'
      insertPayload.task_source   = 'manual'
      insertPayload.task_done     = false
    } else if (itemType === 'dependency') {
      // Dependency: customer-owned blocker. Reuses task_name + task_done columns.
      insertPayload.type          = 'dependency'
      insertPayload.task_name     = itemName.trim()
      insertPayload.task_assignee = 'customer'
      insertPayload.task_source   = 'manual'
      insertPayload.task_done     = false
    } else if (itemType === 'session') {
      insertPayload.session_name   = itemName.trim()
      insertPayload.session_status = 'pending'
    } else if (itemType === 'handoff') {
      insertPayload.handoff_name = itemName.trim()
    } else if (itemType === 'exchange') {
      // Two tasks: Send (respark) + Return (customer)
      const base = { stage_id: stage.id, type: 'task', required: itemRequired, task_source: 'manual', task_done: false }
      const [{ data: sendItem, error: e1 }, { data: returnItem, error: e2 }] = await Promise.all([
        supabase.from('items').insert({ ...base, task_name: `Send ${itemName.trim()}`,   task_assignee: 'personal', order_index: localItems.length }).select().single(),
        supabase.from('items').insert({ ...base, task_name: `Return ${itemName.trim()}`, task_assignee: 'customer', order_index: localItems.length + 1 }).select().single(),
      ])
      if (e1 || e2) { alert(`Failed to add exchange: ${(e1 || e2)?.message}`); return }
      if (sendItem && returnItem) {
        const added = [sendItem as Item, returnItem as Item]
        setLocalItems(prev => [...prev, ...added])
        onUpdate({ ...account, milestones: (account.milestones || []).map(m => m.id !== milestone.id ? m : { ...m, stages: m.stages.map(s => s.id !== stage.id ? s : { ...s, items: [...s.items, ...added] }) }) })
        setItemName(''); setAddingItem(false)
      }
      return
    }

    const { data: newItem, error: insertError } = await supabase.from('items').insert(insertPayload).select().single()
    if (insertError) {
      alert(`Failed to add item: ${insertError.message}`)
      return
    }
    if (newItem) {
      setLocalItems(prev => [...prev, newItem as Item])
      onUpdate({
        ...account,
        milestones: (account.milestones || []).map(m =>
          m.id !== milestone.id ? m : {
            ...m,
            stages: m.stages.map(s =>
              s.id !== stage.id ? s : { ...s, items: [...s.items, newItem as Item] }
            ),
          }
        ),
      })
      setItemName('')
      setAddingItem(false)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    const { error } = await supabase.from('items').delete().eq('id', itemId)
    if (error) { console.error('Delete failed:', error.message); return }
    const next = localItems.filter(i => i.id !== itemId)
    setLocalItems(next)
    onUpdate({
      ...account,
      milestones: (account.milestones || []).map(m =>
        m.id !== milestone.id ? m : {
          ...m,
          stages: m.stages.map(s =>
            s.id !== stage.id ? s : { ...s, items: next }
          ),
        }
      ),
    })
  }

  return (
    <div style={{ borderBottom: '1px solid var(--bg-surface3)' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 16px 9px 28px', cursor: 'pointer', background: 'var(--bg-stage)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-stage)')}
      >
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{open ? '▾' : '▸'}</span>
        <InlineEdit value={stage.name} onSave={saveStageName} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }} />
        <Tooltip content={STAGE_STATUS_TIPS[stage.status] ?? stage.status} placement="bottom">
        <select
          value={stage.status}
          onClick={e => e.stopPropagation()}
          onChange={async e => {
            e.stopPropagation()
            const newStatus = e.target.value as Stage['status']
            await supabase.from('stages').update({ status: newStatus }).eq('id', stage.id)
            onUpdate({
              ...account,
              milestones: (account.milestones || []).map(m =>
                m.id !== milestone.id ? m : {
                  ...m,
                  stages: m.stages.map(s => s.id === stage.id ? { ...s, status: newStatus } : s),
                }
              ),
            })
          }}
          style={{
            fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
            background: statusColor + '22', color: statusColor,
            fontFamily: 'var(--font-mono)', textTransform: 'capitalize',
            border: `1px solid ${statusColor}44`, cursor: 'pointer',
            appearance: 'none', WebkitAppearance: 'none', outline: 'none',
          }}
        >
          {(['locked', 'active', 'unlocked', 'complete'] as Stage['status'][]).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        </Tooltip>
        {(stage.status === 'unlocked' || stage.status === 'active') && (
          <Tooltip
            content={allRequiredDone ? 'Mark this stage complete and unlock the next one' : `Complete all required items to advance (${incompleteRequired.length} remaining)`}
            placement="bottom"
          >
          <button
            onClick={e => { e.stopPropagation(); if (allRequiredDone) handleAdvance() }}
            disabled={!allRequiredDone}
            style={{
              background: allRequiredDone ? '#10b98122' : 'var(--bg-surface2)',
              border: `1px solid ${allRequiredDone ? '#10b98144' : 'var(--border)'}`,
              borderRadius: 5, padding: '2px 8px',
              color: allRequiredDone ? '#10b981' : 'var(--text-3)',
              fontSize: 10, fontWeight: 600,
              cursor: allRequiredDone ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-ui)',
            }}
          >{allRequiredDone ? 'Mark complete →' : `${incompleteRequired.length} required left`}</button>
          </Tooltip>
        )}
        {onDelete && (
          <DeleteBtn onClick={onDelete} size={15} />
        )}
      </div>
      {open && (
        <div style={{ paddingBottom: 4 }}>
          <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
            <SortableContext items={groupItems(localItems).map(g => g.id)} strategy={verticalListSortingStrategy}>
              {groupItems(localItems).map((group) => (
                <SortableRow key={group.id} id={group.id}>
                  {group.kind === 'exchange' ? (
                    <ExchangeRow
                      sendItem={group.send}
                      returnItem={group.receive}
                      stageStatus={stage.status}
                      onUpdate={handleItemUpdate}
                      accountId={account.id}
                      onDelete={() => {
                        Promise.all([
                          supabase.from('items').delete().eq('id', group.send.id),
                          supabase.from('items').delete().eq('id', group.receive.id),
                        ]).then(() => {
                          const next = localItems.filter(i => i.id !== group.send.id && i.id !== group.receive.id)
                          setLocalItems(next)
                          onUpdate({ ...account, milestones: (account.milestones || []).map(m => m.id !== milestone.id ? m : { ...m, stages: m.stages.map(s => s.id !== stage.id ? s : { ...s, items: next }) }) })
                        })
                      }}
                    />
                  ) : (
                    <ItemRow
                      item={group.item}
                      stageStatus={stage.status}
                      onUpdate={handleItemUpdate}
                      onOpenSession={onOpenSession}
                      onDelete={() => handleDeleteItem(group.item.id)}
                      onGoLive={async (date) => {
                        await supabase.from('accounts').update({ go_live_date: date }).eq('id', account.id)
                        onUpdate({ ...account, go_live_date: date })
                      }}
                    />
                  )}
                </SortableRow>
              ))}
            </SortableContext>
          </DndContext>
          {/* Add item */}
          {addingItem ? (
            <div style={{ padding: '8px 16px 6px 44px' }}>
              {/* Type picker — verb-first labels to make the distinction obvious */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                {([
                  { id: 'task',       label: 'Task (me)',          color: '#3b82f6', hint: 'Something you do internally' },
                  { id: 'dependency', label: 'Dependency (them)',  color: '#f59e0b', hint: 'Something the customer must do' },
                  { id: 'exchange',   label: 'Exchange (send/get)', color: '#8b5cf6', hint: 'Document you send, they return' },
                  { id: 'session',    label: 'Session',            color: '#10b981', hint: 'Meeting or training' },
                  { id: 'handoff',    label: 'Handoff',            color: '#6b7280', hint: 'Rep transition' },
                  { id: 'log',        label: 'Log',                color: '#6b7280', hint: 'Activity log entry' },
                  { id: 'golive',     label: '🚀 Go Live',         color: '#10b981', hint: 'Mark the moment of going live' },
                ] as const).map(({ id, label, color }) => (
                  <button key={id} onClick={() => setItemType(id)} title={id} style={{
                    padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                    background: itemType === id ? color + '20' : 'none',
                    border: `1px solid ${itemType === id ? color : 'var(--border)'}`,
                    color: itemType === id ? color : 'var(--text-3)',
                  }}>{label}</button>
                ))}
                <button onClick={() => setItemRequired(r => !r)} style={{
                  marginLeft: 'auto', padding: '3px 9px', borderRadius: 4, fontSize: 10,
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                  background: itemRequired ? '#10b98118' : 'none',
                  border: `1px solid ${itemRequired ? '#10b98144' : 'var(--border)'}`,
                  color: itemRequired ? '#10b981' : 'var(--text-3)',
                }}>{itemRequired ? 'required' : 'optional'}</button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  autoFocus
                  value={itemName}
                  onChange={e => setItemName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddItem(); if (e.key === 'Escape') { setAddingItem(false); setItemName('') } }}
                  placeholder={
                    itemType === 'task'       ? 'What do you need to do?' :
                    itemType === 'dependency' ? 'What must the customer complete?' :
                    itemType === 'exchange'   ? 'Document name (e.g. Data Template)' :
                    itemType === 'session'    ? 'Session name...' :
                    itemType === 'golive'     ? 'Label (optional, defaults to "Go Live")' :
                    'Name...'
                  }
                  style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                />
                <button onClick={handleAddItem} style={{ ...primaryBtn, fontSize: 11, padding: '4px 12px' }}>Add</button>
                <button onClick={() => { setAddingItem(false); setItemName('') }} style={{ ...ghostBtn, fontSize: 11, padding: '4px 10px' }}>✕</button>
              </div>
            </div>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setAddingItem(true) }}
              style={{
                display: 'block', width: '100%', background: 'none', border: 'none',
                padding: '5px 16px 5px 44px', textAlign: 'left',
                color: 'var(--border-b)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--border-b)')}
            >+ Add Item</button>
          )}
        </div>
      )}
    </div>
  )
}

const ASSIGNEE_COLORS: Record<string, string> = {
  personal: '#3b82f6', customer: '#f59e0b', internal: '#6b7280',
}

// Shared sub-checklist hook — used by ItemRow and ExchangeRow
function useItemChecklist(item: Item, onUpdate: (i: Item) => void) {
  const supabase = createClient()
  const [open, setOpen] = useState((item.checklist ?? []).length > 0)
  const expandAll = useContext(ExpandAllCtx)
  useEffect(() => { if (expandAll !== undefined) setOpen(expandAll) }, [expandAll])
  const [items, setItems] = useState<ChecklistItem[]>(item.checklist ?? [])
  const [input, setInput] = useState('')

  const save = async (next: ChecklistItem[]) => {
    setItems(next)
    await supabase.from('items').update({ checklist: next }).eq('id', item.id)
    onUpdate({ ...item, checklist: next })
  }
  const add = async () => {
    if (!input.trim()) return
    await save([...items, { id: crypto.randomUUID(), text: input.trim(), done: false, created_at: new Date().toISOString() }])
    setInput('')
  }
  const toggle = (id: string) => save(items.map(x => x.id === id ? { ...x, done: !x.done } : x))
  const remove = (id: string) => save(items.filter(x => x.id !== id))

  const doneCount = items.filter(x => x.done).length

  const toggleBtn = (
    <button
      onClick={() => setOpen(v => !v)}
      title="Checklist"
      style={{
        background: items.length ? 'var(--border)' : 'none',
        border: `1px solid ${items.length ? 'var(--border-b)' : 'transparent'}`,
        borderRadius: 4, padding: '1px 6px', cursor: 'pointer',
        color: items.length ? 'var(--text-2)' : 'var(--border-b)',
        fontSize: 10, fontFamily: 'var(--font-mono)',
        display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f640'; e.currentTarget.style.color = 'var(--text)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = items.length ? 'var(--border-b)' : 'transparent'; e.currentTarget.style.color = items.length ? 'var(--text-2)' : 'var(--border-b)' }}
    >
      ☰{items.length > 0 ? ` ${doneCount}/${items.length}` : ''}
    </button>
  )

  const panel = open ? (
    <div style={{ padding: '2px 16px 8px 62px' }}>
      {items.map(ci => (
        <div key={ci.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
          <div onClick={() => toggle(ci.id)} style={{
            width: 12, height: 12, borderRadius: 2, flexShrink: 0,
            border: ci.done ? 'none' : '1.5px solid var(--border-b)',
            background: ci.done ? '#10b981' : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {ci.done && <span style={{ fontSize: 7, color: '#fff', fontWeight: 700 }}>✓</span>}
          </div>
          <span style={{ fontSize: 12, color: ci.done ? 'var(--text-3)' : 'var(--text)', flex: 1, textDecoration: ci.done ? 'line-through' : 'none' }}>{ci.text}</span>
          <button onClick={() => remove(ci.id)} style={{ background: 'none', border: 'none', color: 'var(--border-b)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setInput('') }}
          placeholder="Add sub-item..." style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '3px 7px', marginTop: 0 }} />
        {input.trim() && <button onClick={add} style={{ ...primaryBtn, fontSize: 11, padding: '3px 10px' }}>Add</button>}
      </div>
    </div>
  ) : null

  return { toggleBtn, panel }
}

function ItemRow({ item, stageStatus, onUpdate, onOpenSession, onDelete, onGoLive }: {
  item: Item; stageStatus: string; onUpdate: (i: Item) => void; onOpenSession?: (item: Item) => void; onDelete?: () => void; onGoLive?: (date: string) => void
}) {
  const supabase = createClient()
  const locked = stageStatus === 'locked'
  const { toggleBtn, panel } = useItemChecklist(item, onUpdate)

  if (item.type === 'golive') {
    const done = !!item.task_done
    const markLive = async () => {
      if (locked || done) return
      const today = new Date().toISOString().split('T')[0]
      await supabase.from('items').update({ task_done: true }).eq('id', item.id)
      onUpdate({ ...item, task_done: true })
      onGoLive?.(today)
    }
    return (
      <div style={{ padding: '8px 16px', opacity: locked ? 0.45 : 1 }}>
        <button
          onClick={markLive}
          disabled={locked}
          style={{
            width: '100%', borderRadius: 8, padding: '12px 20px',
            background: done ? '#10b98118' : 'linear-gradient(135deg, #059669, #10b981)',
            border: done ? '1px solid #10b98155' : 'none',
            color: done ? '#10b981' : '#fff',
            fontSize: 15, fontWeight: 700, cursor: done || locked ? 'default' : 'pointer',
            fontFamily: 'var(--font-ui)', letterSpacing: '0.02em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.15s',
          }}
        >
          {done ? '✓ Went Live' : '🚀 Go Live!'}
          {onDelete && !done && (
            <span onClick={e => { e.stopPropagation(); onDelete?.() }} style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 12 }}>✕</span>
          )}
        </button>
      </div>
    )
  }

  const toggleTask = async () => {
    if (locked || (item.type !== 'task' && item.type !== 'dependency')) return
    const newDone = !item.task_done
    await supabase.from('items').update({ task_done: newDone }).eq('id', item.id)
    onUpdate({ ...item, task_done: newDone })
  }

  const saveItemName = async (name: string) => {
    const field = item.type === 'session' ? 'session_name' : item.type === 'handoff' ? 'handoff_name' : 'task_name'
    await supabase.from('items').update({ [field]: name }).eq('id', item.id)
    onUpdate({ ...item, [field]: name })
  }

  // ── Dependency — customer-owned blocker ──────────────────────────────────────
  if (item.type === 'dependency') {
    const isDone = !!item.task_done
    return (
      <div style={{ opacity: locked ? 0.4 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px 7px 44px' }}>
          {/* Amber ⏳ icon — "Mark received" on click */}
          <div
            onClick={() => !locked && !isDone && toggleTask()}
            title={isDone ? 'Received' : 'Mark received'}
            style={{
              width: 17, height: 17, borderRadius: 9, flexShrink: 0,
              border: isDone ? 'none' : '1.5px solid #f59e0b',
              background: isDone ? '#10b981' : 'transparent',
              cursor: locked || isDone ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: isDone ? 8 : 10, color: isDone ? '#fff' : '#f59e0b', fontWeight: 700,
            }}
          >{isDone ? '✓' : '⏳'}</div>
          <InlineEdit
            value={item.task_name || ''}
            onSave={saveItemName}
            style={{ fontSize: 13, color: isDone ? 'var(--text-3)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none' }}
          />
          {!item.required && <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>optional</span>}
          <span style={{ fontSize: 10, fontWeight: 700, padding: '0 6px', borderRadius: 3,
            background: '#f59e0b18', color: '#f59e0b', fontFamily: 'var(--font-mono)', flexShrink: 0,
            border: '1px solid #f59e0b30',
          }}>waiting on customer</span>
          {!isDone && !locked && (
            <button onClick={toggleTask} style={{
              background: 'none', border: '1px solid #f59e0b40', borderRadius: 4,
              padding: '1px 7px', fontSize: 10, color: '#f59e0b', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontWeight: 600, flexShrink: 0,
            }}>Mark received</button>
          )}
          {toggleBtn}
          {onDelete && <DeleteBtn onClick={onDelete} />}
        </div>
        {panel}
      </div>
    )
  }

  if (item.type === 'task') {
    const color = ASSIGNEE_COLORS[item.task_assignee || 'personal'] || 'var(--text-3)'
    return (
      <div style={{ opacity: locked ? 0.4 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px 7px 44px' }}>
          <div onClick={toggleTask} style={{
            width: 15, height: 15, borderRadius: 3, flexShrink: 0,
            border: item.task_done ? 'none' : `1.5px solid ${color}`,
            background: item.task_done ? '#10b981' : 'transparent',
            cursor: locked ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {item.task_done && <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>✓</span>}
          </div>
          <InlineEdit
            value={item.task_name || ''}
            onSave={saveItemName}
            style={{ fontSize: 13, color: item.task_done ? 'var(--text-3)' : 'var(--text)', textDecoration: item.task_done ? 'line-through' : 'none' }}
          />
          {!item.required && <Tooltip content="Optional — not required to advance the stage"><span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>optional</span></Tooltip>}
          <Tooltip content={item.task_assignee === 'personal' ? 'Assigned to you / your team' : item.task_assignee === 'customer' ? 'Customer must complete this' : 'Internal team task'} placement="bottom">
            <span style={{ fontSize: 10, fontWeight: 600, padding: '0 5px', borderRadius: 3, background: color + '18', color, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{item.task_assignee}</span>
          </Tooltip>
          {toggleBtn}
          {onDelete && <DeleteBtn onClick={onDelete} />}
        </div>
        {panel}
      </div>
    )
  }

  if (item.type === 'session') {
    const toggleSession = async () => {
      if (locked) return
      const newStatus = item.session_status === 'complete' ? 'pending' : 'complete'
      await supabase.from('items').update({ session_status: newStatus }).eq('id', item.id)
      onUpdate({ ...item, session_status: newStatus })
    }
    const isComplete = item.session_status === 'complete'
    return (
      <div style={{ opacity: locked ? 0.4 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px 44px' }}>
          <div
            onClick={toggleSession}
            style={{
              width: 15, height: 15, borderRadius: 3, flexShrink: 0,
              border: isComplete ? 'none' : '1.5px solid #8b5cf6',
              background: isComplete ? '#10b981' : 'transparent',
              cursor: locked ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isComplete && <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>✓</span>}
          </div>
          <InlineEdit value={item.session_name || ''} onSave={saveItemName} style={{ fontSize: 13, color: isComplete ? 'var(--text-3)' : 'var(--text)', textDecoration: isComplete ? 'line-through' : 'none' }} />
          <span style={{ fontSize: 10, fontWeight: 600, padding: '0 5px', borderRadius: 3, background: '#8b5cf618', color: '#8b5cf6', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>session</span>
          {onOpenSession && (
            <button
              onClick={e => { e.stopPropagation(); onOpenSession(item) }}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                padding: '1px 7px', fontSize: 10, color: 'var(--text-2)', cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontWeight: 600, flexShrink: 0,
              }}
            >Open ↗</button>
          )}
          {!isComplete && !locked && (
            <button
              onClick={toggleSession}
              style={{
                background: 'none', border: '1px solid #8b5cf640', borderRadius: 4,
                padding: '1px 7px', fontSize: 10, color: '#8b5cf6', cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontWeight: 600, flexShrink: 0,
              }}
            >Mark Complete</button>
          )}
          {toggleBtn}
          {onDelete && <DeleteBtn onClick={onDelete} />}
        </div>
        {panel}
      </div>
    )
  }

  if (item.type === 'handoff') {
    const toggleHandoff = async () => {
      if (locked) return
      const newDone = !item.task_done
      await supabase.from('items').update({ task_done: newDone }).eq('id', item.id)
      onUpdate({ ...item, task_done: newDone })
    }
    return (
      <div style={{ opacity: locked ? 0.4 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px 7px 44px' }}>
          <div onClick={toggleHandoff} style={{
            width: 15, height: 15, borderRadius: 3, flexShrink: 0,
            border: item.task_done ? 'none' : '1.5px solid var(--text-2)',
            background: item.task_done ? '#10b981' : 'transparent',
            cursor: locked ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {item.task_done && <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>✓</span>}
          </div>
          <InlineEdit value={item.handoff_name || ''} onSave={saveItemName} style={{ fontSize: 13, color: item.task_done ? 'var(--text-3)' : 'var(--text)', textDecoration: item.task_done ? 'line-through' : 'none' }} />
          <span style={{ fontSize: 10, fontWeight: 600, padding: '0 5px', borderRadius: 3, background: 'var(--bg-surface3)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>handoff</span>
          {toggleBtn}
          {onDelete && <DeleteBtn onClick={onDelete} />}
        </div>
        {panel}
      </div>
    )
  }

  if (item.type === 'log') {
    return <LogItem item={item} locked={locked} onUpdate={onUpdate} onDelete={onDelete} toggleBtn={toggleBtn} panel={panel} />
  }

  return null
}

function LogItem({ item, locked, onUpdate, onDelete, toggleBtn, panel }: {
  item: Item; locked: boolean; onUpdate: (i: Item) => void; onDelete?: () => void
  toggleBtn: React.ReactNode; panel: React.ReactNode
}) {
  const [entries, setEntries] = useState<LogEntry[]>(item.log_entries ?? [])
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [usageType, setUsageType] = useState('')
  const [count, setCount] = useState('')
  const supabase = createClient()

  const canLog = !locked && date && usageType.trim() && count !== '' && !isNaN(Number(count))

  const addEntry = async () => {
    if (!canLog) return
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      date,
      usage_type: usageType.trim(),
      count: Number(count),
      created_at: new Date().toISOString(),
    }
    const next = [...entries, entry]
    setEntries(next)
    setCount('')
    await supabase.from('items').update({ log_entries: next }).eq('id', item.id)
    onUpdate({ ...item, log_entries: next })
  }

  const toggleDone = async () => {
    if (locked) return
    const newDone = !item.task_done
    await supabase.from('items').update({ task_done: newDone }).eq('id', item.id)
    onUpdate({ ...item, task_done: newDone })
  }

  const fmtDate = (e: LogEntry) => {
    const d = e.date ? new Date(e.date + 'T00:00:00') : new Date(e.created_at)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ opacity: locked ? 0.45 : 1 }}>
      <div style={{ padding: '8px 16px 6px 44px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {entries.length > 0 && (
            <div onClick={toggleDone} title={item.task_done ? 'Mark incomplete' : 'Mark complete'} style={{
              width: 15, height: 15, borderRadius: 3, flexShrink: 0,
              border: item.task_done ? 'none' : '1.5px solid var(--text-3)',
              background: item.task_done ? '#10b981' : 'transparent',
              cursor: locked ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {item.task_done && <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>✓</span>}
            </div>
          )}
          <span style={{
            fontSize: 12, fontWeight: 600, flex: 1,
            color: item.task_done ? 'var(--text-3)' : 'var(--text)',
            textDecoration: item.task_done ? 'line-through' : 'none',
          }}>{item.task_name ?? 'Usage Log'}</span>
          {toggleBtn}
          {onDelete && <DeleteBtn onClick={onDelete} />}
        </div>

        {/* Entry list */}
        {entries.length > 0 && (
          <div style={{ marginBottom: 8, borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 56px', gap: 8, padding: '4px 10px', background: 'var(--bg-surface2)', borderBottom: '1px solid var(--border)' }}>
              {['Date', 'Type', 'Count'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Count' ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>
            {entries.map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 56px', gap: 8, padding: '5px 10px', borderBottom: i < entries.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--bg-surface)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{fmtDate(e)}</span>
                <span style={{ fontSize: 11, color: 'var(--text)' }}>{e.usage_type ?? e.text}</span>
                <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{e.count != null ? e.count : ''}</span>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        {!locked && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ ...inputStyle, width: 130, fontSize: 11, padding: '4px 8px', marginTop: 0 }} />
            <select value={usageType} onChange={e => setUsageType(e.target.value)}
              style={{ ...inputStyle, width: 100, fontSize: 11, padding: '4px 8px', marginTop: 0, cursor: 'pointer' }}>
              <option value="">Type</option>
              <option value="Jobs">Jobs</option>
              <option value="Tickets">Tickets</option>
            </select>
            <input type="number" value={count} onChange={e => setCount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addEntry() }}
              placeholder="Count"
              style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '4px 8px', marginTop: 0 }} />
            <button onClick={addEntry} disabled={!canLog}
              style={{ ...primaryBtn, fontSize: 11, padding: '4px 12px', opacity: canLog ? 1 : 0.4, cursor: canLog ? 'pointer' : 'default', flexShrink: 0 }}>
              Log for day
            </button>
          </div>
        )}
      </div>
      {panel}
    </div>
  )
}

// ─── Quick Log helpers ────────────────────────────────────────────────────────

const QUICK_CHIPS: { type: QuickLogType; icon: string; label: string; instant?: boolean }[] = [
  { type: 'called',        icon: '📞', label: 'Called' },
  { type: 'texted',        icon: '💬', label: 'Texted',       instant: true },
  { type: 'bumped_email',  icon: '📧', label: 'Bumped Email', instant: true },
  { type: 'sent_follow_up', icon: '📨', label: 'Sent Follow-Up' },
  { type: 'internal_note', icon: '📝', label: 'Internal Note' },
  { type: 'custom',        icon: '⚡', label: 'Custom' },
]

function buildQuickLogSummary(type: QuickLogType, outcome?: QuickLogOutcome | null, customLabel?: string): string {
  switch (type) {
    case 'called':
      if (outcome === 'reached')       return 'Called — Reached'
      if (outcome === 'left_voicemail') return 'Called — Left voicemail'
      if (outcome === 'no_answer')     return 'Called — No answer'
      return 'Called'
    case 'texted':        return 'Texted'
    case 'bumped_email':  return 'Bumped email thread'
    case 'sent_follow_up': return 'Sent follow-up'
    case 'internal_note': return 'Internal note'
    case 'custom':        return customLabel ? `Custom: ${customLabel}` : 'Custom'
  }
}

function formatRelativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (secs < 60) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(dateStr).toLocaleDateString()
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────

function TimelineTab({ account, onUpdate, orgMembers, currentMember }: {
  account: Account
  onUpdate: (a: Account) => void
  orgMembers: OrgMember[]
  currentMember: OrgMember | undefined
}) {
  const [activeChip, setActiveChip] = useState<QuickLogType | null>(null)
  const [calledOutcome, setCalledOutcome] = useState<QuickLogOutcome | null>(null)
  const [note, setNote] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  // datetime-local input value, defaults to now
  const [loggedAt, setLoggedAt] = useState(() => {
    const d = new Date()
    d.setSeconds(0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; undoId?: string } | null>(null)
  const supabase = createClient()

  const interactions = [...(account.interactions || [])].sort(
    (a, b) => new Date(b.event_at ?? b.created_at).getTime() - new Date(a.event_at ?? a.created_at).getTime()
  )

  const memberName = (userId?: string) => {
    if (!userId) return null
    if (currentMember?.user_id === userId) return 'You'
    return orgMembers.find(m => m.user_id === userId)?.name ?? null
  }

  const handleDeleteInteraction = async (id: string) => {
    const { error } = await supabase.from('interactions').delete().eq('id', id)
    if (error) { console.error('Delete failed:', error.message); return }
    onUpdate({
      ...account,
      interactions: (account.interactions || []).filter(i => i.id !== id),
    })
  }

  const resetForm = () => {
    setCalledOutcome(null)
    setNote('')
    setCustomLabel('')
    const d = new Date(); d.setSeconds(0, 0)
    setLoggedAt(d.toISOString().slice(0, 16))
    setShowDatePicker(false)
  }

  const handleChipClick = async (chip: typeof QUICK_CHIPS[0]) => {
    if (chip.instant) {
      await logInstant(chip.type)
      return
    }
    if (activeChip === chip.type) {
      setActiveChip(null)
      resetForm()
    } else {
      setActiveChip(chip.type)
      resetForm()
    }
  }

  const logInstant = async (type: QuickLogType) => {
    const { data: { user } } = await supabase.auth.getUser()
    const summary = buildQuickLogSummary(type)
    const { data } = await supabase.from('interactions').insert({
      account_id: account.id,
      type,
      summary,
      detail: null,
      user_id: user?.id,
    }).select().single()

    if (data) {
      onUpdate({
        ...account,
        interactions: [data as Interaction, ...(account.interactions || [])],
      })
      setToast({ message: `Logged — ${summary}`, undoId: data.id })
      setTimeout(() => setToast(t => t?.undoId === data.id ? null : t), 5000)
    }
  }

  const handleUndo = async () => {
    if (!toast?.undoId) return
    const idToDelete = toast.undoId
    setToast(null)
    await supabase.from('interactions').delete().eq('id', idToDelete)
    onUpdate({
      ...account,
      interactions: (account.interactions || []).filter(i => i.id !== idToDelete),
    })
  }

  const showNoteField = () => {
    if (!activeChip) return false
    if (activeChip === 'called') return calledOutcome === 'reached'
    if (activeChip === 'texted' || activeChip === 'bumped_email') return false
    return true
  }

  const canSave = () => {
    if (activeChip === 'called' && !calledOutcome) return false
    if (activeChip === 'custom' && (!customLabel.trim() || !note.trim())) return false
    return true
  }

  const handleSave = async () => {
    if (!activeChip || !canSave()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const summary = buildQuickLogSummary(activeChip, calledOutcome, customLabel)
    const logTime = new Date(loggedAt).toISOString()
    const noteValue = showNoteField() ? (note.trim() || null) : null

    const { data } = await supabase.from('interactions').insert({
      account_id: account.id,
      type: activeChip,
      summary,
      detail: noteValue,
      user_id: user?.id,
      created_at: logTime,
    }).select().single()

    if (data) {
      const merged = [data as Interaction, ...(account.interactions || [])]
        .sort((a, b) => new Date(a.event_at ?? a.created_at).getTime() - new Date(b.event_at ?? b.created_at).getTime())
      onUpdate({ ...account, interactions: merged })
      setToast({ message: 'Logged ✓' })
      setTimeout(() => setToast(null), 3000)
    }

    setActiveChip(null)
    resetForm()
    setSaving(false)
  }

  const formatsLoggedAt = () => {
    const d = new Date(loggedAt)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    if (Math.abs(diffMs) < 60000) return 'Now'
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 720 }}>

      {/* Quick Log Toolbar */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: activeChip ? 0 : 20,
        overflowX: 'auto', paddingBottom: 2,
      }}>
        {QUICK_CHIPS.map(chip => {
          const isActive = activeChip === chip.type
          return (
            <button
              key={chip.type}
              onClick={() => handleChipClick(chip)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: isActive ? '#3b82f615' : 'var(--bg-surface)',
                border: `1px solid ${isActive ? '#3b82f6' : 'var(--border)'}`,
                borderRadius: 20, padding: '5px 12px',
                color: isActive ? '#3b82f6' : 'var(--text-2)',
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', fontFamily: 'var(--font-ui)',
                whiteSpace: 'nowrap', flexShrink: 0,
                transition: 'border-color 0.15s, color 0.15s, background 0.15s',
              }}
            >
              <span style={{ fontSize: 14 }}>{chip.icon}</span>
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Inline Expansion Form */}
      <div style={{
        maxHeight: activeChip ? 320 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.2s ease',
        marginBottom: activeChip ? 16 : 0,
      }}>
        {activeChip && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-b)',
            borderRadius: '0 0 8px 8px', borderTop: 'none',
            padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {/* Called outcome toggle */}
            {activeChip === 'called' && (
              <div style={{ display: 'flex', gap: 6 }}>
                {(['reached', 'left_voicemail', 'no_answer'] as QuickLogOutcome[]).map(o => {
                  const labels: Record<QuickLogOutcome, string> = {
                    reached: 'Reached',
                    left_voicemail: 'Left voicemail',
                    no_answer: 'No answer',
                  }
                  const isSelected = calledOutcome === o
                  return (
                    <button
                      key={o}
                      onClick={() => setCalledOutcome(o)}
                      style={{
                        background: isSelected ? '#3b82f6' : 'var(--bg-surface2)',
                        border: `1px solid ${isSelected ? '#3b82f6' : 'var(--border)'}`,
                        borderRadius: 6, padding: '5px 12px',
                        color: isSelected ? '#fff' : 'var(--text-2)',
                        fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                        transition: 'all 0.15s',
                      }}
                    >{labels[o]}</button>
                  )
                })}
              </div>
            )}

            {/* Custom label input */}
            {activeChip === 'custom' && (
              <input
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                placeholder="Label (e.g. Dropped off swag)"
                style={{ ...inputStyle }}
              />
            )}

            {/* Note field */}
            {showNoteField() && (
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={activeChip === 'custom' ? 'Note (required)…' : 'Note (optional)…'}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            )}

            {/* Footer: timestamp + save */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setShowDatePicker(v => !v)}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 5,
                  padding: '4px 10px', color: 'var(--text-3)', fontSize: 11,
                  cursor: 'pointer', fontFamily: 'var(--font-mono)',
                }}
              >🕐 {formatsLoggedAt()}</button>
              {showDatePicker && (
                <input
                  type="datetime-local"
                  value={loggedAt}
                  onChange={e => setLoggedAt(e.target.value)}
                  style={{ ...inputStyle, fontSize: 11, padding: '3px 8px', width: 'auto' }}
                />
              )}
              <div style={{ marginLeft: 'auto' }}>
                <button
                  onClick={() => { setActiveChip(null); resetForm() }}
                  style={{ ...ghostBtn, marginRight: 6 }}
                >Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving || !canSave()}
                  style={{
                    ...primaryBtn,
                    opacity: !canSave() ? 0.4 : 1,
                  }}
                >{saving ? 'Saving…' : 'Log'}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Undo Toast */}
      {toast && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--bg-surface)', border: '1px solid var(--border-b)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          fontSize: 12, color: 'var(--text-2)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <span style={{ color: '#10b981', fontWeight: 600 }}>{toast.message}</span>
          {toast.undoId && (
            <button
              onClick={handleUndo}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 5,
                padding: '2px 8px', color: 'var(--text-2)', fontSize: 11,
                cursor: 'pointer', fontFamily: 'var(--font-ui)', marginLeft: 'auto',
              }}
            >Undo</button>
          )}
        </div>
      )}

      {/* Timeline */}
      {interactions.length === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '48px 0' }}>
          No interactions logged yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {interactions.map((interaction, idx) => (
            <div key={interaction.id} className="timeline-row" style={{ display: 'flex', gap: 12, padding: '10px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                }}>{INTERACTION_ICONS[interaction.type] || '📌'}</div>
                {idx < interactions.length - 1 && (
                  <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 4 }} />
                )}
              </div>
              <div style={{ flex: 1, paddingBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>{interaction.summary}</span>
                  <span
                    title={new Date(interaction.created_at).toLocaleString()}
                    style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 'auto', cursor: 'default' }}
                  >{formatRelativeTime(interaction.created_at)}</span>
                  <DeleteBtn onClick={() => handleDeleteInteraction(interaction.id)} stopProp={false} />
                </div>
                {interaction.detail && (
                  <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 3px' }}>{interaction.detail}</p>
                )}
                {memberName(interaction.user_id) && (
                  <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    {memberName(interaction.user_id)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Details Tab ──────────────────────────────────────────────────────────────

function DetailsTab({ account, planTemplates, onUpdate, onRefresh }: {
  account: Account
  planTemplates: PlanTemplate[]
  onUpdate: (a: Account) => void
  onRefresh: () => void
}) {
  const [contextDraft, setContextDraft] = useState(account.sales_context || '')
  const [contextSaved, setContextSaved] = useState(true)
  const [softwareDraft, setSoftwareDraft] = useState(account.current_software || '')
  const [softwareSaved, setSoftwareSaved] = useState(true)
  const supabase = createClient()

  const saveContext = async () => {
    await supabase.from('accounts').update({ sales_context: contextDraft }).eq('id', account.id)
    onUpdate({ ...account, sales_context: contextDraft })
    setContextSaved(true)
  }

  const saveSoftware = async () => {
    await supabase.from('accounts').update({ current_software: softwareDraft }).eq('id', account.id)
    onUpdate({ ...account, current_software: softwareDraft })
    setSoftwareSaved(true)
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Account name/SKU/ARR/dates moved to header — edit via the "Edit Details" button there */}

      {/* Plan template assignment */}
      {planTemplates.length > 0 && (
        <ApplyPlanTemplateSection account={account} planTemplates={planTemplates} onRefresh={onRefresh} />
      )}

      {/* Sales context — always editable */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={sectionLabel}>Sales Context</span>
          {!contextSaved && (
            <button onClick={saveContext} style={primaryBtn}>Save</button>
          )}
        </div>
        <textarea
          value={contextDraft}
          onChange={e => { setContextDraft(e.target.value); setContextSaved(false) }}
          onBlur={saveContext}
          rows={4}
          placeholder="Add deal context, sales notes, key stakeholders…"
          style={{ ...inputStyle, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
        />
      </section>

      {/* Current software — always editable */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={sectionLabel}>Current Software</span>
          {!softwareSaved && (
            <button onClick={saveSoftware} style={primaryBtn}>Save</button>
          )}
        </div>
        <textarea
          value={softwareDraft}
          onChange={e => { setSoftwareDraft(e.target.value); setSoftwareSaved(false) }}
          onBlur={saveSoftware}
          rows={3}
          placeholder="What's the customer using today? Scrap software, accounting, compliance, ATMS…"
          style={{ ...inputStyle, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
        />
      </section>

      {/* Contacts */}
      <ContactsSection account={account} onUpdate={onUpdate} />

      {/* Requests */}
      <RequestsSection account={account} onUpdate={onUpdate} />
    </div>
  )
}

function ApplyPlanTemplateSection({ account, planTemplates, onRefresh }: {
  account: Account
  planTemplates: PlanTemplate[]
  onRefresh: () => void
}) {
  const matchingTemplates = planTemplates.filter(t => !t.sku || t.sku === account.sku)
  const [selectedId, setSelectedId] = useState<string>('')
  const [confirm, setConfirm] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleApply = async () => {
    setApplying(true)
    setError(null)
    try {
      const res = await fetch('/api/apply-plan-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: account.id, plan_template_id: selectedId || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to apply template')
      setSuccess(true)
      setConfirm(false)
      onRefresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setApplying(false)
    }
  }

  if (success) {
    return (
      <section>
        <span style={sectionLabel}>Plan Template</span>
        <p style={{ fontSize: 13, color: '#10b981', marginTop: 8 }}>
          ✓ Plan template applied — switch to the Plan tab to see the new structure.
        </p>
      </section>
    )
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={sectionLabel}>Plan Template</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
        Assign a plan template to this account. This will replace the current plan structure — existing progress will be lost.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={selectedId}
          onChange={e => { setSelectedId(e.target.value); setConfirm(false); setSuccess(false) }}
          style={{ ...inputStyle, flex: 1, fontSize: 12 }}
        >
          <option value="">Default plan</option>
          {matchingTemplates.map(t => (
            <option key={t.id} value={t.id}>{t.name}{t.description ? ` — ${t.description}` : ''}</option>
          ))}
        </select>
        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            style={ghostBtn}
          >Apply</button>
        ) : null}
      </div>

      {confirm && (
        <div style={{
          marginTop: 12, padding: '12px 14px', borderRadius: 8,
          background: '#ef444411', border: '1px solid #ef444430',
        }}>
          <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>
            ⚠ This will permanently replace the current plan and reset all progress. Are you sure?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleApply}
              disabled={applying}
              style={{ ...primaryBtn, background: '#ef4444', borderColor: '#ef4444' }}
            >{applying ? 'Applying…' : 'Yes, replace plan'}</button>
            <button onClick={() => setConfirm(false)} style={ghostBtn}>Cancel</button>
          </div>
          {error && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{error}</p>}
        </div>
      )}
    </section>
  )
}

function AccountDetailsModal({ account, onClose, onUpdate }: { account: Account; onClose: () => void; onUpdate: (a: Account) => void }) {
  const [name, setName] = useState(account.name)
  const [sku, setSku] = useState<string>(account.sku)
  const [addons, setAddons] = useState<string[]>(account.addons || [])
  const [arr, setArr] = useState(String(account.arr || ''))
  const [goLive, setGoLive] = useState<string>(account.go_live_date || '')
  const [kickoff, setKickoff] = useState<string>(account.kickoff_date || '')
  const [pausedDays, setPausedDays] = useState<string>(String(account.paused_days ?? ''))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const supabase = createClient()

  const SKU_OPTIONS = [['dispatch', 'Dispatch'], ['facility_management', 'Facility Mgmt'], ['full_suite', 'Full Suite']] as const
  const ADDON_OPTIONS = ['brokerage', 'export', 'api'] as const
  const SKU_COLORS_MAP: Record<string, string> = { dispatch: '#f59e0b', facility_management: '#8b5cf6', full_suite: '#3b82f6' }

  const toggleAddon = (addon: string) =>
    setAddons(prev => prev.includes(addon) ? prev.filter(a => a !== addon) : [...prev, addon])

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    const parsedArr = parseInt(arr) || 0
    const patch = {
      name: name.trim() || account.name,
      sku,
      addons,
      arr: parsedArr,
      go_live_date: goLive || null,
      kickoff_date: kickoff || null,
      paused_days: parseInt(pausedDays) || 0,
    }
    const { error } = await supabase.from('accounts').update(patch).eq('id', account.id)
    if (error) {
      console.error('[AccountDetailsModal] save failed', error)
      setSaveError(error.message || 'Save failed')
      setSaving(false)
      return
    }
    onUpdate({
      ...account,
      name: patch.name,
      sku: sku as Sku,
      addons: addons as Addon[],
      arr: parsedArr,
      go_live_date: patch.go_live_date,
      kickoff_date: patch.kickoff_date,
      paused_days: patch.paused_days,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 24, width: 480, maxWidth: '90vw',
          maxHeight: '90vh', overflow: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>Account Details</h2>
          <button onClick={onClose} style={{ ...ghostBtn, padding: '4px 10px' }}>Close</button>
        </div>

        <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>
          Name
          <input value={name} onChange={e => setName(e.target.value)}
            style={{ ...inputStyle, fontSize: 13, marginTop: 4 }} />
        </label>

        <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>
          ARR ($)
          <input value={arr} onChange={e => setArr(e.target.value)} type="number"
            style={{ ...inputStyle, fontSize: 13, marginTop: 4 }} />
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, flex: 1 }}>
            Kickoff date
            <input value={kickoff} onChange={e => setKickoff(e.target.value)} type="date"
              style={{ ...inputStyle, fontSize: 13, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, flex: 1 }}>
            Go Live date
            <input value={goLive} onChange={e => setGoLive(e.target.value)} type="date"
              style={{ ...inputStyle, fontSize: 13, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }} title="Days spent on-hold or blocked — excluded from Days to Live">
            Paused days
            <input value={pausedDays} onChange={e => setPausedDays(e.target.value)} type="number" min="0"
              placeholder="0" style={{ ...inputStyle, fontSize: 13, marginTop: 4, width: 80 }} />
          </label>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6 }}>SKU</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {SKU_OPTIONS.map(([val, label]) => (
              <button key={val} onClick={() => setSku(val)} style={{
                flex: 1, padding: '6px 0', borderRadius: 6,
                background: sku === val ? SKU_COLORS_MAP[val] + '22' : 'var(--bg-surface2)',
                border: `1px solid ${sku === val ? SKU_COLORS_MAP[val] : 'var(--border-b)'}`,
                color: sku === val ? SKU_COLORS_MAP[val] : 'var(--text-2)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6 }}>Add-ons</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {ADDON_OPTIONS.map(val => (
              <button key={val} onClick={() => toggleAddon(val)} style={{
                flex: 1, padding: '5px 0', borderRadius: 6,
                background: addons.includes(val) ? '#3b82f622' : 'var(--bg-surface2)',
                border: `1px solid ${addons.includes(val) ? '#3b82f6' : 'var(--border-b)'}`,
                color: addons.includes(val) ? '#3b82f6' : 'var(--text-2)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', textTransform: 'capitalize',
              }}>{val}</button>
            ))}
          </div>
        </div>

        {saveError && (
          <div style={{
            fontSize: 12, color: '#ef4444',
            background: '#ef444415', border: '1px solid #ef444440',
            borderRadius: 6, padding: '8px 10px',
          }}>
            {saveError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function ContactCard({ contact, onSave, onDelete }: {
  contact: Contact
  onSave: (updated: Contact) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name,  setName]  = useState(contact.name)
  const [role,  setRole]  = useState(contact.role  || '')
  const [email, setEmail] = useState(contact.email || '')
  const [phone, setPhone] = useState(contact.phone || '')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    await supabase.from('contacts').update({
      name, role: role || null, email: email || null, phone: phone || null,
    }).eq('id', contact.id)
    onSave({ ...contact, name, role: role || undefined, email: email || undefined, phone: phone || undefined })
    setSaving(false)
    setEditing(false)
  }

  const remove = async () => {
    await supabase.from('contacts').delete().eq('id', contact.id)
    onDelete(contact.id)
  }

  if (editing) {
    return (
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid #3b82f640', borderRadius: 7,
        padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <input value={name}  onChange={e => setName(e.target.value)}  placeholder="Name *"
          style={{ ...inputStyle, fontSize: 12, padding: '4px 8px' }} />
        <input value={role}  onChange={e => setRole(e.target.value)}  placeholder="Role"
          style={{ ...inputStyle, fontSize: 12, padding: '4px 8px' }} />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
          style={{ ...inputStyle, fontSize: 12, padding: '4px 8px' }} />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone"
          style={{ ...inputStyle, fontSize: 12, padding: '4px 8px' }} />
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, fontSize: 11, padding: '3px 10px' }}>
            {saving ? '…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} style={{ ...ghostBtn, fontSize: 11, padding: '3px 10px' }}>Cancel</button>
          <button onClick={remove} style={{ marginLeft: 'auto', background: 'none', border: 'none',
            color: '#ef444480', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-ui)' }}>Delete</button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7,
        padding: '10px 12px', cursor: 'pointer', position: 'relative',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#3b82f640')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>{contact.name}</div>
      {contact.role  && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{contact.role}</div>}
      {contact.email && <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{contact.email}</div>}
      {contact.phone && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{contact.phone}</div>}
      <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 10, color: 'var(--text-3)' }}>edit</span>
    </div>
  )
}

function ContactsSection({ account, onUpdate }: { account: Account; onUpdate: (a: Account) => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const supabase = createClient()

  const addContact = async () => {
    if (!name.trim()) return
    const { data } = await supabase.from('contacts').insert({
      account_id: account.id, name, role: role || null, email: email || null, phone: phone || null,
    }).select().single()
    if (data) {
      onUpdate({ ...account, contacts: [...(account.contacts || []), data as Contact] })
      setName(''); setRole(''); setEmail(''); setPhone(''); setShowAdd(false)
    }
  }

  const handleSave = (updated: Contact) => {
    onUpdate({ ...account, contacts: (account.contacts || []).map(c => c.id === updated.id ? updated : c) })
  }

  const handleDelete = (id: string) => {
    onUpdate({ ...account, contacts: (account.contacts || []).filter(c => c.id !== id) })
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={sectionLabel}>Contacts</span>
        <button onClick={() => setShowAdd(v => !v)} style={ghostBtn}>+ Add</button>
      </div>

      {showAdd && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <input value={name}  onChange={e => setName(e.target.value)}  placeholder="Name *" style={{ ...inputStyle, flex: '2 1 120px' }} />
          <input value={role}  onChange={e => setRole(e.target.value)}  placeholder="Role"   style={{ ...inputStyle, flex: '1 1 90px' }} />
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"  style={{ ...inputStyle, flex: '2 1 140px' }} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone"  style={{ ...inputStyle, flex: '1 1 110px' }} />
          <button onClick={addContact} style={primaryBtn}>Add</button>
        </div>
      )}

      {(account.contacts || []).length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No contacts added.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {(account.contacts || []).map(c => (
            <ContactCard key={c.id} contact={c} onSave={handleSave} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </section>
  )
}

function RequestsSection({ account, onUpdate }: { account: Account; onUpdate: (a: Account) => void }) {
  const supabase = createClient()
  const requests = account.requests || []

  const cycleStatus = async (req: Request) => {
    const cycle: Record<string, string> = { pending: 'sent', sent: 'received', received: 'complete', complete: 'pending' }
    const newStatus = cycle[req.status] || 'pending'
    await supabase.from('requests').update({ status: newStatus }).eq('id', req.id)
    onUpdate({
      ...account,
      requests: requests.map(r => r.id === req.id ? { ...r, status: newStatus as Request['status'] } : r),
    })
  }

  const STATUS_COLORS: Record<string, string> = {
    pending: 'var(--text-3)', sent: '#3b82f6', received: '#f59e0b', complete: '#10b981',
  }

  return (
    <section>
      <span style={{ ...sectionLabel, display: 'block', marginBottom: 10 }}>Requests</span>
      {requests.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No requests tracked.</p>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
          {requests.map((req, idx) => (
            <div key={req.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              borderBottom: idx < requests.length - 1 ? '1px solid var(--bg-surface3)' : 'none',
            }}>
              <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{req.label}</span>
              <button
                onClick={() => cycleStatus(req)}
                style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  background: (STATUS_COLORS[req.status] || 'var(--text-3)') + '20',
                  color: STATUS_COLORS[req.status] || 'var(--text-3)',
                  border: `1px solid ${(STATUS_COLORS[req.status] || 'var(--text-3)')}44`,
                  cursor: 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'capitalize',
                }}
              >{req.status}</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const primaryBtn: React.CSSProperties = {
  background: '#3b82f6', border: 'none', borderRadius: 6,
  padding: '7px 16px', color: '#fff', fontSize: 12,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-surface2)', border: '1px solid var(--border-b)',
  borderRadius: 6, padding: '7px 10px', color: 'var(--text-h)',
  fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none', display: 'block',
}
const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
}

// ─── AI Tab ──────────────────────────────────────────────────────────────────

function AITab({ account }: { account: Account }) {
  const [emailContext, setEmailContext]   = useState('')
  const [emailResult, setEmailResult]     = useState<{ subject: string; body: string } | null>(null)
  const [emailLoading, setEmailLoading]   = useState(false)
  const [summary, setSummary]             = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [copied, setCopied]               = useState(false)
  const supabase = createClient()

  const getSummary = async () => {
    setSummaryLoading(true)
    setSummary(null)
    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      })
      const data = await res.json()
      setSummary(data.summary)
    } finally {
      setSummaryLoading(false)
    }
  }

  const draftEmail = async () => {
    setEmailLoading(true)
    setEmailResult(null)
    try {
      const res = await fetch('/api/ai/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id, context: emailContext }),
      })
      const data = await res.json()
      setEmailResult(data)
    } finally {
      setEmailLoading(false)
    }
  }

  // Auto-generate summary when AI tab opens; clear the pending dot
  useEffect(() => {
    getSummary()
    supabase
      .from('ai_suggestions')
      .update({ status: 'viewed' })
      .eq('account_id', account.id)
      .eq('status', 'pending')
      .then(() => {})
  }, [account.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyEmail = () => {
    if (!emailResult) return
    navigator.clipboard.writeText(`Subject: ${emailResult.subject}\n\n${emailResult.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Account Summary */}
      <div style={aiCard}>
        <div style={aiCardHeader}>
          <span style={aiCardTitle}>Account Summary</span>
          {summary && !summaryLoading && (
            <button onClick={getSummary} style={aiBtn}>Regenerate</button>
          )}
        </div>
        {summaryLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Generating summary…</span>
          </div>
        ) : summary ? (
          <div style={{ marginTop: 4 }}>
            {summary.split('\n').filter(l => l.trim()).map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#3b82f6', flexShrink: 0, marginTop: 1 }}>•</span>
                <span style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                  {line.replace(/^•\s*/, '')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--text-2)' }}>
            No recent interactions to summarize yet.
          </p>
        )}
      </div>

      {/* Draft Email */}
      <div style={aiCard}>
        <div style={aiCardHeader}>
          <span style={aiCardTitle}>Draft Follow-up Email</span>
          {emailResult && (
            <button onClick={copyEmail} style={{ ...aiBtn, background: copied ? '#10b98120' : undefined, color: copied ? '#10b981' : undefined }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 12 }}>
          Optional: add context for what to address in the email.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: emailResult ? 16 : 0 }}>
          <input
            value={emailContext}
            onChange={e => setEmailContext(e.target.value)}
            placeholder="e.g. follow up on missing data file, check in after training session..."
            style={{
              flex: 1, background: 'var(--bg-surface2)', border: '1px solid var(--border-b)',
              borderRadius: 6, padding: '7px 10px', color: 'var(--text-h)',
              fontSize: 12, fontFamily: 'var(--font-ui)', outline: 'none',
            }}
            onKeyDown={e => e.key === 'Enter' && draftEmail()}
          />
          <button onClick={draftEmail} disabled={emailLoading} style={aiBtn}>
            {emailLoading ? 'Drafting…' : emailResult ? 'Redraft' : 'Draft'}
          </button>
        </div>
        {emailResult && (
          <div style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>
              Subject: {emailResult.subject}
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {emailResult.body}
            </div>
          </div>
        )}
      </div>

      {/* Hint — next steps live in Action Items */}
      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
        ✦ Suggested next steps and action items live in{' '}
        <strong style={{ color: 'var(--text-2)' }}>Action Items → AI Suggestions</strong>.
        Use the &ldquo;Scan plans&rdquo; button there to generate fresh recommendations across all accounts.
      </p>
    </div>
  )
}

// ─── Session Modal ────────────────────────────────────────────────────────────

function SessionModal({ item, onClose, onUpdate }: {
  item: Item
  onClose: () => void
  onUpdate: (updated: Item) => void
}) {
  const supabase = createClient()
  const isComplete = item.session_status === 'complete'

  // Local state for all session fields
  const [name, setName] = useState(item.session_name || '')
  const [notes, setNotes] = useState(item.session_notes || '')
  const [agenda, setAgenda] = useState<string[]>(item.session_agenda || [])
  const [agendaInput, setAgendaInput] = useState('')
  const [actionItems, setActionItems] = useState<SessionActionItem[]>(item.session_action_items || [])
  const [actionInput, setActionInput] = useState('')
  const [saving, setSaving] = useState(false)

  const patch = async (fields: Partial<Item>) => {
    await supabase.from('items').update(fields).eq('id', item.id)
    onUpdate({ ...item, ...fields })
  }

  const saveName = async () => {
    if (name.trim() && name.trim() !== item.session_name) {
      await patch({ session_name: name.trim() })
    }
  }

  const saveNotes = async () => {
    await patch({ session_notes: notes })
  }

  const addAgendaItem = async () => {
    if (!agendaInput.trim()) return
    const next = [...agenda, agendaInput.trim()]
    setAgenda(next)
    setAgendaInput('')
    await patch({ session_agenda: next })
  }

  const removeAgendaItem = async (idx: number) => {
    const next = agenda.filter((_, i) => i !== idx)
    setAgenda(next)
    await patch({ session_agenda: next })
  }

  const addActionItem = async () => {
    if (!actionInput.trim()) return
    const newItem: SessionActionItem = {
      id: crypto.randomUUID(),
      text: actionInput.trim(),
      done: false,
      created_at: new Date().toISOString(),
    }
    const next = [...actionItems, newItem]
    setActionItems(next)
    setActionInput('')
    await patch({ session_action_items: next })
  }

  const toggleActionItem = async (id: string) => {
    const next = actionItems.map(a => a.id === id ? { ...a, done: !a.done } : a)
    setActionItems(next)
    await patch({ session_action_items: next })
  }

  const removeActionItem = async (id: string) => {
    const next = actionItems.filter(a => a.id !== id)
    setActionItems(next)
    await patch({ session_action_items: next })
  }

  const toggleComplete = async () => {
    setSaving(true)
    const newStatus = isComplete ? 'pending' : 'complete'
    await patch({ session_status: newStatus })
    setSaving(false)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, width: '100%', maxWidth: 680,
        maxHeight: '85vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#8b5cf618', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>SESSION</span>
              {isComplete && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#10b98118', color: '#10b981', fontFamily: 'var(--font-mono)' }}>COMPLETE</span>}
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
              style={{
                fontSize: 18, fontWeight: 700, color: 'var(--text-h)',
                background: 'none', border: 'none', outline: 'none',
                width: '100%', fontFamily: 'var(--font-ui)',
              }}
              placeholder="Session name..."
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={toggleComplete}
              disabled={saving}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-ui)',
                background: isComplete ? '#10b98120' : '#8b5cf620',
                border: `1px solid ${isComplete ? '#10b98140' : '#8b5cf640'}`,
                color: isComplete ? '#10b981' : '#8b5cf6',
              }}
            >
              {isComplete ? '↩ Reopen' : '✓ Mark Complete'}
            </button>
            <button onClick={onClose} style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 12px', color: 'var(--text-2)', fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--font-ui)',
            }}>✕</button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Agenda */}
          <div>
            <div style={sectionLabel}>Agenda</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {agenda.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>No agenda items yet.</p>
              )}
              {agenda.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                  <span style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{item}</span>
                  <button onClick={() => removeAgendaItem(i)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={agendaInput}
                onChange={e => setAgendaInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addAgendaItem() }}
                placeholder="Add agenda item..."
                style={{ ...modalInputStyle, flex: 1 }}
              />
              {agendaInput.trim() && (
                <button onClick={addAgendaItem} style={modalAddBtn}>Add</button>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div style={sectionLabel}>Notes</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Session notes, outcomes, key decisions..."
              rows={5}
              style={{
                ...modalInputStyle, width: '100%', resize: 'vertical',
                lineHeight: 1.6, fontFamily: 'var(--font-ui)',
              }}
            />
          </div>

          {/* Action Items */}
          <div>
            <div style={sectionLabel}>Action Items</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
              {actionItems.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>No action items yet.</p>
              )}
              {actionItems.map(ai => (
                <div key={ai.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div
                    onClick={() => toggleActionItem(ai.id)}
                    style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: ai.done ? 'none' : '1.5px solid var(--border-b)',
                      background: ai.done ? '#10b981' : 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {ai.done && <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{
                    fontSize: 13, color: ai.done ? 'var(--text-3)' : 'var(--text)', flex: 1,
                    textDecoration: ai.done ? 'line-through' : 'none',
                  }}>{ai.text}</span>
                  <button onClick={() => removeActionItem(ai.id)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={actionInput}
                onChange={e => setActionInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addActionItem() }}
                placeholder="Add action item..."
                style={{ ...modalInputStyle, flex: 1 }}
              />
              {actionInput.trim() && (
                <button onClick={addActionItem} style={modalAddBtn}>Add</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const modalInputStyle: React.CSSProperties = {
  background: 'var(--bg-surface2)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '7px 10px', color: 'var(--text-h)',
  fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none',
}
const modalAddBtn: React.CSSProperties = {
  background: '#3b82f620', border: '1px solid #3b82f640', borderRadius: 6,
  padding: '5px 14px', color: '#93c5fd', fontSize: 12,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
}

const aiCard: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px',
}
const aiCardHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
}
const aiCardTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: 'var(--text-h)',
}
const aiBtn: React.CSSProperties = {
  background: '#3b82f620', border: '1px solid #3b82f640', borderRadius: 6,
  padding: '5px 14px', color: '#93c5fd', fontSize: 12,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
}
