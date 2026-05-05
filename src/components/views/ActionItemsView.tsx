'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Account, OpenTask, AiSuggestion } from '@/types'

// ── Visual constants ───────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  plan:    '#8b5cf6',
  email:   '#3b82f6',
  session: '#10b981',
  manual:  '#f59e0b',
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface FlatTask extends OpenTask {
  account:    Account
  fromPlan:   boolean
  milestone?: string
  stage?:     string
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
              borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
              padding: '8px 16px', marginBottom: -1,
              color: tab === t ? 'var(--text-h)' : 'var(--text-2)',
              fontSize: 13, fontWeight: tab === t ? 600 : 400,
              cursor: 'pointer', fontFamily: 'var(--font-ui)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t === 'items' ? 'Action Items' : 'AI Suggestions'}
              {t === 'suggestions' && suggestionCount > 0 && (
                <span style={{
                  background: '#3b82f6', color: '#fff',
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
        tasks.push({ ...task, account, fromPlan: false })
      })
      ;(account.milestones || []).forEach(m => {
        m.stages.forEach(s => {
          if (s.status === 'locked') return
          s.items.forEach(item => {
            if (item.type === 'task' && !item.task_done && item.required) {
              const alreadyIn = tasks.some(t => t.name === item.task_name && t.account.id === account.id)
              if (!alreadyIn) {
                tasks.push({
                  id: item.id, account_id: account.id,
                  name: item.task_name || '', assignee: item.task_assignee || 'personal',
                  source: item.task_source || 'plan', done: item.task_done || false,
                  created_at: item.created_at || new Date().toISOString(),
                  item_type:   item.task_assignee === 'customer' ? 'dependency' : 'task',
                  item_owner:  item.task_assignee === 'customer' ? 'customer'   : 'respark',
                  item_status: item.task_done ? 'done' : item.task_assignee === 'customer' ? 'waiting' : 'open',
                  account, fromPlan: true, milestone: m.name, stage: s.name,
                })
              }
            }
            // Dependency plan items
            if (item.type === 'dependency' && !item.task_done && item.required) {
              const alreadyIn = tasks.some(t => t.name === item.task_name && t.account.id === account.id)
              if (!alreadyIn) {
                tasks.push({
                  id: item.id, account_id: account.id,
                  name: item.task_name || '', assignee: 'customer',
                  source: item.task_source || 'plan', done: item.task_done || false,
                  created_at: item.created_at || new Date().toISOString(),
                  item_type: 'dependency', item_owner: 'customer', item_status: 'waiting',
                  account, fromPlan: true, milestone: m.name, stage: s.name,
                })
              }
            }
          })
        })
      })
    })
    return tasks
  }, [accounts])

  const [tasks, setTasks]                 = useState<FlatTask[]>(allTasks)
  const [filterMode, setFilterMode]       = useState<'all'|'me'|'customer'|'internal'>('all')
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterSource, setFilterSource]   = useState('all')
  const [showDone, setShowDone]           = useState(false)
  const [groupBy, setGroupBy]             = useState<'account'|'type'|'none'>('account')

  const markTaskDone = async (task: FlatTask, done: boolean) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done, item_status: done ? 'done' : 'open' } : t))
    if (task.fromPlan) {
      await supabase.from('items').update({ task_done: done }).eq('id', task.id)
    } else {
      await supabase.from('open_tasks').update({ done, item_status: done ? 'done' : 'open' }).eq('id', task.id)
      // Tie-back: also close matching plan item if name matches
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
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: true, item_status: 'done' } : t))
    if (task.fromPlan) {
      await supabase.from('items').update({ task_done: true }).eq('id', task.id)
    } else {
      await supabase.from('open_tasks').update({ done: true, item_status: 'done' }).eq('id', task.id)
      // Tie-back: close matching plan dependency
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

  const filtered = tasks.filter(t => {
    const { item_type, item_owner, item_status } = resolveItemMeta(t)
    if (!showDone && (item_status === 'done' || item_status === 'cancelled')) return false
    if (filterMode === 'me')       return item_type === 'task'       && item_owner === 'respark'
    if (filterMode === 'customer') return item_type === 'dependency' && item_owner === 'customer'
    if (filterMode === 'internal') return item_owner === 'respark'   && t.assignee === 'internal'
    if (filterAccount !== 'all' && t.account.id !== filterAccount) return false
    if (filterSource  !== 'all' && t.source      !== filterSource)  return false
    return true
  }).filter(t => {
    if (filterAccount !== 'all' && t.account.id !== filterAccount) return false
    if (filterSource  !== 'all' && t.source      !== filterSource)  return false
    return true
  })

  const myOpen       = tasks.filter(t => { const m = resolveItemMeta(t); return m.item_type === 'task'       && m.item_owner === 'respark'  && m.item_status !== 'done' && m.item_status !== 'cancelled' }).length
  const waitingCount = tasks.filter(t => { const m = resolveItemMeta(t); return m.item_type === 'dependency' && m.item_owner === 'customer' && m.item_status === 'waiting' }).length
  const doneCount    = tasks.filter(t => resolveItemMeta(t).item_status === 'done').length

  const grouped = useMemo(() => {
    const map: Record<string, FlatTask[]> = {}
    if (groupBy === 'none') { map['All Items'] = filtered; return map }
    filtered.forEach(t => {
      const key = groupBy === 'account'
        ? t.account.name
        : resolveItemMeta(t).item_type === 'dependency' ? 'Waiting on Customer' : 'My Tasks'
      if (!map[key]) map[key] = []
      map[key].push(t)
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

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {pill('All',      filterMode === 'all',      'var(--text-h)', () => setFilterMode('all'))}
          {pill('Me',       filterMode === 'me',        '#3b82f6',       () => setFilterMode('me'))}
          {pill('Customer', filterMode === 'customer',  '#f59e0b',       () => setFilterMode('customer'))}
          {pill('Internal', filterMode === 'internal',  '#6b7280',       () => setFilterMode('internal'))}
        </div>
        <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={selectStyle}>
          <option value="all">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={selectStyle}>
          <option value="all">All Sources</option>
          <option value="plan">From Plan</option>
          <option value="email">From Email</option>
          <option value="session">From Session</option>
          <option value="manual">Manual</option>
        </select>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginRight: 2 }}>Group:</span>
          {(['account', 'type', 'none'] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)} style={{
              background: groupBy === g ? 'var(--border)' : 'none',
              border: `1px solid ${groupBy === g ? '#3b82f666' : 'var(--border)'}`,
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
        }}>{showDone ? '✓ Showing done' : 'Show done'}</button>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
          <p style={{ fontSize: 14 }}>No open action items.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([groupKey, groupTasks]) => (
          <div key={groupKey} style={{ marginBottom: 20 }}>
            {groupBy !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {groupBy === 'account' ? (
                  <span onClick={() => onSelectAccount(groupTasks[0].account)}
                    style={{ fontSize: 13, fontWeight: 700, color: 'var(--link)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                  >{groupKey}</span>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, color: groupKey === 'Waiting on Customer' ? '#f59e0b' : '#3b82f6' }}>
                    {groupKey}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  {groupTasks.filter(t => resolveItemMeta(t).item_status !== 'done').length} open
                </span>
              </div>
            )}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
              {groupTasks.map((task, idx) => {
                const { item_type, item_status } = resolveItemMeta(task)
                const isDep  = item_type === 'dependency'
                const isDone = item_status === 'done' || item_status === 'cancelled'
                return (
                  <div key={task.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                    borderBottom: idx < groupTasks.length - 1 ? '1px solid var(--bg-surface3)' : 'none',
                    background: isDone ? 'var(--bg-surface2)' : 'transparent',
                  }}
                    onMouseEnter={e => !isDone && (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => { e.currentTarget.style.background = isDone ? 'var(--bg-surface2)' : 'transparent' }}
                  >
                    {/* Control */}
                    {isDep ? (
                      <div onClick={() => !isDone && markDependencyReceived(task)}
                        title={isDone ? 'Received' : 'Mark received'}
                        style={{ marginTop: 1, width: 18, height: 18, borderRadius: 9, flexShrink: 0,
                          border: isDone ? 'none' : '1.5px solid #f59e0b',
                          background: isDone ? '#10b981' : 'transparent',
                          cursor: isDone ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: isDone ? 9 : 10, color: isDone ? '#fff' : '#f59e0b', fontWeight: 700,
                        }}>{isDone ? '✓' : '⏳'}</div>
                    ) : (
                      <div onClick={() => markTaskDone(task, !isDone)}
                        title={isDone ? 'Done' : 'Mark done'}
                        style={{ marginTop: 1, width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: isDone ? 'none' : '1.5px solid #3b82f6',
                          background: isDone ? '#10b981' : 'transparent', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{isDone && <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>✓</span>}</div>
                    )}
                    {/* Name + context */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: isDone ? 'var(--text-3)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4 }}>
                        {task.name}
                      </div>
                      {task.notes && !isDone && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{task.notes}</div>
                      )}
                      {task.fromPlan && task.stage && !isDone && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                          {task.milestone} › {task.stage}
                        </div>
                      )}
                    </div>
                    {groupBy !== 'account' && (
                      <span onClick={() => onSelectAccount(task.account)}
                        style={{ fontSize: 11, color: '#3b82f6', cursor: 'pointer', whiteSpace: 'nowrap',
                          background: '#3b82f614', border: '1px solid #3b82f630',
                          borderRadius: 4, padding: '1px 6px', fontWeight: 500, alignSelf: 'center',
                        }}>{task.account.name}</span>
                    )}
                    {(filterMode === 'all' || groupBy === 'account') && (
                      <span style={{ alignSelf: 'center', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                        padding: '2px 7px', borderRadius: 4,
                        background: isDep ? '#f59e0b18' : '#3b82f614',
                        border: `1px solid ${isDep ? '#f59e0b40' : '#3b82f630'}`,
                        color: isDep ? '#f59e0b' : '#3b82f6', fontFamily: 'var(--font-mono)',
                      }}>{isDep ? 'waiting on' : 'my task'}</span>
                    )}
                    <span style={{ alignSelf: 'center', fontSize: 10, whiteSpace: 'nowrap',
                      color: SOURCE_COLORS[task.source] || 'var(--text-3)',
                      background: (SOURCE_COLORS[task.source] || 'var(--text-3)') + '18',
                      border: `1px solid ${(SOURCE_COLORS[task.source] || 'var(--text-3)')}33`,
                      borderRadius: 3, padding: '0 5px',
                      fontFamily: 'var(--font-mono)', fontWeight: 600,
                    }}>{task.source}</span>
                    {isDep && !isDone && (
                      <button onClick={() => markDependencyReceived(task)} style={{
                        alignSelf: 'center', background: 'none', border: '1px solid #f59e0b60',
                        borderRadius: 5, padding: '3px 9px', color: '#f59e0b',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
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
    setActing(id)
    await fetch('/api/ai/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    setSuggestions(prev => prev.filter(s => s.id !== id))
    onCountChange(suggestions.filter(s => s.id !== id && s.status === 'pending').length)
    setActing(null)
  }

  const scanPlans = async () => {
    setScanning(true)
    // Build compact payload from accounts data
    const now = Date.now()
    const fourteenDays = 14 * 24 * 60 * 60 * 1000
    const payload = accounts.map(account => {
      const pendingItems: {
        id: string; type: 'task' | 'session'; name: string
        milestone_name: string; stage_name: string; stage_id: string
      }[] = []
      ;(account.milestones || []).forEach(m => {
        m.stages.forEach(s => {
          if (s.status === 'locked' || s.status === 'complete') return
          s.items.forEach(item => {
            if (!item.required) return
            if (item.type === 'task' && !item.task_done && item.task_name) {
              pendingItems.push({ id: item.id, type: 'task', name: item.task_name, milestone_name: m.name, stage_name: s.name, stage_id: s.id })
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
      return { id: account.id, name: account.name, pending_items: pendingItems, recent_interactions: recentInteractions }
    }).filter(a => a.pending_items.length > 0 && a.recent_interactions.length > 0)

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
    if (s.type === 'dependency') return { label: 'Waiting on customer', color: '#f59e0b' }
    return { label: 'My task', color: '#3b82f6' }
  }

  const accountFor = (id: string) => accounts.find(a => a.id === id)

  const pending = suggestions.filter(s => s.status === 'pending')

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
            background: scanning ? 'var(--bg-surface2)' : '#3b82f618',
            border: '1px solid #3b82f640', borderRadius: 6,
            padding: '6px 14px', color: '#93c5fd',
            fontSize: 12, fontWeight: 600, cursor: scanning ? 'default' : 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >{scanning ? '✦ Scanning plans…' : '✦ Scan plans for completions'}</button>
      </div>

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
                      {account && (
                        <span onClick={() => onSelectAccount(account)}
                          style={{ fontSize: 11, color: '#3b82f6', cursor: 'pointer',
                            background: '#3b82f614', border: '1px solid #3b82f630',
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', marginBottom: s.body ? 4 : 0, lineHeight: 1.4 }}>
                      {s.title}
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
                    >{acting === s.id ? '…' : isCompletion ? 'Mark complete' : 'Add to items'}</button>
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
