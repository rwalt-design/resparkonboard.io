'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Account, ReportTask, ReportStatus } from '@/types'
import { TabNotes } from './HardwareTab'

const STATUS_CONFIG: Record<ReportStatus, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Not Started', color: '#6b7280', bg: '#6b728020' },
  in_progress:  { label: 'In Progress', color: '#f59e0b', bg: '#f59e0b20' },
  complete:     { label: 'Complete',    color: '#10b981', bg: '#10b98120' },
}

const ghostBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
  padding: '5px 12px', color: 'var(--text-2)', fontSize: 12,
  cursor: 'pointer', fontFamily: 'var(--font-ui)',
}

const COLS = [
  { key: 'legacy_name',    label: 'Legacy Report Name',   flex: 1.4 },
  { key: 'date_range',     label: 'Date Range',            flex: 0.7 },
  { key: 'purpose',        label: 'Purpose',               flex: 1.4 },
  { key: 'key_columns',    label: 'Key Columns',           flex: 1.4 },
  { key: 'converted_name', label: 'Converted Report Name', flex: 1.2 },
  { key: 'status',         label: 'Status',                flex: 0.7 },
  { key: 'notes',          label: 'Notes',                 flex: 1 },
] as const

type ColKey = typeof COLS[number]['key']

type SortDir = 'asc' | 'desc'

export function ReportingTab({ account, onUpdate }: {
  account: Account
  onUpdate: (a: Account) => void
}) {
  const [tasks, setTasks] = useState<ReportTask[]>([])
  const [loading, setLoading] = useState(true)
  const [notesDraft, setNotesDraft] = useState(account.reporting_notes || '')
  const [notesSaved, setNotesSaved] = useState(true)
  const [editingCell, setEditingCell] = useState<{ id: string; col: ColKey } | null>(null)
  const [sortCol, setSortCol] = useState<ColKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('report_tasks')
      .select('*')
      .eq('account_id', account.id)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setTasks(data as ReportTask[])
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id])

  const updateField = async (id: string, field: string, value: string) => {
    await supabase.from('report_tasks').update({ [field]: value }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  const addRow = async () => {
    const { data } = await supabase
      .from('report_tasks')
      .insert({ account_id: account.id, legacy_name: 'New Report', sort_order: tasks.length })
      .select('*')
      .single()
    if (data) {
      setTasks(prev => [...prev, data as ReportTask])
      setEditingCell({ id: data.id, col: 'legacy_name' })
    }
  }

  const deleteRow = async (id: string) => {
    await supabase.from('report_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const saveNotes = async () => {
    await supabase.from('accounts').update({ reporting_notes: notesDraft }).eq('id', account.id)
    onUpdate({ ...account, reporting_notes: notesDraft })
    setNotesSaved(true)
  }

  const handleSortCol = (col: ColKey) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const displayTasks = [...tasks].sort((a, b) => {
    if (!sortCol) return a.sort_order - b.sort_order
    const av = (a[sortCol] ?? '') as string
    const bv = (b[sortCol] ?? '') as string
    const cmp = av.localeCompare(bv)
    return sortDir === 'asc' ? cmp : -cmp
  })

  if (loading) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>

  const totalFlex = COLS.reduce((s, c) => s + c.flex, 0) + 0.3 // extra for delete col

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>Reports</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {tasks.filter(t => t.status === 'complete').length} / {tasks.length} complete
          </div>
        </div>
        <button onClick={addRow} style={ghostBtn}>+ Add report</button>
      </div>

      {/* Empty state */}
      {tasks.length === 0 && (
        <div style={{
          border: '1px dashed var(--border)', borderRadius: 8, padding: '32px 24px',
          textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
        }}>
          No reports yet. Populated automatically when the client submits the intake form,
          or add rows manually.
        </div>
      )}

      {/* Table */}
      {tasks.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {COLS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSortCol(col.key)}
                    style={{
                      textAlign: 'left', padding: '6px 8px', fontSize: 11,
                      color: sortCol === col.key ? '#1BB3BB' : 'var(--text-3)',
                      fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
                      width: `${(col.flex / totalFlex) * 100}%`,
                    }}
                  >
                    {col.label}
                    {sortCol === col.key && (
                      <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
                <th style={{ width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {displayTasks.map(task => (
                <ReportRow
                  key={task.id}
                  task={task}
                  editingCol={editingCell?.id === task.id ? editingCell.col : null}
                  onStartEdit={col => setEditingCell({ id: task.id, col })}
                  onEndEdit={() => setEditingCell(null)}
                  onUpdate={(field, val) => updateField(task.id, field, val)}
                  onDelete={() => deleteRow(task.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TabNotes
        label="Reporting Notes"
        value={notesDraft}
        saved={notesSaved}
        onChange={val => { setNotesDraft(val); setNotesSaved(false) }}
        onSave={saveNotes}
      />
    </div>
  )
}

function ReportRow({ task, editingCol, onStartEdit, onEndEdit, onUpdate, onDelete }: {
  task: ReportTask
  editingCol: ColKey | null
  onStartEdit: (col: ColKey) => void
  onEndEdit: () => void
  onUpdate: (field: string, val: string) => void
  onDelete: () => void
}) {
  return (
    <tr
      style={{ borderBottom: '1px solid var(--border)' }}
      className="report-row"
    >
      <style>{`.report-row:hover { background: var(--bg-surface2) } .report-row:hover .rpt-delete { opacity: 1 !important }`}</style>

      {COLS.map(col => (
        <td key={col.key} style={{ padding: '5px 8px', verticalAlign: 'middle' }}>
          {col.key === 'status' ? (
            <select
              value={task.status}
              onChange={e => onUpdate('status', e.target.value)}
              style={{
                background: STATUS_CONFIG[task.status].bg,
                color: STATUS_CONFIG[task.status].color,
                border: 'none', borderRadius: 4, padding: '3px 6px',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
              }}
            >
              {(Object.keys(STATUS_CONFIG) as ReportStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          ) : (
            <TableCell
              value={(task[col.key] as string) || ''}
              placeholder={col.key === 'converted_name' ? 'TBD…' : col.key === 'notes' ? 'Notes…' : ''}
              editing={editingCol === col.key}
              onStartEdit={() => onStartEdit(col.key)}
              onSave={val => { onUpdate(col.key, val); onEndEdit() }}
              onCancel={onEndEdit}
              multiline={col.key === 'purpose' || col.key === 'key_columns' || col.key === 'notes'}
            />
          )}
        </td>
      ))}

      <td style={{ padding: '5px 4px', textAlign: 'center' }}>
        <button
          className="rpt-delete"
          onClick={onDelete}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12, opacity: 0 }}
          title="Delete row"
        >✕</button>
      </td>
    </tr>
  )
}

function TableCell({ value, placeholder, editing, onStartEdit, onSave, onCancel, multiline }: {
  value: string
  placeholder?: string
  editing: boolean
  onStartEdit: () => void
  onSave: (v: string) => void
  onCancel: () => void
  multiline?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const sharedStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-surface)', border: '1px solid #1BB3BB',
    borderRadius: 4, padding: '3px 6px', fontSize: 12, color: 'var(--text-h)',
    fontFamily: 'var(--font-ui)', outline: 'none', resize: 'vertical',
  }

  if (editing) {
    return multiline ? (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        rows={3}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => onSave(draft)}
        onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); onCancel() } }}
        style={sharedStyle}
      />
    ) : (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => onSave(draft)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSave(draft)
          if (e.key === 'Escape') { setDraft(value); onCancel() }
        }}
        style={sharedStyle}
      />
    )
  }

  return (
    <div
      onClick={onStartEdit}
      style={{
        fontSize: 12, color: value ? 'var(--text-h)' : 'var(--text-3)',
        cursor: 'text', minHeight: 20, padding: '2px 2px',
        whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
        overflow: 'hidden', textOverflow: multiline ? undefined : 'ellipsis',
      }}
    >
      {value || placeholder || ''}
    </div>
  )
}
