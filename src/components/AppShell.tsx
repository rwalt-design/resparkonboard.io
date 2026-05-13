'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Tooltip, getTooltipsEnabled, setTooltipsEnabled } from '@/components/Tooltip'
import type { Account, OrgMember, TrainingTemplate, Connector, PlanTemplate, SessionTemplate, Resource } from '@/types'
import { DashboardView } from './views/DashboardView'
import { AccountView } from './views/AccountView'
import { ActionItemsView } from './views/ActionItemsView'
import { SettingsView } from './views/SettingsView'
import { TimeToLaunchView } from './views/TimeToLaunchView'
import { ResourcesView } from './views/ResourcesView'
import { DemoWelcomeModal } from './DemoWelcomeModal'
import { WelcomeModal } from './WelcomeModal'
import { WhatsNewButton } from './WhatsNewButton'
import { useRouter, useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

type View = 'dashboard' | 'account' | 'actions' | 'ttl' | 'templates' | 'resources' | 'settings'
type ThemePref = 'dark' | 'light'

interface ConnectorToken {
  provider: string
  scopes: string[]
  google_email?: string
  updated_at?: string
}

interface Props {
  accounts: Account[]
  currentUser: User
  currentMember: OrgMember | undefined
  orgMembers: OrgMember[]
  trainingTemplates: TrainingTemplate[]
  planTemplates: PlanTemplate[]
  sessionTemplates: SessionTemplate[]
  connectors: Connector[]
  connectorTokens: ConnectorToken[]
  accountsWithSuggestions: Set<string>
}

function useTheme() {
  const [pref, setPref] = useState<ThemePref>('dark')

  const applyTheme = (next: ThemePref) => {
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }

  useEffect(() => {
    const raw = localStorage.getItem('theme') || 'dark'
    const resolved = (raw === 'light' ? 'light' : 'dark') as ThemePref
    setPref(resolved)
    applyTheme(resolved)
  }, [])

  const setTheme = (next: ThemePref) => {
    setPref(next)
    localStorage.setItem('theme', next)
    applyTheme(next)
  }

  const toggle = () => setTheme(pref === 'dark' ? 'light' : 'dark')

  return { pref, cycle: toggle, setTheme }
}

export function AppShell({ accounts: initialAccounts, currentUser, currentMember, orgMembers, trainingTemplates: initialTraining, planTemplates: initialPlans, sessionTemplates: initialSessions, connectors, connectorTokens, accountsWithSuggestions }: Props) {
  const searchParams = useSearchParams()
  const initialView = (searchParams.get('view') as View | null) ?? 'dashboard'
  const initialAccountId = searchParams.get('account')
  const [view, setView] = useState<View>(initialView)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(
    initialAccountId ? (initialAccounts.find(a => a.id === initialAccountId) ?? null) : null
  )
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [planTemplates, setPlanTemplates] = useState<PlanTemplate[]>(initialPlans)
  const [trainingTemplates, setTrainingTemplates] = useState<TrainingTemplate[]>(initialTraining)
  const [sessionTemplates, setSessionTemplates] = useState<SessionTemplate[]>(initialSessions)
  const [resources, setResources] = useState<Resource[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const [tooltips, setTooltips] = useState(true)
  useEffect(() => { setTooltips(getTooltipsEnabled()) }, [])
  const toggleTooltips = () => { const next = !tooltips; setTooltips(next); setTooltipsEnabled(next) }
  const router = useRouter()
  const theme = useTheme()

  const isManager = currentMember?.role === 'manager'

  // Global view filter — persisted in localStorage, defaults to the logged-in user's own accounts
  const [viewUserId, setViewUserId] = useState<string>(currentMember?.user_id ?? '')
  useEffect(() => {
    const stored = localStorage.getItem('view-filter')
    const validIds = new Set(['all', ...orgMembers.map(m => m.user_id)])
    if (stored && validIds.has(stored)) {
      setViewUserId(stored)
    } else {
      // Stale or missing (e.g. leftover from a demo session) — reset to current user
      const fallback = currentMember?.user_id ?? ''
      setViewUserId(fallback)
      if (fallback) localStorage.setItem('view-filter', fallback)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateViewFilter = (userId: string) => {
    setViewUserId(userId)
    localStorage.setItem('view-filter', userId)
    setViewMenuOpen(false)
  }

  const viewLabel = viewUserId === 'all'
    ? 'All Accounts'
    : (orgMembers.find(m => m.user_id === viewUserId)?.name ?? currentMember?.name ?? 'My Accounts')

  const filteredAccounts = viewUserId === 'all'
    ? accounts
    : accounts.filter(a => a.owner_id === viewUserId)

  const hasConnectors = connectorTokens.length > 0

  useEffect(() => {
    const stored = localStorage.getItem('lastSynced')
    if (stored) setLastSynced(stored)
  }, [])

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/connectors/sync', { method: 'POST' })
      const data = await res.json()
      setSyncMsg(data.message || 'Done')
      const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      setLastSynced(now)
      localStorage.setItem('lastSynced', now)
      await refreshAccounts()
    } catch {
      setSyncMsg('Sync failed')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 4000)
    }
  }

  const navigate = useCallback((nextView: View, account?: Account | null) => {
    const params = new URLSearchParams()
    if (nextView !== 'dashboard') params.set('view', nextView)
    if (account) params.set('account', account.id)
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/', { scroll: false })
  }, [router])

  const handleSelectAccount = useCallback((account: Account) => {
    setSelectedAccount(account)
    setView('account')
    navigate('account', account)
  }, [navigate])

  const handleBack = useCallback(() => {
    setSelectedAccount(null)
    setView('dashboard')
    navigate('dashboard')
  }, [navigate])

  const refreshResources = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('resources').select('*').order('created_at', { ascending: false })
    if (data) setResources(data as Resource[])
  }, [])

  useEffect(() => { refreshResources() }, [refreshResources])

  const refreshTemplates = useCallback(async () => {
    const supabase = createClient()
    const [{ data: plans }, { data: training }, { data: sessions }] = await Promise.all([
      supabase.from('plan_templates').select('*').order('name'),
      supabase.from('training_templates').select('*').order('name'),
      supabase.from('session_templates').select('*').order('name'),
    ])
    if (plans) setPlanTemplates(plans as PlanTemplate[])
    if (training) setTrainingTemplates(training as TrainingTemplate[])
    if (sessions) setSessionTemplates(sessions as SessionTemplate[])
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const refreshAccounts = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('accounts')
      .select(`
        *,
        contacts(*),
        interactions(*),
        open_tasks(*),
        requests(*),
        quick_logs(*),
        milestones(
          *,
          stages(
            *,
            items(*, action_items(*))
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sorted = ((data || []) as any[]).map((a: any) => ({
        ...a,
        milestones: ((a.milestones || []) as any[])
          .sort((x: any, y: any) => x.order_index - y.order_index)
          .map((m: any) => ({
            ...m,
            stages: ((m.stages || []) as any[])
              .sort((x: any, y: any) => x.order_index - y.order_index)
              .map((s: any) => ({
                ...s,
                items: ((s.items || []) as any[])
                  .sort((x: any, y: any) => x.order_index - y.order_index),
              })),
          })),
        quick_logs: ((a.quick_logs || []) as any[]).sort((x: any, y: any) => new Date(y.logged_at).getTime() - new Date(x.logged_at).getTime()),
      })) as Account[]
      setAccounts(sorted)
      if (selectedAccount) {
        const refreshed = sorted.find(a => a.id === selectedAccount.id)
        if (refreshed) setSelectedAccount(refreshed)
      }
    }
  }, [selectedAccount])

  const navItems: { id: View; label: string; icon: string; tip: string }[] = [
    { id: 'dashboard', label: 'Dashboard',    icon: '▤', tip: 'All accounts at a glance — health, outreach, timeline, and tasks' },
    { id: 'actions',   label: 'Action Items', icon: '✓', tip: 'Your open tasks and items waiting on customers across all accounts' },
    { id: 'ttl',       label: 'Time to Launch', icon: '◎', tip: 'Projected go-live dates and onboarding velocity for all accounts' },
    { id: 'templates', label: 'Templates',    icon: '⊞', tip: 'Manage reusable plan, session, and training templates' },
    { id: 'resources', label: 'Resources',    icon: '🔗', tip: 'Central link library — slide decks, forms, templates, and reference docs shared across accounts' },
  ]

  const isNavActive = (id: View) => view === id && selectedAccount === null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-base)' }}>
      {(currentUser as any).is_anonymous ? <DemoWelcomeModal /> : <WelcomeModal />}
      {/* Top nav */}
      <header style={{
        display: 'flex', alignItems: 'center',
        height: 'calc(48px + env(safe-area-inset-top, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 16, paddingRight: 16, paddingBottom: 0,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        gap: 0, flexShrink: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <button
          onClick={() => { setView('dashboard'); setSelectedAccount(null); navigate('dashboard') }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px 0 0', marginRight: 16,
          }}
        >
          {/* logoLight (white) on dark bg; logoDark (navy) on light bg */}
          <img
            src={theme.pref === 'dark' ? '/logo-respark-light.svg' : '/logo-respark-dark.svg'}
            alt="ReSpark"
            height={22}
            style={{ display: 'block', flexShrink: 0, width: 'auto' }}
          />
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)', fontFamily: 'var(--font-ui)', letterSpacing: '-0.2px' }}>
            onboard
          </span>
        </button>

        {/* Nav */}
        <nav className="hide-mobile" style={{ display: 'flex', gap: 2, flex: 1 }}>
          {navItems.map(item => (
            <Tooltip key={item.id} content={item.tip} placement="bottom">
            <button
              onClick={() => { setView(item.id); setSelectedAccount(null); navigate(item.id) }}
              style={{
                background: isNavActive(item.id) ? 'var(--border)' : 'none',
                border: 'none', borderRadius: 6, padding: '5px 10px',
                color: isNavActive(item.id) ? 'var(--text-h)' : 'var(--text-2)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: 'var(--font-ui)', transition: 'color 0.1s',
              }}
              onMouseEnter={e => { if (!isNavActive(item.id)) e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { if (!isNavActive(item.id)) e.currentTarget.style.color = 'var(--text-2)' }}
            >
              <span style={{ fontSize: 11 }}>{item.icon}</span>
              {item.label}
            </button>
            </Tooltip>
          ))}
        </nav>

        {/* Sync */}
        {hasConnectors && (
          <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
            {syncMsg ? (
              <span style={{
                fontSize: 11, color: '#10b981', background: '#10b98115',
                border: '1px solid #10b98130', borderRadius: 99,
                padding: '2px 10px', fontFamily: 'var(--font-ui)',
              }}>{syncMsg}</span>
            ) : lastSynced && (
              <span style={{ fontSize: 11, color: 'var(--text-3)', borderRadius: 99, padding: '2px 10px', fontFamily: 'var(--font-ui)' }}>
                synced {lastSynced}
              </span>
            )}
            <Tooltip content="Pull new emails and interactions from your connected inbox" placement="bottom">
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                background: syncing ? 'var(--border)' : 'none',
                border: '1px solid var(--border)', borderRadius: 6,
                padding: '4px 10px', color: 'var(--text-2)',
                fontSize: 11, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 5,
              }}
              onMouseEnter={e => { if (!syncing) { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border-b)' } }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <span style={{ fontSize: 10 }}>{syncing ? '↻' : '⟳'}</span>
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
            </Tooltip>
          </div>
        )}

        {/* What's New */}
        {!(currentUser as any).is_anonymous && <WhatsNewButton />}

        {/* View filter */}
        <div ref={viewMenuRef} className="hide-mobile" style={{ position: 'relative', marginRight: 8 }}>
          <button
            onClick={() => setViewMenuOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: viewMenuOpen ? 'var(--border)' : 'none',
              border: '1px solid ' + (viewMenuOpen ? 'var(--border-b)' : 'var(--border)'),
              borderRadius: 7, padding: '3px 10px', cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
            onMouseEnter={e => { if (!viewMenuOpen) e.currentTarget.style.borderColor = 'var(--border-b)' }}
            onMouseLeave={e => { if (!viewMenuOpen) e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.04em' }}>Viewing</span>
            {(() => {
              if (viewUserId === 'all') return null
              const vm = orgMembers.find(m => m.user_id === viewUserId)
              if (!vm) return null
              if (vm.avatar_url) {
                return <img src={vm.avatar_url} alt="" width={16} height={16} referrerPolicy="no-referrer" style={{ borderRadius: '50%', border: '1.5px solid var(--border)', flexShrink: 0 }} />
              }
              const initials = vm.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
              return <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 99, background: 'var(--accent)', color: '#fff', flexShrink: 0, fontFamily: 'var(--font-ui)' }}>{initials}</span>
            })()}
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{viewLabel}</span>
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>▾</span>
          </button>

          {viewMenuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 4, minWidth: 180, zIndex: 200,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}>
              {isManager && (
                <button
                  onClick={() => updateViewFilter('all')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', background: viewUserId === 'all' ? 'var(--border)' : 'none',
                    border: 'none', borderRadius: 5, padding: '7px 10px',
                    color: 'var(--text)', fontSize: 12, cursor: 'pointer',
                    fontFamily: 'var(--font-ui)', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (viewUserId !== 'all') e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (viewUserId !== 'all') e.currentTarget.style.background = 'none' }}
                >
                  <span>All Accounts</span>
                  {viewUserId === 'all' && <span style={{ fontSize: 10, color: 'var(--accent)' }}>✓</span>}
                </button>
              )}
              {isManager && orgMembers.length > 0 && (
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              )}
              {orgMembers.map(m => (
                <button
                  key={m.user_id}
                  onClick={() => updateViewFilter(m.user_id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', background: viewUserId === m.user_id ? 'var(--border)' : 'none',
                    border: 'none', borderRadius: 5, padding: '7px 10px',
                    color: 'var(--text)', fontSize: 12, cursor: 'pointer',
                    fontFamily: 'var(--font-ui)', textAlign: 'left', gap: 8,
                  }}
                  onMouseEnter={e => { if (viewUserId !== m.user_id) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (viewUserId !== m.user_id) e.currentTarget.style.background = 'none' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {m.avatar_url
                      ? <img src={m.avatar_url} alt="" width={18} height={18} referrerPolicy="no-referrer" style={{ borderRadius: '50%', border: '1.5px solid var(--border)', flexShrink: 0 }} />
                      : <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 99, background: 'var(--accent)', color: '#fff', flexShrink: 0, fontFamily: 'var(--font-ui)' }}>{m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                    }
                    {m.name}
                    {m.user_id === currentMember?.user_id && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)' }}>You</span>
                    )}
                  </span>
                  {viewUserId === m.user_id && <span style={{ fontSize: 10, color: 'var(--accent)' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={userMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: userMenuOpen ? 'var(--border)' : 'none',
              border: '1px solid ' + (userMenuOpen ? 'var(--border-b)' : 'var(--border)'),
              borderRadius: 7, padding: '3px 10px 3px 6px', cursor: 'pointer',
            }}
            onMouseEnter={e => { if (!userMenuOpen) e.currentTarget.style.borderColor = 'var(--border-b)' }}
            onMouseLeave={e => { if (!userMenuOpen) e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'var(--border)', border: '1px solid var(--border-b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {currentUser.user_metadata?.avatar_url
                ? <img src={currentUser.user_metadata.avatar_url} alt="" width={24} height={24} style={{ objectFit: 'cover' }} referrerPolicy="no-referrer" />
                : currentMember?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'
              }
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{currentMember?.name || currentUser.email}</span>
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>▾</span>
          </button>

          {userMenuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 4, minWidth: 160, zIndex: 200,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}>
              <button
                onClick={() => { setView('settings'); setSelectedAccount(null); setUserMenuOpen(false); navigate('settings') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  background: 'none', border: 'none', borderRadius: 5,
                  padding: '7px 10px', color: 'var(--text)', fontSize: 12,
                  cursor: 'pointer', fontFamily: 'var(--font-ui)', textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ fontSize: 12 }}>⚙</span> Settings
              </button>
              {/* Theme toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-ui)' }}>
                  {theme.pref === 'dark' ? '☽ Dark mode' : '☀ Light mode'}
                </span>
                <div style={{ display: 'flex', background: 'var(--border)', borderRadius: 6, padding: 2, gap: 0 }}>
                  {(['dark', 'light'] as const).map(mode => {
                    const active = theme.pref === mode
                    return (
                      <button
                        key={mode}
                        onClick={() => theme.setTheme(mode)}
                        style={{
                          background: active ? 'var(--accent)' : 'none',
                          border: 'none', borderRadius: 4,
                          padding: '3px 8px',
                          color: active ? '#fff' : 'var(--text-2)',
                          fontSize: 11, fontWeight: 600,
                          cursor: active ? 'default' : 'pointer',
                          fontFamily: 'var(--font-ui)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {mode === 'dark' ? '☽' : '☀'}
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* Tooltips toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-ui)' }}>Tooltips</span>
                <button
                  onClick={toggleTooltips}
                  style={{
                    width: 34, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', flexShrink: 0,
                    background: tooltips ? '#1BB3BB' : 'var(--bg-surface3)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: tooltips ? 16 : 2,
                    width: 14, height: 14, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', display: 'block',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </button>
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
              <button
                onClick={handleSignOut}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  background: 'none', border: 'none', borderRadius: 5,
                  padding: '7px 10px', color: 'var(--text-2)', fontSize: 12,
                  cursor: 'pointer', fontFamily: 'var(--font-ui)', textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ fontSize: 11 }}>↩</span> Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="main-content" style={{ flex: 1, overflow: 'auto' }}>
        {view === 'account' && selectedAccount ? (
          <AccountView
            account={selectedAccount}
            orgMembers={orgMembers}
            currentMember={currentMember}
            planTemplates={planTemplates}
            trainingTemplates={trainingTemplates}
            sessionTemplates={sessionTemplates}
            resources={resources}
            onRefreshResources={refreshResources}
            onBack={handleBack}
            onRefresh={refreshAccounts}
          />
        ) : view === 'actions' ? (
          <ActionItemsView
            accounts={filteredAccounts}
            onSelectAccount={handleSelectAccount}
          />
        ) : view === 'ttl' ? (
          <TimeToLaunchView
            accounts={filteredAccounts}
            onSelectAccount={handleSelectAccount}
          />
        ) : view === 'templates' ? (
          <SettingsView
            section="templates"
            trainingTemplates={trainingTemplates}
            planTemplates={planTemplates}
            sessionTemplates={sessionTemplates}
            connectors={connectors}
            connectorTokens={connectorTokens}
            onTemplatesChange={refreshTemplates}
          />
        ) : view === 'resources' ? (
          <ResourcesView resources={resources} onRefresh={refreshResources} orgId={currentMember?.org_id ?? ''} />
        ) : view === 'settings' ? (
          <SettingsView
            section="connectors"
            trainingTemplates={trainingTemplates}
            planTemplates={planTemplates}
            sessionTemplates={sessionTemplates}
            connectors={connectors}
            connectorTokens={connectorTokens}
            onTemplatesChange={refreshTemplates}
          />
        ) : (
          <DashboardView
            accounts={filteredAccounts}
            currentMember={currentMember}
            orgMembers={orgMembers}
            trainingTemplates={trainingTemplates}
            planTemplates={planTemplates}
            sessionTemplates={sessionTemplates}
            accountsWithSuggestions={accountsWithSuggestions}
            onSelectAccount={handleSelectAccount}
            onRefresh={refreshAccounts}
          />
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {navItems.map(item => {
          const active = isNavActive(item.id)
          return (
            <button
              key={item.id}
              onClick={() => { setView(item.id); setSelectedAccount(null); navigate(item.id) }}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 0', minHeight: 56,
                color: active ? 'var(--accent)' : 'var(--text-2)',
                fontFamily: 'var(--font-ui)',
              }}
            >
              <span style={{ fontSize: 17 }}>{item.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.02em' }}>
                {item.label.split(' ')[0]}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
