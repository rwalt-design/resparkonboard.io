'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Account, HardwareTask, HardwareType } from '@/types'

const HARDWARE_TYPE_LABELS: Record<HardwareType, string> = {
  floor_scale: 'Floor Scale',
  truck_scale: 'Truck Scale',
  camera: 'Camera',
  tablet: 'Tablet',
  other: 'Other',
}

const HARDWARE_TYPES = Object.entries(HARDWARE_TYPE_LABELS) as [HardwareType, string][]

const ghostBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
  padding: '5px 12px', color: 'var(--text-2)', fontSize: 12,
  cursor: 'pointer', fontFamily: 'var(--font-ui)',
}

export function HardwareTab({ account, onUpdate }: {
  account: Account
  onUpdate: (a: Account) => void
}) {
  const [tasks, setTasks] = useState<HardwareTask[]>([])
  const [loading, setLoading] = useState(true)
  const [notesDraft, setNotesDraft] = useState(account.hardware_notes || '')
  const [notesSaved, setNotesSaved] = useState(true)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('hardware_tasks')
      .select('*')
      .eq('account_id', account.id)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setTasks(data as HardwareTask[])
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id])

  const toggleComplete = async (task: HardwareTask) => {
    const completed = !task.completed
    const completed_at = completed ? new Date().toISOString() : null
    await supabase.from('hardware_tasks').update({ completed, completed_at }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed, completed_at } : t))
  }

  const updateField = async (id: string, field: string, value: string) => {
    await supabase.from('hardware_tasks').update({ [field]: value }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  const addTask = async () => {
    const sort_order = tasks.length
    const { data } = await supabase
      .from('hardware_tasks')
      .insert({ account_id: account.id, name: 'New Hardware', type: 'other', sort_order })
      .select('*')
      .single()
    if (data) {
      setTasks(prev => [...prev, data as HardwareTask])
      setEditingField({ id: data.id, field: 'name' })
    }
  }

  const deleteTask = async (id: string) => {
    await supabase.from('hardware_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const saveNotes = async () => {
    await supabase.from('accounts').update({ hardware_notes: notesDraft }).eq('id', account.id)
    onUpdate({ ...account, hardware_notes: notesDraft })
    setNotesSaved(true)
  }

  const toggleRowNotes = (id: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  // Incomplete first, complete at bottom
  const sorted = [...tasks].sort((a, b) => {
    if (a.completed === b.completed) return a.sort_order - b.sort_order
    return a.completed ? 1 : -1
  })

  if (loading) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>

  return (
    <div style={{ padding: '20px 24px' }}>
      <style>{`
        .hw-row:hover .hw-delete { opacity: 1 !important }
        .hw-row:hover { background: var(--bg-surface2) !important }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Hardware Checklist</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {tasks.filter(t => t.completed).length} / {tasks.length} complete
          </div>
        </div>
        <button onClick={addTask} style={ghostBtn}>+ Add hardware</button>
      </div>

      {/* Empty state */}
      {tasks.length === 0 && (
        <div style={{
          border: '1px dashed var(--border)', borderRadius: 8, padding: '32px 24px',
          textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
        }}>
          No hardware yet. Populated automatically when the client submits the intake form,
          or add items manually.
        </div>
      )}

      {/* Column headers */}
      {tasks.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '24px 1fr 140px 140px 160px 120px 80px 32px',
          gap: '0 10px',
          padding: '4px 10px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 4,
        }}>
          {['', 'Name', 'Type', 'Make / Model', 'Location', 'Connection', 'Status', ''].map((h, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>{h}</div>
          ))}
        </div>
      )}

      {/* Rows */}
      {sorted.map(task => (
        <div key={task.id}>
          <div
            className="hw-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr 140px 140px 160px 120px 80px 32px',
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
            <EditableCell
              value={task.name}
              editing={editingField?.id === task.id && editingField.field === 'name'}
              onStartEdit={() => setEditingField({ id: task.id, field: 'name' })}
              onSave={val => { updateField(task.id, 'name', val); setEditingField(null) }}
              onCancel={() => setEditingField(null)}
              strikethrough={task.completed}
            />

            {/* Type */}
            <select
              value={task.type}
              onChange={e => updateField(task.id, 'type', e.target.value)}
              style={{
                background: 'var(--bg-surface2)', border: '1px solid var(--border)',
                borderRadius: 5, padding: '3px 6px', fontSize: 12, color: 'var(--text-h)',
                cursor: 'pointer', fontFamily: 'var(--font-ui)', width: '100%',
              }}
            >
              {HARDWARE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>

            {/* Make / Model */}
            <EditableCell
              value={task.make_model || ''}
              placeholder="Add make/model…"
              editing={editingField?.id === task.id && editingField.field === 'make_model'}
              onStartEdit={() => setEditingField({ id: task.id, field: 'make_model' })}
              onSave={val => { updateField(task.id, 'make_model', val); setEditingField(null) }}
              onCancel={() => setEditingField(null)}
            />

            {/* Location */}
            <EditableCell
              value={task.location_label || ''}
              placeholder="Add location…"
              editing={editingField?.id === task.id && editingField.field === 'location_label'}
              onStartEdit={() => setEditingField({ id: task.id, field: 'location_label' })}
              onSave={val => { updateField(task.id, 'location_label', val); setEditingField(null) }}
              onCancel={() => setEditingField(null)}
            />

            {/* Connection */}
            <EditableCell
              value={task.connection_type || ''}
              placeholder="Add connection…"
              editing={editingField?.id === task.id && editingField.field === 'connection_type'}
              onStartEdit={() => setEditingField({ id: task.id, field: 'connection_type' })}
              onSave={val => { updateField(task.id, 'connection_type', val); setEditingField(null) }}
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
                  opacity: expandedNotes.has(task.id) ? 1 : undefined,
                }}
              >
                {expandedNotes.has(task.id) ? '▾' : '📝'}
              </button>
              <button
                className="hw-delete"
                onClick={() => deleteTask(task.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#ef4444', fontSize: 12, opacity: 0 }}
                title="Delete"
              >✕</button>
            </div>
          </div>

          {/* Per-row notes */}
          {expandedNotes.has(task.id) && (
            <RowNotes
              value={task.notes || ''}
              onChange={val => updateField(task.id, 'notes', val)}
            />
          )}
        </div>
      ))}

      {/* Tab-level notes */}
      <TabNotes
        label="Hardware Notes"
        value={notesDraft}
        saved={notesSaved}
        onChange={val => { setNotesDraft(val); setNotesSaved(false) }}
        onSave={saveNotes}
      />
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function EditableCell({ value, placeholder, editing, onStartEdit, onSave, onCancel, strikethrough }: {
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

function RowNotes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  return (
    <div style={{ padding: '4px 10px 8px 44px' }}>
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
    </div>
  )
}

export function TabNotes({ label, value, saved, onChange, onSave }: {
  label: string
  value: string
  saved: boolean
  onChange: (v: string) => void
  onSave: () => void
}) {
  return (
    <div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{label}</div>
        {!saved && (
          <button
            onClick={onSave}
            style={{
              background: '#1BB3BB', border: 'none', borderRadius: 5, padding: '3px 12px',
              color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)',
            }}
          >Save</button>
        )}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { if (!saved) onSave() }}
        placeholder={`${label}…`}
        rows={4}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--bg-surface2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--text-h)',
          fontFamily: 'var(--font-ui)', resize: 'vertical', outline: 'none',
        }}
      />
    </div>
  )
}
