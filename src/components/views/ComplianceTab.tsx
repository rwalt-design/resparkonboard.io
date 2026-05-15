'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Account, ComplianceTask, ComplianceCategory } from '@/types'
import { TabNotes } from './HardwareTab'

const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  government_upload:  'Gov Upload',
  regulatory_config:  'Regulatory',
  document_template:  'Doc Template',
  other:              'Other',
}

const CATEGORIES = Object.entries(CATEGORY_LABELS) as [ComplianceCategory, string][]

const ghostBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
  padding: '5px 12px', color: 'var(--text-2)', fontSize: 12,
  cursor: 'pointer', fontFamily: 'var(--font-ui)',
}

export function ComplianceTab({ account, onUpdate }: {
  account: Account
  onUpdate: (a: Account) => void
}) {
  const [tasks, setTasks] = useState<ComplianceTask[]>([])
  const [loading, setLoading] = useState(true)
  const [notesDraft, setNotesDraft] = useState(account.compliance_notes || '')
  const [notesSaved, setNotesSaved] = useState(true)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('compliance_tasks')
      .select('*')
      .eq('account_id', account.id)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setTasks(data as ComplianceTask[])
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id])

  const toggleComplete = async (task: ComplianceTask) => {
    const completed = !task.completed
    const completed_at = completed ? new Date().toISOString() : null
    await supabase.from('compliance_tasks').update({ completed, completed_at }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed, completed_at } : t))
  }

  const updateField = async (id: string, field: string, value: string) => {
    await supabase.from('compliance_tasks').update({ [field]: value }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  const addTask = async () => {
    const { data } = await supabase
      .from('compliance_tasks')
      .insert({ account_id: account.id, name: 'New Item', sort_order: tasks.length })
      .select('*')
      .single()
    if (data) {
      setTasks(prev => [...prev, data as ComplianceTask])
      setEditingField({ id: data.id, field: 'name' })
    }
  }

  const deleteTask = async (id: string) => {
    await supabase.from('compliance_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const saveNotes = async () => {
    await supabase.from('accounts').update({ compliance_notes: notesDraft }).eq('id', account.id)
    onUpdate({ ...account, compliance_notes: notesDraft })
    setNotesSaved(true)
  }

  const toggleRowNotes = (id: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const sorted = [...tasks].sort((a, b) => {
    if (a.completed === b.completed) return a.sort_order - b.sort_order
    return a.completed ? 1 : -1
  })

  if (loading) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>

  return (
    <div style={{ padding: '20px 24px' }}>
      <style>{`
        .cmp-row:hover .cmp-delete { opacity: 1 !important }
        .cmp-row:hover { background: var(--bg-surface2) !important }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Compliance Checklist</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {tasks.filter(t => t.completed).length} / {tasks.length} complete
          </div>
        </div>
        <button onClick={addTask} style={ghostBtn}>+ Add item</button>
      </div>

      {/* Empty state */}
      {tasks.length === 0 && (
        <div style={{
          border: '1px dashed var(--border)', borderRadius: 8, padding: '32px 24px',
          textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
        }}>
          No compliance items yet. Populated automatically when the client submits the intake form,
          or add items manually.
        </div>
      )}

      {/* Column headers */}
      {tasks.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '24px 1fr 120px 160px 80px 32px',
          gap: '0 10px',
          padding: '4px 10px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 4,
        }}>
          {['', 'Item', 'Category', 'Assigned Session', 'Status', ''].map((h, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>{h}</div>
          ))}
        </div>
      )}

      {/* Rows */}
      {sorted.map(task => (
        <div key={task.id}>
          <div
            className="cmp-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr 120px 160px 80px 32px',
              gap: '0 10px',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: 6,
              opacity: task.completed ? 0.45 : 1,
              transition: 'opacity 0.2s',
              background: 'transparent',
            }}
          >
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => toggleComplete(task)}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#1BB3BB' }}
            />

            {/* Name */}
            <ComplianceCell
              value={task.name}
              editing={editingField?.id === task.id && editingField.field === 'name'}
              onStartEdit={() => setEditingField({ id: task.id, field: 'name' })}
              onSave={val => { updateField(task.id, 'name', val); setEditingField(null) }}
              onCancel={() => setEditingField(null)}
              strikethrough={task.completed}
            />

            {/* Category */}
            <select
              value={task.category}
              onChange={e => updateField(task.id, 'category', e.target.value)}
              style={{
                background: 'var(--bg-surface2)', border: '1px solid var(--border)',
                borderRadius: 5, padding: '3px 6px', fontSize: 12, color: 'var(--text-h)',
                cursor: 'pointer', fontFamily: 'var(--font-ui)', width: '100%',
              }}
            >
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>

            {/* Assigned session */}
            <ComplianceCell
              value={task.assigned_session || ''}
              placeholder="e.g. Compliance Call 1"
              editing={editingField?.id === task.id && editingField.field === 'assigned_session'}
              onStartEdit={() => setEditingField({ id: task.id, field: 'assigned_session' })}
              onSave={val => { updateField(task.id, 'assigned_session', val); setEditingField(null) }}
              onCancel={() => setEditingField(null)}
            />

            {/* Status */}
            <div style={{
              fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 7px',
              textAlign: 'center',
              background: task.completed ? '#10b98120' : '#f59e0b20',
              color: task.completed ? '#10b981' : '#f59e0b',
            }}>
              {task.completed ? 'Complete' : 'Incomplete'}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
              <button
                onClick={() => toggleRowNotes(task.id)}
                title="Toggle notes"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                  color: task.notes ? '#1BB3BB' : 'var(--text-3)', fontSize: 13,
                }}
              >
                {expandedNotes.has(task.id) ? '▾' : '📝'}
              </button>
              <button
                className="cmp-delete"
                onClick={() => deleteTask(task.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#ef4444', fontSize: 12, opacity: 0 }}
                title="Delete"
              >✕</button>
            </div>
          </div>

          {/* Per-row notes */}
          {expandedNotes.has(task.id) && (
            <div style={{ padding: '4px 10px 8px 44px' }}>
              <RowNote
                value={task.notes || ''}
                onChange={val => updateField(task.id, 'notes', val)}
              />
            </div>
          )}
        </div>
      ))}

      <TabNotes
        label="Compliance Notes"
        value={notesDraft}
        saved={notesSaved}
        onChange={val => { setNotesDraft(val); setNotesSaved(false) }}
        onSave={saveNotes}
      />
    </div>
  )
}

function ComplianceCell({ value, placeholder, editing, onStartEdit, onSave, onCancel, strikethrough }: {
  value: string
  placeholder?: string
  editing: boolean
  onStartEdit: () => void
  onSave: (val: string) => void
  onCancel: () => void
  strikethrough?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => onSave(draft)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSave(draft)
          if (e.key === 'Escape') { setDraft(value); onCancel() }
        }}
        style={{
          width: '100%', background: 'var(--bg-surface2)', border: '1px solid #1BB3BB',
          borderRadius: 5, padding: '3px 6px', fontSize: 12, color: 'var(--text-h)',
          fontFamily: 'var(--font-ui)', outline: 'none',
        }}
      />
    )
  }

  return (
    <div
      onClick={onStartEdit}
      style={{
        fontSize: 12, color: value ? 'var(--text-h)' : 'var(--text-3)',
        cursor: 'text', padding: '3px 4px', borderRadius: 4, minHeight: 22,
        textDecoration: strikethrough ? 'line-through' : undefined,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {value || placeholder || ''}
    </div>
  )
}

function RowNote({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  return (
    <textarea
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => onChange(draft)}
      placeholder="Add a note for this item…"
      rows={2}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: 'var(--bg-surface2)', border: '1px solid var(--border)',
        borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-h)',
        fontFamily: 'var(--font-ui)', resize: 'vertical', outline: 'none',
      }}
    />
  )
}
