'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TrainingTemplate, SessionTemplate, Connector, PlanTemplate, PlanTemplateMilestone, PlanTemplateStage, PlanTemplateItem } from '@/types'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const SKU_OPTIONS = ['dispatch', 'facility_management', 'full_suite']
const SKU_LABELS: Record<string, string> = { dispatch: 'Dispatch', facility_management: 'Facility Mgmt', full_suite: 'Full Suite' }
const ADDON_OPTIONS = ['brokerage', 'export', 'api']

interface ConnectorToken {
  provider: string
  scopes: string[]
  google_email?: string
  updated_at?: string
}

interface Props {
  section?: 'templates' | 'connectors'
  trainingTemplates: TrainingTemplate[]
  planTemplates: PlanTemplate[]
  sessionTemplates: SessionTemplate[]
  connectors: Connector[]
  connectorTokens: ConnectorToken[]
  onTemplatesChange?: () => Promise<void>
}

export function SettingsView({ section, trainingTemplates: initial, planTemplates: initialPlans, sessionTemplates: initialSessions, connectors, connectorTokens, onTemplatesChange }: Props) {
  const [tab, setTab] = useState<'training' | 'sessions' | 'plans' | 'connectors'>(
    section === 'connectors' ? 'connectors' : 'plans'
  )

  return (
    <div style={{ padding: '24px 28px', maxWidth: 720 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-h)', marginBottom: 20 }}>
        {section === 'connectors' ? 'Settings' : 'Templates'}
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {(section === 'connectors'
          ? [['connectors', 'Connectors']] as const
          : [['plans', 'Plan Templates'], ['sessions', 'Session Templates'], ['training', 'Training Templates']] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as typeof tab)} style={{
            background: 'none', border: 'none',
            borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
            padding: '8px 14px', marginBottom: -1,
            color: tab === id ? 'var(--text-h)' : 'var(--text-2)',
            fontSize: 13, fontWeight: tab === id ? 600 : 400,
            cursor: 'pointer', fontFamily: 'var(--font-ui)',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'training' && (
        <TrainingTemplatesPanel
          trainingTemplates={initial}
          onTemplatesChange={onTemplatesChange}
        />
      )}

      {tab === 'sessions' && (
        <SessionTemplatesPanel
          sessionTemplates={initialSessions}
          onTemplatesChange={onTemplatesChange}
        />
      )}

      {tab === 'plans' && (
        <PlanTemplatesPanel
          planTemplates={initialPlans}
          sessionTemplates={initialSessions}
          trainingTemplates={initial}
          onTemplatesChange={onTemplatesChange}
        />
      )}

      {tab === 'connectors' && (
        <>
          <ConnectorsPanel connectors={connectors} connectorTokens={connectorTokens} />
          <UnmatchedSignalsPanel />
        </>
      )}

    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  background: 'var(--accent)', border: 'none', borderRadius: 6,
  padding: '7px 16px', color: '#fff', fontSize: 12,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-surface2)', border: '1px solid var(--border-b)',
  borderRadius: 6, padding: '7px 10px', color: 'var(--text-h)',
  fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none', display: 'block', marginTop: 4,
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-2)', fontWeight: 600,
}

// ─── Training Templates Panel ─────────────────────────────────────────────────

function TrainingTemplatesPanel({ trainingTemplates: initialTemplates, onTemplatesChange }: { trainingTemplates: TrainingTemplate[]; onTemplatesChange?: () => Promise<void> }) {
  const [templates, setTemplates] = useState<TrainingTemplate[]>(initialTemplates)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const supabase = createClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('')
  const [agenda, setAgenda] = useState<string[]>([])
  const [agendaInput, setAgendaInput] = useState('')
  const [tasks, setTasks] = useState<{ name: string; assignee: string }[]>([])
  const [taskInput, setTaskInput] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('personal')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setTemplates(initialTemplates) }, [initialTemplates])

  const resetForm = () => {
    setName(''); setDescription(''); setDuration('')
    setAgenda([]); setAgendaInput('')
    setTasks([]); setTaskInput(''); setTaskAssignee('personal')
  }

  const startEdit = (t: TrainingTemplate) => {
    setEditingId(t.id)
    setName(t.name)
    setDescription(t.description || '')
    setDuration(t.duration_minutes ? String(t.duration_minutes) : '')
    setAgenda(t.agenda || [])
    setTasks(t.tasks || [])
    setAgendaInput('')
    setTaskInput(''); setTaskAssignee('personal')
    setShowAdd(false)
  }

  const cancelEdit = () => { setEditingId(null); resetForm() }

  const addAgendaItem = () => {
    if (!agendaInput.trim()) return
    setAgenda(prev => [...prev, agendaInput.trim()])
    setAgendaInput('')
  }

  const addTask = () => {
    if (!taskInput.trim()) return
    setTasks(prev => [...prev, { name: taskInput.trim(), assignee: taskAssignee }])
    setTaskInput(''); setTaskAssignee('personal')
  }

  const buildPayload = () => ({
    name: name.trim(),
    description: description || null,
    duration_minutes: duration ? parseInt(duration) : null,
    agenda,
    tasks,
  })

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
    if (!member) { setSaving(false); return }
    const { data } = await supabase.from('training_templates').insert({ org_id: member.org_id, ...buildPayload() }).select().single()
    if (data) {
      setTemplates(prev => [...prev, data as TrainingTemplate])
      resetForm(); setShowAdd(false)
      await onTemplatesChange?.()
    }
    setSaving(false)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !name.trim()) return
    setSaving(true)
    const { data } = await supabase.from('training_templates').update(buildPayload()).eq('id', editingId).select().single()
    if (data) {
      setTemplates(prev => prev.map(t => t.id === editingId ? data as TrainingTemplate : t))
      cancelEdit()
      await onTemplatesChange?.()
    }
    setSaving(false)
  }

  const handleClone = async (t: TrainingTemplate) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
    if (!member) return
    const { data } = await supabase.from('training_templates').insert({
      org_id: member.org_id,
      name: `Copy of ${t.name}`,
      description: t.description || null,
      duration_minutes: t.duration_minutes || null,
      agenda: t.agenda || [],
      tasks: t.tasks || [],
    }).select().single()
    if (data) {
      setTemplates(prev => [...prev, data as TrainingTemplate])
      await onTemplatesChange?.()
    }
  }

  const handleDelete = async (id: string) => {
    await supabase.from('training_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
    await onTemplatesChange?.()
  }

  const ASSIGNEE_COLORS: Record<string, string> = { personal: '#1BB3BB', customer: '#f59e0b', internal: '#6b7280' }

  const renderForm = (onSubmit: () => void, submitLabel: string) => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <label style={labelStyle}>Name *
          <input name="training-name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Dispatcher Training" />
        </label>
        <label style={labelStyle}>Duration (minutes)
          <input name="training-duration" value={duration} onChange={e => setDuration(e.target.value)} style={inputStyle} placeholder="60" type="number" />
        </label>
      </div>
      <label style={{ ...labelStyle, display: 'block', marginBottom: 12 }}>Description
        <textarea name="training-description" value={description} onChange={e => setDescription(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }} rows={2} placeholder="What this training covers..." />
      </label>

      {/* Agenda editor */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6 }}>Agenda Items</div>
        {agenda.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 16 }}>{i + 1}.</span>
            <input name={`training-agenda-${i}`} value={item}
              onChange={e => setAgenda(prev => prev.map((a, j) => j === i ? e.target.value : a))}
              style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
            <button onClick={() => setAgenda(prev => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <input name="training-agenda-new" value={agendaInput} onChange={e => setAgendaInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAgendaItem() } }}
            style={{ ...inputStyle, marginTop: 0, flex: 1 }} placeholder="Add agenda item…" />
          <button onClick={addAgendaItem} style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border-b)', borderRadius: 6, padding: '0 12px', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>+</button>
        </div>
      </div>

      {/* Tasks editor */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6 }}>Associated Tasks</div>
        {tasks.map((task, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
              background: `${ASSIGNEE_COLORS[task.assignee] || '#6b7280'}18`,
              border: `1px solid ${ASSIGNEE_COLORS[task.assignee] || '#6b7280'}44`,
              color: ASSIGNEE_COLORS[task.assignee] || '#6b7280', minWidth: 52, textAlign: 'center' }}>
              {task.assignee}
            </span>
            <input name={`training-task-${i}`} value={task.name}
              onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, name: e.target.value } : t))}
              style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
            <button onClick={() => setTasks(prev => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <select name="training-task-assignee" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)}
            style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border-b)', borderRadius: 6, padding: '7px 8px',
              color: ASSIGNEE_COLORS[taskAssignee] || 'var(--text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', marginTop: 0 }}>
            <option value="personal">personal</option>
            <option value="customer">customer</option>
            <option value="internal">internal</option>
          </select>
          <input name="training-task-new" value={taskInput} onChange={e => setTaskInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask() } }}
            style={{ ...inputStyle, marginTop: 0, flex: 1 }} placeholder="Add task…" />
          <button onClick={addTask} style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border-b)', borderRadius: 6, padding: '0 12px', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>+</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {editingId && (
          <button onClick={cancelEdit} style={{ background: 'none', border: '1px solid var(--border-b)', borderRadius: 6, padding: '5px 14px', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Cancel</button>
        )}
        <button onClick={onSubmit} disabled={saving || !name.trim()} style={primaryBtn}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
        Create reusable training templates with agendas and default tasks. Attach them to plan template items.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={() => { setShowAdd(v => !v); if (editingId) cancelEdit() }} style={primaryBtn}>
          {showAdd ? '✕ Cancel' : '+ Add Training Template'}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-b)', borderRadius: 8, padding: '18px 20px', marginBottom: 16 }}>
          {renderForm(handleAdd, 'Save Template')}
        </div>
      )}

      {templates.length === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
          No training templates yet. Add one above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} style={{
              background: 'var(--bg-surface)', border: `1px solid ${editingId === t.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '14px 16px',
            }}>
              {editingId === t.id ? (
                renderForm(handleSaveEdit, 'Save')
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: (t.description || (t.agenda?.length ?? 0) > 0 || (t.tasks?.length ?? 0) > 0) ? 8 : 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', flex: 1 }}>{t.name}</span>
                    {t.duration_minutes && (
                      <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{t.duration_minutes}min</span>
                    )}
                    <button onClick={() => startEdit(t)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 9px', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-h)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>Edit</button>
                    <button onClick={() => handleClone(t)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 9px', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#5DDDE3')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>Clone</button>
                    <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
                  </div>
                  {t.description && (
                    <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{t.description}</p>
                  )}
                  {t.agenda && t.agenda.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Agenda</div>
                      <ol style={{ margin: 0, paddingLeft: 18 }}>
                        {t.agenda.map((item, i) => (
                          <li key={i} style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 2 }}>{item}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {t.tasks && t.tasks.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tasks</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {t.tasks.map((task, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                              background: `${ASSIGNEE_COLORS[task.assignee] || '#6b7280'}18`,
                              border: `1px solid ${ASSIGNEE_COLORS[task.assignee] || '#6b7280'}44`,
                              color: ASSIGNEE_COLORS[task.assignee] || '#6b7280' }}>{task.assignee}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{task.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Session Templates Panel ──────────────────────────────────────────────────

function SessionTemplatesPanel({ sessionTemplates: initialTemplates, onTemplatesChange }: { sessionTemplates: SessionTemplate[]; onTemplatesChange?: () => Promise<void> }) {
  const [templates, setTemplates] = useState<SessionTemplate[]>(initialTemplates)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const supabase = createClient()

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('')
  const [agenda, setAgenda] = useState<string[]>([])
  const [agendaInput, setAgendaInput] = useState('')
  const [tasks, setTasks] = useState<{ name: string; assignee: string }[]>([])
  const [taskInput, setTaskInput] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('personal')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setTemplates(initialTemplates) }, [initialTemplates])

  const resetForm = () => {
    setName(''); setDescription(''); setDuration('')
    setAgenda([]); setAgendaInput('')
    setTasks([]); setTaskInput(''); setTaskAssignee('personal')
  }

  const startEdit = (t: SessionTemplate) => {
    setEditingId(t.id)
    setName(t.name)
    setDescription(t.description || '')
    setDuration(t.duration_minutes ? String(t.duration_minutes) : '')
    setAgenda(t.agenda || [])
    setTasks(t.tasks || [])
    setAgendaInput('')
    setTaskInput(''); setTaskAssignee('personal')
    setShowAdd(false)
  }

  const cancelEdit = () => { setEditingId(null); resetForm() }

  const addAgendaItem = () => {
    if (!agendaInput.trim()) return
    setAgenda(prev => [...prev, agendaInput.trim()])
    setAgendaInput('')
  }

  const addTask = () => {
    if (!taskInput.trim()) return
    setTasks(prev => [...prev, { name: taskInput.trim(), assignee: taskAssignee }])
    setTaskInput(''); setTaskAssignee('personal')
  }

  const buildPayload = () => ({
    name: name.trim(),
    description: description || null,
    duration_minutes: duration ? parseInt(duration) : null,
    agenda,
    tasks,
  })

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
    if (!member) { setSaving(false); return }

    const { data } = await supabase.from('session_templates').insert({ org_id: member.org_id, ...buildPayload() }).select().single()
    if (data) {
      setTemplates(prev => [...prev, data as SessionTemplate])
      resetForm(); setShowAdd(false)
      await onTemplatesChange?.()
    }
    setSaving(false)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !name.trim()) return
    setSaving(true)
    const { data } = await supabase.from('session_templates').update(buildPayload()).eq('id', editingId).select().single()
    if (data) {
      setTemplates(prev => prev.map(t => t.id === editingId ? data as SessionTemplate : t))
      cancelEdit()
      await onTemplatesChange?.()
    }
    setSaving(false)
  }

  const handleClone = async (t: SessionTemplate) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
    if (!member) return
    const { data } = await supabase.from('session_templates').insert({
      org_id: member.org_id,
      name: `Copy of ${t.name}`,
      description: t.description || null,
      duration_minutes: t.duration_minutes || null,
      agenda: t.agenda || [],
      tasks: t.tasks || [],
    }).select().single()
    if (data) {
      setTemplates(prev => [...prev, data as SessionTemplate])
      await onTemplatesChange?.()
    }
  }

  const handleDelete = async (id: string) => {
    await supabase.from('session_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
    await onTemplatesChange?.()
  }

  const ASSIGNEE_COLORS: Record<string, string> = { personal: '#1BB3BB', customer: '#f59e0b', internal: '#6b7280' }

  const renderTemplateForm = (onSubmit: () => void, submitLabel: string) => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <label style={labelStyle}>Name *
          <input name="session-name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Kickoff Meeting" />
        </label>
        <label style={labelStyle}>Duration (minutes)
          <input name="session-duration" value={duration} onChange={e => setDuration(e.target.value)} style={inputStyle} placeholder="60" type="number" />
        </label>
      </div>
      <label style={{ ...labelStyle, display: 'block', marginBottom: 12 }}>Description
        <textarea name="session-description" value={description} onChange={e => setDescription(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }} rows={2}
          placeholder="Purpose of this session..." />
      </label>

      {/* Agenda editor */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6 }}>Agenda Items</div>
        {agenda.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 16 }}>{i + 1}.</span>
            <input
              name={`agenda-item-${i}`}
              value={item}
              onChange={e => setAgenda(prev => prev.map((a, j) => j === i ? e.target.value : a))}
              style={{ ...inputStyle, marginTop: 0, flex: 1 }}
            />
            <button onClick={() => setAgenda(prev => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            name="agenda-new-item"
            value={agendaInput}
            onChange={e => setAgendaInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAgendaItem() } }}
            style={{ ...inputStyle, marginTop: 0, flex: 1 }}
            placeholder="Add agenda item…"
          />
          <button onClick={addAgendaItem} style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border-b)', borderRadius: 6, padding: '0 12px', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>+</button>
        </div>
      </div>

      {/* Tasks editor */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6 }}>Associated Tasks</div>
        {tasks.map((task, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
              background: `${ASSIGNEE_COLORS[task.assignee] || '#6b7280'}18`,
              border: `1px solid ${ASSIGNEE_COLORS[task.assignee] || '#6b7280'}44`,
              color: ASSIGNEE_COLORS[task.assignee] || '#6b7280', minWidth: 52, textAlign: 'center' }}>
              {task.assignee}
            </span>
            <input
              name={`task-name-${i}`}
              value={task.name}
              onChange={e => setTasks(prev => prev.map((t, j) => j === i ? { ...t, name: e.target.value } : t))}
              style={{ ...inputStyle, marginTop: 0, flex: 1 }}
            />
            <button onClick={() => setTasks(prev => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <select name="task-assignee" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)}
            style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border-b)', borderRadius: 6, padding: '7px 8px',
              color: ASSIGNEE_COLORS[taskAssignee] || 'var(--text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', marginTop: 0 }}>
            <option value="personal">personal</option>
            <option value="customer">customer</option>
            <option value="internal">internal</option>
          </select>
          <input
            name="task-new-item"
            value={taskInput}
            onChange={e => setTaskInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask() } }}
            style={{ ...inputStyle, marginTop: 0, flex: 1 }}
            placeholder="Add task…"
          />
          <button onClick={addTask} style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border-b)', borderRadius: 6, padding: '0 12px', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>+</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {editingId && (
          <button onClick={cancelEdit} style={{ background: 'none', border: '1px solid var(--border-b)', borderRadius: 6, padding: '5px 14px', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Cancel</button>
        )}
        <button onClick={onSubmit} disabled={saving || !name.trim()} style={primaryBtn}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
        Create reusable session templates with agendas and default tasks. Attach them to plan template items.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={() => { setShowAdd(v => !v); if (editingId) cancelEdit() }} style={primaryBtn}>
          {showAdd ? '✕ Cancel' : '+ Add Session Template'}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-b)', borderRadius: 8, padding: '18px 20px', marginBottom: 16 }}>
          {renderTemplateForm(handleAdd, 'Save Template')}
        </div>
      )}

      {templates.length === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
          No session templates yet. Add one above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} style={{
              background: 'var(--bg-surface)', border: `1px solid ${editingId === t.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '14px 16px',
            }}>
              {editingId === t.id ? (
                renderTemplateForm(handleSaveEdit, 'Save')
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: (t.description || (t.agenda?.length ?? 0) > 0 || (t.tasks?.length ?? 0) > 0) ? 8 : 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', flex: 1 }}>{t.name}</span>
                    {t.duration_minutes && (
                      <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{t.duration_minutes}min</span>
                    )}
                    <button onClick={() => startEdit(t)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 9px', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-h)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>Edit</button>
                    <button onClick={() => handleClone(t)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 9px', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#5DDDE3')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>Clone</button>
                    <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
                  </div>
                  {t.description && (
                    <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{t.description}</p>
                  )}
                  {t.agenda && t.agenda.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Agenda</div>
                      <ol style={{ margin: 0, paddingLeft: 18 }}>
                        {t.agenda.map((item, i) => (
                          <li key={i} style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 2 }}>{item}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {t.tasks && t.tasks.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tasks</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {t.tasks.map((task, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                              background: `${ASSIGNEE_COLORS[task.assignee] || '#6b7280'}18`,
                              border: `1px solid ${ASSIGNEE_COLORS[task.assignee] || '#6b7280'}44`,
                              color: ASSIGNEE_COLORS[task.assignee] || '#6b7280' }}>{task.assignee}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{task.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Plan Templates Panel ──────────────────────────────────────────────────────

const DEFAULT_STRUCTURE = {
  milestones: [
    {
      name: 'Configuration',
      stages: [
        { name: 'Account Creation', items: [
          { type: 'task', name: 'Add primary contacts',   assignee: 'personal', required: true },
          { type: 'task', name: 'Select products / SKUs', assignee: 'personal', required: true },
          { type: 'task', name: 'Set ARR',                assignee: 'personal', required: true },
          { type: 'task', name: 'Add sales context',      assignee: 'personal', required: true },
        ]},
        { name: 'Kickoff', items: [
          { type: 'session',   name: 'Kickoff Meeting',  required: true },
          { type: 'exchange',  name: 'Data Template',    required: true },
        ]},
        { name: 'Discovery', items: [
          { type: 'session',  name: 'Discovery Meeting', required: true },
          { type: 'exchange', name: 'Hardware Doc',      required: true },
          { type: 'exchange', name: 'Compliance Doc',    required: true },
          { type: 'exchange', name: 'Reporting Doc',     required: true },
          { type: 'exchange', name: 'Accounting Doc',    required: true },
        ]},
        { name: 'Environment Setup', items: [
          { type: 'task', name: 'Upload Data',             assignee: 'personal', required: true },
          { type: 'task', name: 'Integrate Hardware',      assignee: 'personal', required: true },
          { type: 'task', name: 'Set Up Compliance Flows', assignee: 'personal', required: true },
          { type: 'task', name: 'Integrate Accounting',    assignee: 'personal', required: true },
          { type: 'task', name: 'Custom Workflow Setup',   assignee: 'personal', required: false },
        ]},
      ],
    },
    {
      name: 'Training',
      stages: [],
    },
    {
      name: 'Validation',
      stages: [
        { name: 'User Testing', items: [
          { type: 'log', name: 'Daily Job/Ticket Usage', required: true },
        ]},
        { name: 'Readiness Review', items: [
          { type: 'session',  name: 'Q&A',                          required: true },
          { type: 'exchange', name: 'Pre-Launch Checklist',          required: true },
          { type: 'task',     name: 'Review Pre-Launch Checklist',   assignee: 'personal', required: true },
        ]},
      ],
    },
    {
      name: 'Go-Live',
      stages: [
        { name: 'Launch', items: [
          { type: 'task',    name: 'Usage Review',         assignee: 'personal', required: true },
          { type: 'session', name: 'Post-Launch Check-In', required: false },
          { type: 'handoff', name: 'CSM Handoff',          required: false },
        ]},
      ],
    },
  ],
}

function PlanTemplatesPanel({ planTemplates: initialTemplates, sessionTemplates, trainingTemplates, onTemplatesChange }: { planTemplates: PlanTemplate[]; sessionTemplates: SessionTemplate[]; trainingTemplates: TrainingTemplate[]; onTemplatesChange?: () => Promise<void> }) {
  const [templates, setTemplates] = useState<PlanTemplate[]>(initialTemplates)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSku, setNewSku] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pushingId, setPushingId] = useState<string | null>(null)
  const [pushResult, setPushResult] = useState<{ id: string; message: string } | null>(null)
  const [deduping, setDeduping] = useState(false)
  const [dedupeResult, setDedupeResult] = useState<string | null>(null)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [archivedTemplates, setArchivedTemplates] = useState<PlanTemplate[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [archivedLoaded, setArchivedLoaded] = useState(false)
  const supabase = createClient()

  const handleSaveName = async (id: string) => {
    const trimmed = editingNameValue.trim()
    if (!trimmed) { setEditingNameId(null); return }
    await supabase.from('plan_templates').update({ name: trimmed }).eq('id', id)
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, name: trimmed } : t))
    setEditingNameId(null)
    await onTemplatesChange?.()
  }

  const loadArchived = async () => {
    if (archivedLoaded) return
    const { data } = await supabase.from('plan_templates').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false })
    setArchivedTemplates(data ?? [])
    setArchivedLoaded(true)
  }

  const handleDedupeAll = async () => {
    setDeduping(true)
    setDedupeResult(null)
    const res = await fetch('/api/dedupe-plan-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const data = await res.json()
    setDeduping(false)
    if (data.error) {
      setDedupeResult(`Error: ${data.error}`)
    } else {
      setDedupeResult(data.removed === 0 ? 'No duplicates found.' : `Removed ${data.removed} duplicate item${data.removed !== 1 ? 's' : ''} across ${data.details?.length ?? 0} account${data.details?.length !== 1 ? 's' : ''}.`)
    }
  }

  const handlePushToAccounts = async (templateId: string, scope: 'linked' | 'all') => {
    setPushingId(templateId)
    setPushResult(null)
    const res = await fetch(`/api/plan-templates/${templateId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope }),
    })
    const data = await res.json()
    setPushingId(null)
    if (data.error) {
      setPushResult({ id: templateId, message: `Error: ${data.error}` })
    } else if (data.accounts_synced === 0) {
      setPushResult({ id: templateId, message: 'No linked accounts found. Use "Push to all" to sync every account.' })
    } else {
      setPushResult({ id: templateId, message: `Added ${data.items_added} item${data.items_added !== 1 ? 's' : ''} across ${data.accounts_synced} account${data.accounts_synced !== 1 ? 's' : ''}.` })
    }
  }

  // Keep local list in sync when parent refreshes (e.g. after onTemplatesChange)
  useEffect(() => { setTemplates(initialTemplates) }, [initialTemplates])

  const handleAdd = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
    if (!member) { setSaving(false); return }

    const { data, error } = await supabase.from('plan_templates').insert({
      org_id: member.org_id,
      name: newName.trim(),
      description: newDesc || null,
      sku: newSku || null,
      structure: DEFAULT_STRUCTURE,
    }).select().single()

    if (data && !error) {
      setTemplates(prev => [...prev, data as PlanTemplate])
      setNewName(''); setNewDesc(''); setNewSku('')
      setShowAdd(false)
      setExpandedId((data as PlanTemplate).id)
      await onTemplatesChange?.()
    }
    setSaving(false)
  }

  const handleClone = async (t: PlanTemplate) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
    if (!member) return
    const { data } = await supabase.from('plan_templates').insert({
      org_id: member.org_id,
      name: `Copy of ${t.name}`,
      description: t.description || null,
      sku: t.sku || null,
      structure: t.structure,
    }).select().single()
    if (data) {
      setTemplates(prev => [...prev, data as PlanTemplate])
      setExpandedId((data as PlanTemplate).id)
      await onTemplatesChange?.()
    }
  }

  const handleArchive = async (id: string) => {
    const archivedAt = new Date().toISOString()
    await supabase.from('plan_templates').update({ archived_at: archivedAt }).eq('id', id)
    const t = templates.find(t => t.id === id)
    if (t) setArchivedTemplates(prev => [{ ...t, archived_at: archivedAt }, ...prev])
    setTemplates(prev => prev.filter(t => t.id !== id))
    if (expandedId === id) setExpandedId(null)
    await onTemplatesChange?.()
  }

  const handleRestore = async (id: string) => {
    await supabase.from('plan_templates').update({ archived_at: null }).eq('id', id)
    const t = archivedTemplates.find(t => t.id === id)
    if (t) setTemplates(prev => [...prev, { ...t, archived_at: null }].sort((a, b) => a.name.localeCompare(b.name)))
    setArchivedTemplates(prev => prev.filter(t => t.id !== id))
    await onTemplatesChange?.()
  }

  const handleSaveStructure = async (id: string, structure: PlanTemplate['structure']) => {
    const { error } = await supabase.from('plan_templates').update({ structure }).eq('id', id)
    if (!error) {
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, structure } : t))
      await onTemplatesChange?.()
    }
    return error
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
        Define reusable onboarding plans per SKU. When creating an account, reps can pick a custom plan or use the default.
        The Training milestone in any plan is always populated from your Training Templates.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={() => setShowAdd(v => !v)} style={primaryBtn}>{showAdd ? '✕ Cancel' : '+ Add Plan'}</button>
      </div>

      {showAdd && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-b)', borderRadius: 8, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={labelStyle}>Name *
              <input name="plan-name" value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} placeholder="Full Suite Standard" />
            </label>
            <label style={labelStyle}>SKU (optional — leave blank to show for all)
              <select name="plan-sku" value={newSku} onChange={e => setNewSku(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">All SKUs</option>
                {SKU_OPTIONS.map(s => <option key={s} value={s}>{SKU_LABELS[s]}</option>)}
              </select>
            </label>
          </div>
          <label style={{ ...labelStyle, display: 'block', marginBottom: 12 }}>Description
            <input name="plan-description" value={newDesc} onChange={e => setNewDesc(e.target.value)} style={inputStyle} placeholder="Standard plan for Full Suite customers" />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleAdd} disabled={saving || !newName.trim()} style={primaryBtn}>
              {saving ? 'Creating…' : 'Create Plan'}
            </button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
          No plan templates yet. Create one above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
                {editingNameId === t.id ? (
                  <input
                    autoFocus
                    value={editingNameValue}
                    onChange={e => setEditingNameValue(e.target.value)}
                    onBlur={() => handleSaveName(t.id)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(t.id); if (e.key === 'Escape') setEditingNameId(null) }}
                    style={{ ...inputStyle, flex: 1, fontSize: 14, fontWeight: 600, padding: '2px 6px' }}
                  />
                ) : (
                  <span
                    style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)', flex: 1, cursor: 'text' }}
                    onDoubleClick={() => { setEditingNameId(t.id); setEditingNameValue(t.name) }}
                    title="Double-click to rename"
                  >{t.name}</span>
                )}
                <select
                  value={t.sku || ''}
                  onChange={async e => {
                    const sku = e.target.value || null
                    await supabase.from('plan_templates').update({ sku }).eq('id', t.id)
                    setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, sku: sku ?? undefined } : x))
                    await onTemplatesChange?.()
                  }}
                  style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border-b)', borderRadius: 4,
                    padding: '2px 6px', fontSize: 11, color: t.sku ? '#5DDDE3' : 'var(--text-3)',
                    cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                >
                  <option value="">All SKUs</option>
                  {SKU_OPTIONS.map(s => <option key={s} value={s}>{SKU_LABELS[s]}</option>)}
                </select>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  {t.structure?.milestones?.length ?? 0} milestones
                </span>
                <button onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 10px', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                  {expandedId === t.id ? 'Close' : 'Edit'}
                </button>
                <button onClick={() => handleClone(t)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 10px', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#5DDDE3')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>Clone</button>
                <button
                  onClick={() => handlePushToAccounts(t.id, 'all')}
                  disabled={pushingId === t.id}
                  title="Add any missing template items to all accounts in your org"
                  style={{ background: '#10b98118', border: '1px solid #10b98140', borderRadius: 5, padding: '3px 10px', color: pushingId === t.id ? 'var(--text-3)' : '#10b981', fontSize: 11, fontWeight: 600, cursor: pushingId === t.id ? 'default' : 'pointer', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>
                  {pushingId === t.id ? 'Pushing…' : '↑ Push to accounts'}
                </button>
                <button onClick={() => handleArchive(t.id)}
                  title="Archive template"
                  style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
              </div>
              {pushResult?.id === t.id && (
                <div style={{ padding: '8px 16px', background: pushResult.message.startsWith('Error') ? '#ef444410' : '#10b98110', borderTop: '1px solid var(--border)', fontSize: 12, color: pushResult.message.startsWith('Error') ? '#ef4444' : '#10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{pushResult.message}</span>
                  <button onClick={() => setPushResult(null)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
                </div>
              )}

              {/* Inline structure editor */}
              {expandedId === t.id && (
                <PlanStructureEditor
                  template={t}
                  sessionTemplates={sessionTemplates}
                  trainingTemplates={trainingTemplates}
                  onSave={structure => handleSaveStructure(t.id, structure)}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {/* Archived templates */}
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => { setShowArchived(v => !v); if (!showArchived) loadArchived() }}
          style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', padding: '4px 0', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span style={{ fontSize: 10 }}>{showArchived ? '▾' : '▸'}</span>
          Archived templates
        </button>
        {showArchived && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {!archivedLoaded ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>Loading…</div>
            ) : archivedTemplates.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>No archived templates.</div>
            ) : archivedTemplates.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, opacity: 0.7 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', flex: 1 }}>{t.name}</span>
                {t.sku && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#1BB3BB14', border: '1px solid #1BB3BB30', color: '#5DDDE3', fontFamily: 'var(--font-mono)' }}>{SKU_LABELS[t.sku] || t.sku}</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>
                  archived {t.archived_at ? new Date(t.archived_at).toLocaleDateString() : ''}
                </span>
                <button
                  onClick={() => handleRestore(t.id)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 10px', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#5DDDE3')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}
                >Restore</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Org-wide dedupe tool */}
      <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg-surface2)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Clean up duplicate items</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Removes duplicate plan items (same name in the same stage) across all accounts. Keeps the most-complete copy.</div>
        </div>
        <button
          onClick={handleDedupeAll}
          disabled={deduping}
          style={{ background: '#f59e0b18', border: '1px solid #f59e0b40', borderRadius: 5, padding: '4px 12px', color: deduping ? 'var(--text-3)' : '#f59e0b', fontSize: 11, fontWeight: 600, cursor: deduping ? 'default' : 'pointer', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}
        >{deduping ? 'Cleaning…' : '⌫ Remove duplicates'}</button>
        {dedupeResult && (
          <span style={{ fontSize: 11, color: dedupeResult.startsWith('Error') ? '#ef4444' : '#10b981' }}>{dedupeResult}</span>
        )}
      </div>
    </div>
  )
}

function PlanStructureEditor({ template, sessionTemplates, trainingTemplates, onSave }: { template: PlanTemplate; sessionTemplates: SessionTemplate[]; trainingTemplates: TrainingTemplate[]; onSave: (s: PlanTemplate['structure']) => Promise<unknown> }) {
  const [structure, setStructure] = useState<PlanTemplate['structure']>(
    JSON.parse(JSON.stringify(template.structure || { milestones: [] }))
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reinitialize when template.structure changes (e.g. after successful save from parent)
  useEffect(() => {
    setStructure(JSON.parse(JSON.stringify(template.structure || { milestones: [] })))
  }, [template.id])

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    const error = await onSave(structure)
    setSaving(false)
    if (error) {
      setSaveError('Save failed — check permissions')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  // ─── reorder helpers ────────────────────────────────────────────────────────

  const reorderMilestones = (oldIndex: number, newIndex: number) => {
    setStructure(s => ({ milestones: arrayMove(s.milestones, oldIndex, newIndex) }))
  }
  const reorderStages = (mi: number, oldIndex: number, newIndex: number) => {
    setStructure(s => ({
      milestones: s.milestones.map((m, i) => i === mi
        ? { ...m, stages: arrayMove(m.stages, oldIndex, newIndex) }
        : m)
    }))
  }
  const reorderItems = (mi: number, si: number, oldIndex: number, newIndex: number) => {
    setStructure(s => ({
      milestones: s.milestones.map((m, i) => i === mi
        ? { ...m, stages: m.stages.map((st, j) => j === si
            ? { ...st, items: arrayMove(st.items, oldIndex, newIndex) }
            : st) }
        : m)
    }))
  }

  const addMilestone = () => {
    setStructure(s => ({ milestones: [...s.milestones, { name: 'New Milestone', stages: [] }] }))
  }
  const removeMilestone = (mi: number) => {
    setStructure(s => ({ milestones: s.milestones.filter((_, i) => i !== mi) }))
  }
  const updateMilestoneName = (mi: number, name: string) => {
    setStructure(s => ({ milestones: s.milestones.map((m, i) => i === mi ? { ...m, name } : m) }))
  }

  const addStage = (mi: number) => {
    setStructure(s => ({
      milestones: s.milestones.map((m, i) => i === mi
        ? { ...m, stages: [...m.stages, { name: 'New Stage', items: [] }] }
        : m)
    }))
  }
  const removeStage = (mi: number, si: number) => {
    setStructure(s => ({
      milestones: s.milestones.map((m, i) => i === mi
        ? { ...m, stages: m.stages.filter((_, j) => j !== si) }
        : m)
    }))
  }
  const updateStageName = (mi: number, si: number, name: string) => {
    setStructure(s => ({
      milestones: s.milestones.map((m, i) => i === mi
        ? { ...m, stages: m.stages.map((st, j) => j === si ? { ...st, name } : st) }
        : m)
    }))
  }

  const addItem = (mi: number, si: number) => {
    setStructure(s => ({
      milestones: s.milestones.map((m, i) => i === mi
        ? { ...m, stages: m.stages.map((st, j) => j === si
            ? { ...st, items: [...st.items, { type: 'task', name: 'New Task', assignee: 'personal', required: true } as PlanTemplateItem] }
            : st) }
        : m)
    }))
  }
  const removeItem = (mi: number, si: number, ii: number) => {
    setStructure(s => ({
      milestones: s.milestones.map((m, i) => i === mi
        ? { ...m, stages: m.stages.map((st, j) => j === si
            ? { ...st, items: st.items.filter((_, k) => k !== ii) }
            : st) }
        : m)
    }))
  }
  const updateItem = (mi: number, si: number, ii: number, patch: Partial<PlanTemplateItem>) => {
    setStructure(s => ({
      milestones: s.milestones.map((m, i) => i === mi
        ? { ...m, stages: m.stages.map((st, j) => j === si
            ? { ...st, items: st.items.map((it, k) => k === ii ? { ...it, ...patch } : it) }
            : st) }
        : m)
    }))
  }

  const ASSIGNEE_COLORS: Record<string, string> = { personal: '#1BB3BB', customer: '#f59e0b', internal: '#6b7280' }
  const TYPE_COLORS: Record<string, string> = { task: '#1BB3BB', session: '#7757F5', training: '#06b6d4', handoff: '#475569', log: '#10b981', exchange: '#f59e0b', report: '#06b6d4' }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Stable string IDs for dnd-kit (index-based keys aren't stable across reorders)
  // We use a WeakMap-style approach: tag each object with a stable __id on first render.
  // Since structure is cloned from JSON, we use a module-level counter.
  const milestoneIds = structure.milestones.map((_, i) => `m-${template.id}-${i}`)

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 16px 12px' }}>
      {/* ── Milestones ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e: DragEndEvent) => {
          const { active, over } = e
          if (!over || active.id === over.id) return
          const oi = milestoneIds.indexOf(active.id as string)
          const ni = milestoneIds.indexOf(over.id as string)
          if (oi !== -1 && ni !== -1) reorderMilestones(oi, ni)
        }}
      >
        <SortableContext items={milestoneIds} strategy={verticalListSortingStrategy}>
          {structure.milestones.map((milestone, mi) => {
            const stageIds = milestone.stages.map((_, si) => `s-${template.id}-${mi}-${si}`)
            return (
              <SortableMilestone
                key={milestoneIds[mi]}
                id={milestoneIds[mi]}
                milestone={milestone}
                mi={mi}
                stageIds={stageIds}
                sensors={sensors}
                template={template}
                sessionTemplates={sessionTemplates}
                trainingTemplates={trainingTemplates}
                ASSIGNEE_COLORS={ASSIGNEE_COLORS}
                TYPE_COLORS={TYPE_COLORS}
                onUpdateName={updateMilestoneName}
                onRemove={removeMilestone}
                onAddStage={addStage}
                onRemoveStage={removeStage}
                onUpdateStageName={updateStageName}
                onReorderStages={reorderStages}
                onAddItem={addItem}
                onRemoveItem={removeItem}
                onUpdateItem={updateItem}
                onReorderItems={reorderItems}
              />
            )
          })}
        </SortableContext>
      </DndContext>

      <button onClick={addMilestone}
        style={{ display: 'block', width: '100%', background: 'none', border: '1px dashed var(--border)', borderRadius: 7,
          padding: '7px', textAlign: 'center', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer',
          fontFamily: 'var(--font-ui)', marginBottom: 12 }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border-b)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
        + Add Milestone
      </button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        {saveError && <span style={{ fontSize: 11, color: '#ef4444' }}>{saveError}</span>}
        <button onClick={save} disabled={saving} style={primaryBtn}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Drag handle icon ─────────────────────────────────────────────────────────
function GripHandle(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      title="Drag to reorder"
      style={{
        cursor: 'grab', padding: '0 4px', color: 'var(--text-4)',
        fontSize: 13, lineHeight: 1, userSelect: 'none', touchAction: 'none',
        display: 'flex', alignItems: 'center',
        ...props.style,
      }}
    >⠿</div>
  )
}

// ─── Sortable milestone ───────────────────────────────────────────────────────
interface SortableMilestoneProps {
  id: string
  milestone: PlanTemplateMilestone
  mi: number
  stageIds: string[]
  sensors: ReturnType<typeof useSensors>
  template: PlanTemplate
  sessionTemplates: SessionTemplate[]
  trainingTemplates: TrainingTemplate[]
  ASSIGNEE_COLORS: Record<string, string>
  TYPE_COLORS: Record<string, string>
  onUpdateName: (mi: number, name: string) => void
  onRemove: (mi: number) => void
  onAddStage: (mi: number) => void
  onRemoveStage: (mi: number, si: number) => void
  onUpdateStageName: (mi: number, si: number, name: string) => void
  onReorderStages: (mi: number, oi: number, ni: number) => void
  onAddItem: (mi: number, si: number) => void
  onRemoveItem: (mi: number, si: number, ii: number) => void
  onUpdateItem: (mi: number, si: number, ii: number, patch: Partial<PlanTemplateItem>) => void
  onReorderItems: (mi: number, si: number, oi: number, ni: number) => void
}

function SortableMilestone({ id, milestone, mi, stageIds, sensors, template, sessionTemplates, trainingTemplates, ASSIGNEE_COLORS, TYPE_COLORS, onUpdateName, onRemove, onAddStage, onRemoveStage, onUpdateStageName, onReorderStages, onAddItem, onRemoveItem, onUpdateItem, onReorderItems }: SortableMilestoneProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    marginBottom: 12,
    border: '1px solid var(--border)',
    borderRadius: 7,
    overflow: 'hidden',
  }

  return (
    <div ref={setNodeRef} style={style}>
      {/* Milestone header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-stage)' }}>
        <GripHandle {...attributes} {...listeners} />
        <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', width: 16 }}>{mi + 1}</span>
        <input
          name={`milestone-name-${mi}`}
          value={milestone.name}
          onChange={e => onUpdateName(mi, e.target.value)}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-h)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-ui)' }}
        />
        <button onClick={() => onRemove(mi)} style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 13, cursor: 'pointer', padding: '0 2px' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
      </div>

      {/* ── Stages ── */}
      <div style={{ padding: '4px 0' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e: DragEndEvent) => {
            const { active, over } = e
            if (!over || active.id === over.id) return
            const oi = stageIds.indexOf(active.id as string)
            const ni = stageIds.indexOf(over.id as string)
            if (oi !== -1 && ni !== -1) onReorderStages(mi, oi, ni)
          }}
        >
          <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
            {milestone.stages.map((stage, si) => {
              const itemIds = stage.items.map((_, ii) => `i-${template.id}-${mi}-${si}-${ii}`)
              return (
                <SortableStage
                  key={stageIds[si]}
                  id={stageIds[si]}
                  stage={stage}
                  mi={mi}
                  si={si}
                  itemIds={itemIds}
                  sensors={sensors}
                  template={template}
                  sessionTemplates={sessionTemplates}
                  trainingTemplates={trainingTemplates}
                  ASSIGNEE_COLORS={ASSIGNEE_COLORS}
                  TYPE_COLORS={TYPE_COLORS}
                  onRemove={onRemoveStage}
                  onUpdateName={onUpdateStageName}
                  onAddItem={onAddItem}
                  onRemoveItem={onRemoveItem}
                  onUpdateItem={onUpdateItem}
                  onReorderItems={onReorderItems}
                />
              )
            })}
          </SortableContext>
        </DndContext>

        <button onClick={() => onAddStage(mi)}
          style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: '5px 12px 6px 28px',
            textAlign: 'left', color: 'var(--text-4)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-ui)',
            borderTop: '1px solid var(--border)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}>+ stage</button>
      </div>
    </div>
  )
}

// ─── Sortable stage ───────────────────────────────────────────────────────────
interface SortableStageProps {
  id: string
  stage: PlanTemplateStage
  mi: number
  si: number
  itemIds: string[]
  sensors: ReturnType<typeof useSensors>
  template: PlanTemplate
  sessionTemplates: SessionTemplate[]
  trainingTemplates: TrainingTemplate[]
  ASSIGNEE_COLORS: Record<string, string>
  TYPE_COLORS: Record<string, string>
  onRemove: (mi: number, si: number) => void
  onUpdateName: (mi: number, si: number, name: string) => void
  onAddItem: (mi: number, si: number) => void
  onRemoveItem: (mi: number, si: number, ii: number) => void
  onUpdateItem: (mi: number, si: number, ii: number, patch: Partial<PlanTemplateItem>) => void
  onReorderItems: (mi: number, si: number, oi: number, ni: number) => void
}

function SortableStage({ id, stage, mi, si, itemIds, sensors, sessionTemplates, trainingTemplates, ASSIGNEE_COLORS, TYPE_COLORS, onRemove, onUpdateName, onAddItem, onRemoveItem, onUpdateItem, onReorderItems }: SortableStageProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    borderTop: '1px solid var(--border)',
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 12px' }}>
        <GripHandle {...attributes} {...listeners} style={{ fontSize: 11 }} />
        <input
          name={`stage-name-${mi}-${si}`}
          value={stage.name}
          onChange={e => onUpdateName(mi, si, e.target.value)}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-ui)' }}
        />
        <button onClick={() => onRemove(mi, si)} style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 13, cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
      </div>

      {/* ── Items ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e: DragEndEvent) => {
          const { active, over } = e
          if (!over || active.id === over.id) return
          const oi = itemIds.indexOf(active.id as string)
          const ni = itemIds.indexOf(over.id as string)
          if (oi !== -1 && ni !== -1) onReorderItems(mi, si, oi, ni)
        }}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {stage.items.map((item, ii) => (
            <SortableItem
              key={itemIds[ii]}
              id={itemIds[ii]}
              item={item}
              mi={mi} si={si} ii={ii}
              sessionTemplates={sessionTemplates}
              trainingTemplates={trainingTemplates}
              ASSIGNEE_COLORS={ASSIGNEE_COLORS}
              TYPE_COLORS={TYPE_COLORS}
              onRemove={onRemoveItem}
              onUpdate={onUpdateItem}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button onClick={() => onAddItem(mi, si)}
        style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: '3px 12px 5px 44px',
          textAlign: 'left', color: 'var(--text-4)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}>+ item</button>
    </div>
  )
}

// ─── Sortable item ────────────────────────────────────────────────────────────
interface SortableItemProps {
  id: string
  item: PlanTemplateItem
  mi: number; si: number; ii: number
  sessionTemplates: SessionTemplate[]
  trainingTemplates: TrainingTemplate[]
  ASSIGNEE_COLORS: Record<string, string>
  TYPE_COLORS: Record<string, string>
  onRemove: (mi: number, si: number, ii: number) => void
  onUpdate: (mi: number, si: number, ii: number, patch: Partial<PlanTemplateItem>) => void
}

function SortableItem({ id, item, mi, si, ii, sessionTemplates, trainingTemplates, ASSIGNEE_COLORS, TYPE_COLORS, onRemove, onUpdate }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 12px 4px 12px', flexWrap: 'wrap',
  }

  return (
    <div ref={setNodeRef} style={style}>
      <GripHandle {...attributes} {...listeners} style={{ fontSize: 10 }} />
      <select name={`item-type-${mi}-${si}-${ii}`} value={item.type}
        onChange={e => onUpdate(mi, si, ii, { type: e.target.value as PlanTemplateItem['type'], session_template_id: undefined, training_template_id: undefined })}
        style={{ background: 'var(--bg-surface2)', border: `1px solid ${TYPE_COLORS[item.type] || 'var(--border-b)'}44`, borderRadius: 4,
          color: TYPE_COLORS[item.type] || 'var(--text-2)', fontSize: 9, fontWeight: 700, padding: '1px 4px',
          cursor: 'pointer', fontFamily: 'var(--font-ui)', textTransform: 'uppercase' }}>
        <option value="task">task</option>
        <option value="session">session</option>
        <option value="training">training</option>
        <option value="exchange">exchange</option>
        <option value="log">log</option>
        <option value="report">report</option>
      </select>
      {item.type === 'session' && sessionTemplates.length > 0 && (
        <select
          name={`item-session-tmpl-${mi}-${si}-${ii}`}
          value={item.session_template_id || ''}
          onChange={e => {
            const tmpl = sessionTemplates.find(s => s.id === e.target.value)
            onUpdate(mi, si, ii, { session_template_id: e.target.value || undefined, name: tmpl ? tmpl.name : item.name })
          }}
          style={{ background: '#7757F518', border: '1px solid #7757F544', borderRadius: 4,
            color: '#7757F5', fontSize: 9, fontWeight: 700, padding: '1px 4px',
            cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
        >
          <option value="">custom session</option>
          {sessionTemplates.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
      )}
      {item.type === 'training' && trainingTemplates.length > 0 && (
        <select
          name={`item-training-tmpl-${mi}-${si}-${ii}`}
          value={item.training_template_id || ''}
          onChange={e => {
            const tmpl = trainingTemplates.find(t => t.id === e.target.value)
            onUpdate(mi, si, ii, { training_template_id: e.target.value || undefined, name: tmpl ? tmpl.name : item.name })
          }}
          style={{ background: '#06b6d418', border: '1px solid #06b6d444', borderRadius: 4,
            color: '#06b6d4', fontSize: 9, fontWeight: 700, padding: '1px 4px',
            cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
        >
          <option value="">custom training</option>
          {trainingTemplates.map(tt => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
        </select>
      )}
      <input name={`item-name-${mi}-${si}-${ii}`} value={item.name}
        onChange={e => onUpdate(mi, si, ii, { name: e.target.value })}
        style={{ flex: 1, minWidth: 80, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-ui)' }} />
      {item.type === 'task' && (
        <select name={`item-assignee-${mi}-${si}-${ii}`} value={item.assignee || 'personal'}
          onChange={e => onUpdate(mi, si, ii, { assignee: e.target.value })}
          style={{ background: 'var(--bg-surface2)', border: `1px solid ${ASSIGNEE_COLORS[item.assignee || 'personal'] || 'var(--border-b)'}44`,
            borderRadius: 4, color: ASSIGNEE_COLORS[item.assignee || 'personal'] || 'var(--text-2)',
            fontSize: 9, fontWeight: 700, padding: '1px 4px', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
          <option value="personal">personal</option>
          <option value="customer">customer</option>
          <option value="internal">internal</option>
        </select>
      )}
      <button onClick={() => onUpdate(mi, si, ii, { required: !item.required })}
        style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, cursor: 'pointer',
          fontFamily: 'var(--font-ui)', border: `1px solid ${item.required ? '#10b98144' : 'var(--border-b)'}`,
          background: item.required ? '#10b98110' : 'none', color: item.required ? '#10b981' : 'var(--text-3)' }}>
        {item.required ? 'req' : 'opt'}
      </button>
      <button onClick={() => onRemove(mi, si, ii)}
        style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 12, cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
    </div>
  )
}

// ─── Connectors Panel ─────────────────────────────────────────────────────────

const CONNECTOR_DEFS = [
  {
    id: 'google_calendar',
    provider: 'google',
    name: 'Google Calendar',
    description: 'Pull scheduled sessions into account timelines. Surfaces upcoming meetings so nothing falls through.',
    logo: '/logo-gcal.png',
    comingSoon: false,
    setupNote: 'Requires Google OAuth setup.',
  },
  {
    id: 'gmail',
    provider: 'google',
    name: 'Gmail',
    description: 'Detect emails from customer contacts and surface them as interactions in the account timeline.',
    logo: '/logo-gmail.png',
    comingSoon: false,
    setupNote: 'Requires Google OAuth setup.',
  },
  {
    id: 'slack',
    provider: 'slack',
    name: 'Slack',
    description: 'Scan channels for customer name mentions and surface them as interactions in the account timeline.',
    logo: '/logo-slack.svg',
    comingSoon: false,
    setupNote: '',
  },
  {
    id: 'quo',
    provider: 'quo',
    name: 'Quo',
    description: 'Pull calls and texts from customer contacts into account timelines. AI surfaces key info from texts.',
    logo: '/logo-quo.jpeg',
    comingSoon: false,
    setupNote: 'Requires Quo API access (Business plan).',
  },
]

function ConnectorsPanel({ connectors: _connectors, connectorTokens }: { connectors: import('@/types').Connector[], connectorTokens: ConnectorToken[] }) {
  const [disconnecting, setDisconnecting] = useState(false)

  const googleToken = connectorTokens.find(t => t.provider === 'google')
  const isGoogleConnected = !!googleToken
  const isSlackConnected = !!connectorTokens.find(t => t.provider === 'slack')

  const handleConnect = (provider: string) => {
    if (provider === 'google') window.location.href = '/api/connectors/google/connect'
    if (provider === 'slack') window.location.href = '/api/connectors/slack/connect'
    if (provider === 'quo') alert('Quo API access required — upgrade to Business plan at quo.com, then come back here.')
  }

  const handleDisconnect = async (provider: string) => {
    setDisconnecting(true)
    const url = provider === 'google'
      ? '/api/connectors/google/disconnect'
      : '/api/connectors/slack/disconnect'
    await fetch(url, { method: 'POST' })
    window.location.reload()
  }

  const slackToken = connectorTokens.find(t => t.provider === 'slack')
  const slackConnectedLabel = slackToken?.google_email || 'Workspace connected'

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 18, lineHeight: 1.6 }}>
        Connect external tools to automate parts of your onboarding workflow.
        Each rep connects their own Google account — your tokens are stored securely and only used on your behalf.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CONNECTOR_DEFS.map(def => {
          const isConnected = def.provider === 'google' ? isGoogleConnected : def.provider === 'slack' ? isSlackConnected : false
          const connectedEmail = def.provider === 'google' ? googleToken?.google_email : undefined

          return (
            <div key={def.id} style={{
              background: 'var(--bg-surface)', border: `1px solid ${isConnected ? '#10b98130' : 'var(--border)'}`,
              borderRadius: 10, padding: '16px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
              opacity: def.comingSoon ? 0.5 : 1,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: 'var(--bg-surface3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                overflow: 'hidden',
              }}>
                <img src={def.logo} alt={def.name} style={{ width: 40, height: 40, objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)' }}>{def.name}</span>
                  {def.comingSoon && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                      background: 'var(--border)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>soon</span>
                  )}
                  {isConnected && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                      background: '#10b98120', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>connected</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{def.description}</div>
                {isConnected && (connectedEmail || (def.provider === 'slack' && slackConnectedLabel)) && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                    {connectedEmail || slackConnectedLabel}
                  </div>
                )}
              </div>
              {!def.comingSoon && (
                isConnected ? (
                  <button
                    onClick={() => handleDisconnect(def.provider)}
                    disabled={disconnecting}
                    style={{
                      background: 'none', border: '1px solid var(--border-b)', borderRadius: 6,
                      padding: '5px 14px', color: 'var(--text-2)', fontSize: 12,
                      fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef444440' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border-b)' }}
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(def.provider)}
                    style={{
                      background: '#1BB3BB20', border: '1px solid #1BB3BB40', borderRadius: 6,
                      padding: '5px 14px', color: '#5DDDE3', fontSize: 12,
                      fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', flexShrink: 0,
                    }}
                  >
                    Connect
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>

      <div style={{
        marginTop: 20, padding: '14px 16px', background: 'var(--bg-surface2)',
        border: '1px solid var(--border)', borderRadius: 8,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>✦</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5DDDE3', marginBottom: 4 }}>
            AI Assistant is active
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Claude AI is connected and available on every account — use the{' '}
            <span style={{ color: 'var(--text-h)', fontWeight: 600 }}>✦ AI tab</span>{' '}
            to draft emails, get account summaries, and see suggested next actions.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Unmatched Signals Panel ───────────────────────────────────────────────────

interface UnmatchedSignal {
  id: string
  provider: string
  raw_text: string
  detail?: string
  signal_date: string
  linked_account_id?: string
  dismissed: boolean
}

function UnmatchedSignalsPanel() {
  const [signals, setSignals] = useState<UnmatchedSignal[]>([])
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<Record<string, string>>({})
  const supabase = createClient()

  const load = async () => {
    setLoading(true)
    const [signalsRes, accountsRes] = await Promise.all([
      fetch('/api/signals'),
      supabase.from('accounts').select('id, name').order('name'),
    ])
    const data = await signalsRes.json()
    setSignals(Array.isArray(data) ? data : [])
    setAccounts((accountsRes.data || []) as { id: string; name: string }[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const dismiss = async (id: string) => {
    await fetch('/api/signals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, dismissed: true }),
    })
    setSignals(prev => prev.filter(s => s.id !== id))
  }

  const link = async (id: string) => {
    const accountId = selectedAccount[id]
    if (!accountId) return
    setLinkingId(id)
    await fetch('/api/signals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, account_id: accountId }),
    })
    setSignals(prev => prev.filter(s => s.id !== id))
    setLinkingId(null)
  }

  const PROVIDER_LABELS: Record<string, string> = {
    gmail: 'Gmail', google_calendar: 'Calendar', slack: 'Slack',
  }
  const PROVIDER_COLORS: Record<string, string> = {
    gmail: '#ef4444', google_calendar: '#1BB3BB', slack: '#f59e0b',
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>Unmatched Signals</span>
        {signals.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
            background: '#f59e0b20', border: '1px solid #f59e0b44', color: '#f59e0b',
          }}>{signals.length}</span>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
        Emails and messages the sync found but couldn&apos;t link to an account. Link them manually or dismiss.
      </p>

      {loading ? (
        <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '12px 0' }}>Loading…</div>
      ) : signals.length === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>
          No unmatched signals — everything was mapped.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {signals.map(s => (
            <div key={s.id} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, flexShrink: 0, marginTop: 2,
                  background: `${PROVIDER_COLORS[s.provider] || '#6b7280'}18`,
                  border: `1px solid ${PROVIDER_COLORS[s.provider] || '#6b7280'}44`,
                  color: PROVIDER_COLORS[s.provider] || '#6b7280',
                  textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                }}>{PROVIDER_LABELS[s.provider] || s.provider}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {s.detail && (
                    <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                      {s.detail.slice(0, 200)}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(s.signal_date).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={() => dismiss(s.id)}
                  style={{ background: 'none', border: 'none', color: '#ef444488', fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#ef444488')}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <select
                  name={`link-account-${s.id}`}
                  value={selectedAccount[s.id] || ''}
                  onChange={e => setSelectedAccount(prev => ({ ...prev, [s.id]: e.target.value }))}
                  style={{ flex: 1, background: 'var(--bg-surface2)', border: '1px solid var(--border-b)', borderRadius: 6,
                    padding: '5px 8px', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}
                >
                  <option value="">Link to account…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button
                  onClick={() => link(s.id)}
                  disabled={!selectedAccount[s.id] || linkingId === s.id}
                  style={{
                    background: selectedAccount[s.id] ? 'var(--accent)' : 'var(--bg-surface2)',
                    border: '1px solid var(--border-b)', borderRadius: 6, padding: '5px 14px',
                    color: selectedAccount[s.id] ? '#fff' : 'var(--text-3)',
                    fontSize: 12, fontWeight: 600, cursor: selectedAccount[s.id] ? 'pointer' : 'default',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  {linkingId === s.id ? 'Linking…' : 'Link'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
