'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Account, OrgMember, TrainingTemplate, Connector, PlanTemplate, SessionTemplate } from '@/types'
import { DashboardView } from './views/DashboardView'
import { AccountView } from './views/AccountView'
import { ActionItemsView } from './views/ActionItemsView'
import { SettingsView } from './views/SettingsView'
import { TimeToLaunchView } from './views/TimeToLaunchView'
import { useRouter, useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

type View = 'dashboard' | 'account' | 'actions' | 'ttl' | 'templates' | 'settings'
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

  const icon = pref === 'light' ? '☀' : '☽'
  const label = pref === 'light' ? 'Light' : 'Dark'

  return { pref, cycle: toggle, icon, label }
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
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const theme = useTheme()

  const hasConnectors = connectorTokens.length > 0

  useEffect(() => {
    const stored = localStorage.getItem('lastSynced')
    if (stored) setLastSynced(stored)
  }, [])

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
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
      })) as Account[]
      setAccounts(sorted)
      if (selectedAccount) {
        const refreshed = sorted.find(a => a.id === selectedAccount.id)
        if (refreshed) setSelectedAccount(refreshed)
      }
    }
  }, [selectedAccount])

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '▤' },
    { id: 'actions', label: 'Action Items', icon: '✓' },
    { id: 'ttl', label: 'Time to Launch', icon: '◎' },
    { id: 'templates', label: 'Templates', icon: '⊞' },
  ]

  const isNavActive = (id: View) => view === id && selectedAccount === null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)' }}>
      {/* Top nav */}
      <header style={{
        display: 'flex', alignItems: 'center', height: 48,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        padding: '0 16px', gap: 0, flexShrink: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <button
          onClick={() => { setView('dashboard'); setSelectedAccount(null); navigate('dashboard') }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px 0 0', marginRight: 16,
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: 'var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg viewBox="0 0 14 18" width="9" height="12" fill="none">
              <path d="M8.5 1 L4 9.5 H7.5 L4.5 17 L13.5 7.5 H9 L12.5 1 Z" fill="#3b82f6"/>
            </svg>
          </div>
          <div style={{ lineHeight: 1.1, textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-h)', fontFamily: 'var(--font-ui)', letterSpacing: '-0.3px', lineHeight: 1 }}>
              <span>respark</span>
              <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>onboard</span>
            </div>
          </div>
        </button>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 2, flex: 1 }}>
          {navItems.map(item => (
            <button
              key={item.id}
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
          ))}
        </nav>

        {/* Theme toggle */}
        <button
          onClick={theme.cycle}
          title={`Theme: ${theme.label} — click to cycle`}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '4px 8px', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer',
            fontFamily: 'var(--font-ui)', marginRight: 8,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border-b)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          {theme.icon}
        </button>

        {/* Sync */}
        {hasConnectors && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
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
          </div>
        )}

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
            }}>
              {currentMember?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'}
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
      <main style={{ flex: 1, overflow: 'auto' }}>
        {view === 'account' && selectedAccount ? (
          <AccountView
            account={selectedAccount}
            orgMembers={orgMembers}
            currentMember={currentMember}
            planTemplates={planTemplates}
            trainingTemplates={trainingTemplates}
            sessionTemplates={sessionTemplates}
            onBack={handleBack}
            onRefresh={refreshAccounts}
          />
        ) : view === 'actions' ? (
          <ActionItemsView
            accounts={accounts}
            onSelectAccount={handleSelectAccount}
          />
        ) : view === 'ttl' ? (
          <TimeToLaunchView
            accounts={accounts}
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
            accounts={accounts}
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
    </div>
  )
}
