'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Account, OpenTask, AiSuggestion, HealthStatus } from '@/types'
import { Tooltip } from '@/components/Tooltip'

// ── Visual constants ───────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  plan:    '#7757F5',
  email:   '#1BB3BB',
  session: '#10b981',
  manual:  '#f59e0b',
}

function sourceEmoji(source?: string): string | null {
  if (!source) return null
  const s = source.toLowerCase()
  if (s === 'email' || s === 'gmail')                   return '📧'
  if (s === 'call'  || s === 'openphone')               return '📞'
  if (s === 'slack')                                    return '💬'
  if (s === 'session' || s === 'calendar' || s === 'meeting') return '📅'
  if (s === 'manual')                                   return '✏️'
  return null
}

const HEALTH_OPTIONS: { value: HealthStatus; label: string; color: string }[] = [
  { value: 'active',       label: 'Active',       color: '#10b981' },
  { value: 'stalled',      label: 'Stalled',      color: '#f59e0b' },
  { value: 'on_hold',      label: 'On Hold',      color: '#6b7280' },
  { value: 'unresponsive', label: 'Unresponsive', color: '#ef4444' },
  { value: 'blocked',      label: 'Blocked',      color: '#ef4444' },
]

// ── Types ──────────────────────────────────────────────────────────────────────

interface FlatTask extends OpenTask {
  kind:       'task'
  account:    Account
  fromPlan:   boolean
  milestone?: string
  stage?:     string
}

interface ExchangeRow {
  kind:       'exchange'
  id:         string
  name:       string      // artifact name, e.g. "Data Template"
  account:    Account
  send:       FlatTask    // "Send X" — respark's task
  receive:    FlatTask    // "Return X" — waiting on customer
  milestone?: string
  stage?:     string
  source:     string
}

type ListRow = FlatTask | ExchangeRow

function pairExchanges(tasks: FlatTask[]): ListRow[] {
  const sendMap    = new Map<string, FlatTask>()
  const receiveMap = new Map<string, FlatTask>()

  for (const t of tasks) {
    const s = t.name.match(/^Send (.+)$/i)
    const r = t.name.match(/^Return (.+)$/i)
    if (s) sendMap.set(`${t.account.id}:${s[1].toLowerCase()}`, t)
    else if (r) receiveMap.set(`${t.account.id}:${r[1].toLowerCase()}`, t)
  }

  const result: ListRow[]    = []
  const emitted = new Set<string>()

  for (const t of tasks) {
    const s = t.name.match(/^Send (.+)$/i)
    const r = t.name.match(/^Return (.+)$/i)
    if (s) {
      const key     = `${t.account.id}:${s[1].toLowerCase()}`
      if (emitted.has(key)) continue
      const receive = receiveMap.get(key)
      if (receive) {
        result.push({ kind: 'exchange', id: `x:${t.id}:${receive.id}`, name: s[1], account: t.account, send: t, receive, milestone: t.milestone, stage: t.stage, source: t.source })
        emitted.add(key)
      } else { result.push(t) }
    } else if (r) {
      const key  = `${t.account.id}:${r[1].toLowerCase()}`
      if (emitted.has(key)) continue
      const send = sendMap.get(key)
      if (send) {
        result.push({ kind: 'exchange', id: `x:${send.id}:${t.id}`, name: r[1], account: t.account, send, receive: t, milestone: send.milestone, stage: send.stage, source: send.source })
        emitted.add(key)
      } else { result.push(t) }
    } else {
      result.push(t)
    }
  }
  return result
}

interface Props {
  accounts:        Account[]
  onSelectAccount: (account: Account) => void
}

function resolveItemMeta(task: FlatTask) {
  const type   = task.item_type   ?? (task.assignee === 'customer' ? 'dependency' : 'task')
  const owner  = task.item_owner  ?? (task.assignee === 'customer' ? 'customer'   : 'respark')
  const status = task.item_status ?? (task.done ? 'done' : task.assignee === 'customer' ? 'waiting' : 'open')
  return { item_type: type as 'task'|'dependency', item_owner: owner as 'respark'|'customer', item_status: status as 'open'|'waiting'|'done'|'cancelled' }
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ActionItemsView({ accounts, onSelectAccount }: Props) {
  const [tab, setTab] = useState<'items' | 'suggestions'>('items')
  const [suggestionCount, setSuggestionCount] = useState(0)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-h)', margin: '0 0 12px' }}>Action Items</h1>
        {/* Tab row */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {(['items', 'suggestions'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none',
              borderBottom: tab === t ? '2px solid #1BB3BB' : '2px solid transparent',
              padding: '8px 16px', marginBottom: -1,
              color: tab === t ? 'var(--text-h)' : 'var(--text-2)',
              fontSize: 13, fontWeight: tab === t ? 600 : 400,
              cursor: 'pointer', fontFamily: 'var(--font-ui)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t === 'items' ? 'Action Items' : 'AI Suggestions'}
              {t === 'suggestions' && suggestionCount > 0 && (
                <span style={{
                  background: '#1BB3BB', color: '#fff',
                  fontSize: 10, fontWeight: 700, borderRadius: 99,
                  padding: '1px 6px', minWidth: 18, textAlign: 'center',
                }}>{suggestionCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'items'
        ? <ActionItemsList accounts={accounts} onSelectAccount={onSelectAccount} />
        : <SuggestionsPanel accounts={accounts} onSelectAccount={onSelectAccount} onCountChange={setSuggestionCount} />
      }
    </div>
  )
}

// ── Action Items list (unchanged logic) ───────────────────────────────────────

function ActionItemsList({ accounts, onSelectAccount }: Props) {
  const supabase = createClient()

  const allTasks = useMemo<FlatTask[]>(() => {
    const tasks: FlatTask[] = []
    accounts.forEach(account => {
      ;(account.open_tasks || []).forEach(task => {
        tasks.push({ kind: 'task', ...task, account, fromPlan: false })
      })
    })
    // Newest first
    tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return tasks
  }, [accounts])

  const [tasks, setTasks]                 = useState<FlatTask[]>(allTasks)
  useEffect(() => { setTasks(allTasks) }, [allTasks])
  const [filterMode, setFilterMode]       = useState<'all'|'me'|'customer'|'internal'>('all')
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterSource, setFilterSource]   = useState('all')
  const [filterHealth, setFilterHealth]   = useState<Set<HealthStatus>>(new Set())
  const [showDone, setShowDone]           = useState(false)
  const [groupBy, setGroupBy]             = useState<'account'|'type'|'none'>('account')
  const [lastAction, setLastAction]       = useState<{ task: FlatTask; action: 'done' | 'received' } | null>(null)

  const toggleHealth = (h: HealthStatus) =>
    setFilterHealth(prev => {
      const next = new Set(prev)
      if (next.has(h)) { next.delete(h) } else { next.add(h) }
      return next
    })

  const markTaskDone = async (task: FlatTask, done: boolean) => {
    if (done) setLastAction({ task, action: 'done' })
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done, item_status: done ? 'done' : 'open' } : t))
    if (task.fromPlan) {
      await supabase.from('items').update({ task_done: done }).eq('id', task.id)
    } else {
      await supabase.from('open_tasks').update({ done, item_status: done ? 'done' : 'open' }).eq('id', task.id)
      if (done) {
        const account = task.account
        for (const m of (account.milestones || [])) {
          for (const s of m.stages) {
            for (const item of s.items) {
              if ((item.task_name || '').toLowerCase() === task.name.toLowerCase() && !item.task_done) {
                await supabase.from('items').update({ task_done: true }).eq('id', item.id)
              }
            }
          }
        }
      }
    }
  }

  const markDependencyReceived = async (task: FlatTask) => {
    setLastAction({ task, action: 'received' })
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: true, item_status: 'done' } : t))
    if (task.fromPlan) {
      await supabase.from('items').update({ task_done: true }).eq('id', task.id)
    } else {
      await supabase.from('open_tasks').update({ done: true, item_status: 'done' }).eq('id', task.id)
      const account = task.account
      for (const m of (account.milestones || [])) {
        for (const s of m.stages) {
          for (const item of s.items) {
            if ((item.task_name || '').toLowerCase() === task.name.toLowerCase() && !item.task_done) {
              await supabase.from('items').update({ task_done: true }).eq('id', item.id)
            }
          }
        }
      }
    }
  }

  const undoAction = async () => {
    if (!lastAction) return
    const { task } = lastAction
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: false, item_status: task.item_type === 'dependency' ? 'waiting' : 'open' } : t))
    await supabase.from('open_tasks').update({ done: false, item_status: task.item_type === 'dependency' ? 'waiting' : 'open' }).eq('id', task.id)
    setLastAction(null)
  }

  const filtered = tasks.filter(t => {
    const { item_type, item_owner, item_status } = resolveItemMeta(t)
    if (!showDone && (item_status === 'done' || item_status === 'cancelled')) return false
    if (filterMode === 'me')       return item_type === 'task'       && item_owner === 'respark'
    if (filterMode === 'customer') return item_type === 'dependency' && item_owner === 'customer'
    if (filterMode === 'internal') return item_owner === 'respark'   && t.assignee === 'internal'
    if (filterAccount !== 'all' && t.account.id !== filterAccount) return false
    if (filterSource  !== 'all' && t.source      !== filterSource)  return false
    if (filterHealth.size > 0 && !filterHealth.has((t.account.health_status || 'active') as HealthStatus)) return false
    return true
  })

  const myOpen       = tasks.filter(t => { const m = resolveItemMeta(t); return m.item_type === 'task'       && m.item_owner === 'respark'  && m.item_status !== 'done' && m.item_status !== 'cancelled' }).length
  const waitingCount = tasks.filter(t => { const m = resolveItemMeta(t); return m.item_type === 'dependency' && m.item_owner === 'customer' && m.item_status === 'waiting' }).length
  const doneCount    = tasks.filter(t => resolveItemMeta(t).item_status === 'done').length

  const grouped = useMemo(() => {
    const rows = pairExchanges(filtered)
    const map: Record<string, ListRow[]> = {}
    if (groupBy === 'none') { map['All Items'] = rows; return map }
    rows.forEach(row => {
      const key = groupBy === 'account'
        ? row.account.name
        : row.kind === 'exchange'
          ? 'Exchanges'
          : resolveItemMeta(row).item_type === 'dependency' ? 'Waiting on Customer' : 'My Tasks'
      if (!map[key]) map[key] = []
      map[key].push(row)
    })
    return map
  }, [filtered, groupBy])

  const pill = (label: string, active: boolean, color: string, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{
      background: active ? color + '22' : 'var(--bg-surface)',
      border: `1px solid ${active ? color + '66' : 'var(--border)'}`,
      borderRadius: 5, padding: '4px 10px',
      color: active ? color : 'var(--text-2)',
      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
    }}>{label}</button>
  )

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 16px' }}>
        <span style={{ color: 'var(--text-h)', fontWeight: 600 }}>{myOpen}</span> on you ·{' '}
        <span style={{ color: '#f59e0b', fontWeight: 600 }}>{waitingCount}</span> waiting on customer ·{' '}
        <span style={{ color: 'var(--text-3)' }}>{doneCount} done</span>
      </p>

      {lastAction && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#1BB3BB14', border: '1px solid #1BB3BB30', borderRadius: 6,
          padding: '8px 14px', marginBottom: 12, gap: 12,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {lastAction.action === 'done' ? 'Marked done' : 'Marked received'}:{' '}
            <span style={{ color: 'var(--text-h)' }}>{lastAction.task.name}</span>
          </span>
          <button onClick={undoAction} style={{
            background: 'none', border: '1px solid #1BB3BB60', borderRadius: 5,
            padding: '3px 10px', color: '#1BB3BB',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
            whiteSpace: 'nowrap',
          }}>Undo</button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {pill('All',      filterMode === 'all',      'var(--text-h)', () => setFilterMode('all'))}
          {pill('Mine',     filterMode === 'me',        '#1BB3BB',       () => setFilterMode('me'))}
          {pill('Customer', filterMode === 'customer',  '#f59e0b',       () => setFilterMode('customer'))}
        </div>
        <select name="filter-account" value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={selectStyle}>
          <option value="all">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Group:</span>
          {(['account', 'type', 'none'] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)} style={{
              background: groupBy === g ? 'var(--border)' : 'none',
              border: `1px solid ${groupBy === g ? '#1BB3BB66' : 'var(--border)'}`,
              borderRadius: 5, padding: '3px 9px',
              color: groupBy === g ? 'var(--text)' : 'var(--text-2)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 500,
            }}>{g === 'none' ? 'None' : g === 'type' ? 'Type' : 'Account'}</button>
          ))}
        </div>
        <button onClick={() => setShowDone(v => !v)} style={{
          background: showDone ? '#10b98120' : 'var(--bg-surface)',
          border: `1px solid ${showDone ? '#10b98140' : 'var(--border)'}`,
          borderRadius: 5, padding: '4px 10px',
          color: showDone ? '#10b981' : 'var(--text-2)',
          fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
        }}>{showDone ? '✓ Done' : 'Show done'}</button>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
          <p style={{ fontSize: 14 }}>No open action items.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([groupKey, groupRows]) => (
          <div key={groupKey} style={{ marginBottom: 20 }}>
            {groupBy !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {groupBy === 'account' ? (
                  <span onClick={() => onSelectAccount(groupRows[0].account)}
                    style={{ fontSize: 13, fontWeight: 700, color: 'var(--link)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                  >{groupKey}</span>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, color: groupKey === 'Waiting on Customer' ? '#f59e0b' : groupKey === 'Exchanges' ? '#7757F5' : '#1BB3BB' }}>
                    {groupKey}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  {groupRows.filter(r => r.kind === 'exchange'
                    ? (resolveItemMeta(r.send).item_status !== 'done' || resolveItemMeta(r.receive).item_status !== 'done')
                    : resolveItemMeta(r as FlatTask).item_status !== 'done'
                  ).length} open
                </span>
              </div>
            )}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
              {groupRows.map((row, idx) => {
                const borderBottom = idx < groupRows.length - 1 ? '1px solid var(--bg-surface3)' : 'none'

                // ── Exchange row ──────────────────────────────────────────────
                if (row.kind === 'exchange') {
                  const sendMeta    = resolveItemMeta(row.send)
                  const recvMeta    = resolveItemMeta(row.receive)
                  const sendDone    = sendMeta.item_status === 'done' || sendMeta.item_status === 'cancelled'
                  const recvDone    = recvMeta.item_status === 'done' || recvMeta.item_status === 'cancelled'
                  const bothDone    = sendDone && recvDone
                  return (
                    <div key={row.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom,
                      borderLeft: `3px solid ${bothDone ? 'var(--border)' : '#7757F5'}`,
                      background: bothDone ? 'var(--bg-surface2)' : 'transparent',
                    }}
                      onMouseEnter={e => !bothDone && (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => { e.currentTarget.style.background = bothDone ? 'var(--bg-surface2)' : 'transparent' }}
                    >
                      {/* Send checkbox */}
                      <div onClick={() => !sendDone && markTaskDone(row.send, true)}
                        title={sendDone ? 'Sent' : 'Mark sent'}
                        style={{ marginTop: 2, width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: sendDone ? 'none' : '1.5px solid #1BB3BB',
                          background: sendDone ? '#10b981' : 'transparent',
                          cursor: sendDone ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{sendDone && <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>✓</span>}</div>
                      {/* Name + sub-labels */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: bothDone ? 'var(--text-3)' : 'var(--text)', textDecoration: bothDone ? 'line-through' : 'none', lineHeight: 1.4, display: 'flex', alignItems: 'baseline', gap: 5 }}>
                          <span>{row.name}</span>
                          {sourceEmoji(row.source) && (
                            <span style={{ fontSize: 11, opacity: 0.55, flexShrink: 0 }} title={row.source}>{sourceEmoji(row.source)}</span>
                          )}
                        </div>
                        {row.stage && !bothDone && (
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                            {row.milestone} › {row.stage}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                            background: sendDone ? '#10b98118' : '#1BB3BB14', color: sendDone ? '#10b981' : '#1BB3BB',
                            border: `1px solid ${sendDone ? '#10b98130' : '#1BB3BB30'}`, fontFamily: 'var(--font-mono)',
                          }}>{sendDone ? '✓ Sent' : 'Send'}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                            background: recvDone ? '#10b98118' : '#f59e0b18', color: recvDone ? '#10b981' : '#f59e0b',
                            border: `1px solid ${recvDone ? '#10b98130' : '#f59e0b30'}`, fontFamily: 'var(--font-mono)',
                          }}>{recvDone ? '✓ Received' : '⏳ Waiting on customer'}</span>
                        </div>
                      </div>
                      {groupBy !== 'account' && (
                        <span onClick={() => onSelectAccount(row.account)}
                          style={{ fontSize: 11, color: '#1BB3BB', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: '#1BB3BB14', border: '1px solid #1BB3BB30',
                            borderRadius: 4, padding: '1px 6px', fontWeight: 500, alignSelf: 'center',
                          }}>{row.account.name}</span>
                      )}
                      {!recvDone && (
                        <button onClick={() => markDependencyReceived(row.receive)} style={{
                          alignSelf: 'center', background: 'none', border: 'none',
                          padding: 0, color: '#f59e0b',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
                          textDecoration: 'underline', textUnderlineOffset: 2,
                        }}>Mark received</button>
                      )}
                    </div>
                  )
                }

                // ── Regular task row ──────────────────────────────────────────
                const task = row as FlatTask
                const { item_type, item_status } = resolveItemMeta(task)
                const isDep  = item_type === 'dependency'
                const isDone = item_status === 'done' || item_status === 'cancelled'
                const accentColor = isDone ? 'var(--border)' : isDep ? '#f59e0b' : '#1BB3BB'
                return (
                  <div key={task.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 14px', borderBottom,
                    borderLeft: `3px solid ${accentColor}`,
                    background: isDone ? 'var(--bg-surface2)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => !isDone && (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => { e.currentTarget.style.background = isDone ? 'var(--bg-surface2)' : 'transparent' }}
                  >
                    {isDep ? null : (
                      <div onClick={() => markTaskDone(task, !isDone)}
                        title={isDone ? 'Done' : 'Mark done'}
                        style={{ marginTop: 2, width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: isDone ? 'none' : '1.5px solid #1BB3BB',
                          background: isDone ? '#10b981' : 'transparent', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{isDone && <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>✓</span>}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: isDone ? 'var(--text-3)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span>{task.name}</span>
                        {sourceEmoji(task.source) && (
                          <span style={{ fontSize: 11, opacity: 0.55, flexShrink: 0 }} title={task.source}>{sourceEmoji(task.source)}</span>
                        )}
                      </div>
                      {task.notes && !isDone && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{task.notes}</div>
                      )}
                    </div>
                    {groupBy !== 'account' && (
                      <span onClick={() => onSelectAccount(task.account)}
                        style={{ fontSize: 11, color: '#1BB3BB', cursor: 'pointer', whiteSpace: 'nowrap',
                          background: '#1BB3BB14', border: '1px solid #1BB3BB30',
                          borderRadius: 4, padding: '1px 6px', fontWeight: 500, alignSelf: 'center',
                        }}>{task.account.name}</span>
                    )}
                    {isDep && !isDone && (
                      <button onClick={() => markDependencyReceived(task)} style={{
                        alignSelf: 'center', background: 'none', border: 'none',
                        padding: 0, color: '#f59e0b',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
                        textDecoration: 'underline', textUnderlineOffset: 2,
                      }}>Mark received</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Suggestions panel ─────────────────────────────────────────────────────────

function SuggestionsPanel({ accounts, onSelectAccount, onCountChange }: Props & { onCountChange: (n: number) => void }) {
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [loading, setLoading]         = useState(true)
  const [scanning, setScanning]       = useState(false)
  const [acting, setActing]           = useState<string | null>(null)
  const [lastAction, setLastAction]   = useState<{ suggestion: AiSuggestion; action: 'accept' | 'dismiss' } | null>(null)

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/ai/suggestions')
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    setSuggestions(list)
    onCountChange(list.filter((s: AiSuggestion) => s.status === 'pending').length)
    setLoading(false)
  }, [onCountChange])

  useEffect(() => { loadSuggestions() }, [loadSuggestions])

  const act = async (id: string, action: 'accept' | 'dismiss') => {
    const target = suggestions.find(s => s.id === id)
    setActing(id)
    await fetch('/api/ai/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    setSuggestions(prev => prev.filter(s => s.id !== id))
    onCountChange(suggestions.filter(s => s.id !== id && s.status === 'pending').length)
    setActing(null)
    if (target) setLastAction({ suggestion: target, action })
  }

  const undo = async () => {
    if (!lastAction) return
    await fetch('/api/ai/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lastAction.suggestion.id, action: 'undo' }),
    })
    setSuggestions(prev => [{ ...lastAction.suggestion, status: 'pending' }, ...prev])
    onCountChange(suggestions.length + 1)
    setLastAction(null)
  }

  const scanPlans = async () => {
    setScanning(true)
    // Build compact payload from accounts data
    const now = Date.now()
    const fourteenDays = 14 * 24 * 60 * 60 * 1000
    const payload = accounts.map(account => {
      const pendingItems: {
        id: string; type: 'task' | 'session' | 'dependency'; name: string
        assignee?: string; milestone_name: string; stage_name: string; stage_id: string
      }[] = []
      ;(account.milestones || []).forEach(m => {
        m.stages.forEach(s => {
          if (s.status === 'locked' || s.status === 'complete') return
          s.items.forEach(item => {
            if (!item.required) return
            if (item.type === 'task' && !item.task_done && item.task_name) {
              pendingItems.push({ id: item.id, type: 'task', name: item.task_name, milestone_name: m.name, stage_name: s.name, stage_id: s.id })
            }
            if (item.type === 'dependency' && !item.task_done && item.task_name) {
              pendingItems.push({ id: item.id, type: 'dependency', name: item.task_name, assignee: 'customer', milestone_name: m.name, stage_name: s.name, stage_id: s.id })
            }
            if (item.type === 'session' && item.session_status !== 'complete' && item.session_name) {
              pendingItems.push({ id: item.id, type: 'session', name: item.session_name, milestone_name: m.name, stage_name: s.name, stage_id: s.id })
            }
          })
        })
      })
      const recentInteractions = (account.interactions || [])
        .filter(i => now - new Date(i.created_at).getTime() < fourteenDays)
        .slice(0, 8)
        .map(i => ({ type: i.type, summary: i.summary }))
      return { id: account.id, name: account.name, sku: account.sku, pending_items: pendingItems, recent_interactions: recentInteractions }
    }).filter(a => a.recent_interactions.length > 0)

    await fetch('/api/ai/suggestions/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accounts: payload }),
    })
    await loadSuggestions()
    setScanning(false)
  }

  // Category label helpers
  const categoryLabel = (s: AiSuggestion) => {
    const cat = s.meta?.suggestion_category
    if (cat === 'completion') return { label: 'Mark complete', color: '#10b981' }
    if (cat === 'next_action') {
      const p = s.meta?.priority
      if (p === 'high') return { label: '▲ High priority', color: '#ef4444' }
      if (p === 'low')  return { label: '▽ Low priority',  color: '#6b7280' }
      return { label: '◆ Next action', color: '#7757F5' }
    }
    if (s.type === 'dependency') return { label: 'Waiting on customer', color: '#f59e0b' }
    return { label: 'My task', color: '#1BB3BB' }
  }

  const priorityBadge = (s: AiSuggestion) => {
    if (s.meta?.suggestion_category !== 'next_action') return null
    const p = s.meta?.priority
    if (!p) return null
    const colors: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#6b7280' }
    const c = colors[p] || '#6b7280'
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
        background: c + '18', color: c, fontFamily: 'var(--font-mono)',
        border: `1px solid ${c}40`, textTransform: 'uppercase',
      }}>{p}</span>
    )
  }

  const accountFor = (id: string) => accounts.find(a => a.id === id)

  const pending = suggestions
    .filter(s => s.status === 'pending')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, flex: 1 }}>
          {loading ? 'Loading…' : pending.length === 0
            ? 'No pending suggestions.'
            : `${pending.length} suggestion${pending.length !== 1 ? 's' : ''} awaiting review — accept to move to Action Items, or dismiss.`}
        </p>
        <button
          onClick={scanPlans}
          disabled={scanning}
          style={{
            background: scanning ? 'var(--bg-surface2)' : '#1BB3BB18',
            border: '1px solid #1BB3BB40', borderRadius: 6,
            padding: '6px 14px', color: '#5DDDE3',
            fontSize: 12, fontWeight: 600, cursor: scanning ? 'default' : 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >{scanning ? '✦ Scanning plans…' : '✦ Scan plans for completions'}</button>
      </div>

      {lastAction && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#1BB3BB14', border: '1px solid #1BB3BB30', borderRadius: 6,
          padding: '8px 14px', marginBottom: 12, gap: 12,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {lastAction.action === 'accept' ? 'Accepted' : 'Dismissed'}:{' '}
            <span style={{ color: 'var(--text-h)' }}>{lastAction.suggestion.title}</span>
          </span>
          <button onClick={undo} style={{
            background: 'none', border: '1px solid #1BB3BB60', borderRadius: 5,
            padding: '3px 10px', color: '#1BB3BB',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
            whiteSpace: 'nowrap',
          }}>Undo</button>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Loading suggestions…</div>
      ) : pending.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✦</div>
          <p style={{ fontSize: 14 }}>No pending suggestions. Run a sync or scan plans to generate new ones.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pending.map(s => {
            const { label, color } = categoryLabel(s)
            const account = accountFor(s.account_id)
            const isCompletion = s.meta?.suggestion_category === 'completion'
            const isNextAction = s.meta?.suggestion_category === 'next_action'
            return (
              <div key={s.id} style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${color}`, borderRadius: 7,
                padding: '12px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {/* Left info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        background: color + '18', color, fontFamily: 'var(--font-mono)',
                        border: `1px solid ${color}40`,
                      }}>{label}</span>
                      {priorityBadge(s)}
                      {account && (
                        <span onClick={() => onSelectAccount(account)}
                          style={{ fontSize: 11, color: '#1BB3BB', cursor: 'pointer',
                            background: '#1BB3BB14', border: '1px solid #1BB3BB30',
                            borderRadius: 4, padding: '1px 6px', fontWeight: 500,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                        >{s.account_name || account.name}</span>
                      )}
                      {isCompletion && s.meta?.milestone_name && (
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                          {s.meta.milestone_name} › {s.meta.stage_name}
                        </span>
                      )}
                      {!isCompletion && s.meta?.source_label && (
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                          {s.meta.source_label}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', marginBottom: s.body ? 4 : 0, lineHeight: 1.4, display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span>{s.title}</span>
                      {sourceEmoji(s.meta?.source) && (
                        <span style={{ fontSize: 11, opacity: 0.55, flexShrink: 0 }} title={s.meta?.source}>{sourceEmoji(s.meta?.source)}</span>
                      )}
                    </div>
                    {s.body && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{s.body}</div>
                    )}
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <button
                      onClick={() => act(s.id, 'accept')}
                      disabled={acting === s.id}
                      style={{
                        background: color + '20', border: `1px solid ${color}60`,
                        borderRadius: 5, padding: '5px 12px', color,
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                      }}
                    >{acting === s.id ? '…' : isCompletion ? 'Mark complete' : isNextAction ? 'Add as task' : 'Add to items'}</button>
                    <button
                      onClick={() => act(s.id, 'dismiss')}
                      disabled={acting === s.id}
                      style={{
                        background: 'none', border: '1px solid var(--border)',
                        borderRadius: 5, padding: '5px 10px', color: 'var(--text-3)',
                        fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                      }}
                    >Dismiss</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '5px 10px', color: 'var(--text-2)', fontSize: 12,
  fontFamily: 'var(--font-ui)', outline: 'none', cursor: 'pointer',
}
