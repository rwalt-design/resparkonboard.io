'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Account, AccountSummary, OrgMember, TrainingTemplate, PlanTemplate, SessionTemplate, HealthStatus } from '@/types'

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
const ADDON_LABELS: Record<string, string> = {
  brokerage: 'Brokerage',
  export: 'Export',
  api: 'API',
}
const HEALTH_OPTIONS: { value: HealthStatus; label: string; color: string }[] = [
  { value: 'active',       label: 'Active',       color: '#10b981' },
  { value: 'stalled',      label: 'Stalled',      color: '#f59e0b' },
  { value: 'on_hold',      label: 'On Hold',      color: '#6b7280' },
  { value: 'unresponsive', label: 'Unresponsive', color: '#ef4444' },
  { value: 'blocked',      label: 'Blocked',      color: '#ef4444' },
]


function computeSummary(account: Account): AccountSummary {
  const allItems = (account.milestones || []).flatMap(m =>
    m.stages.flatMap(s => s.items)
  )
  const required = allItems.filter(i => i.required)
  const done = required.filter(i => i.task_done || i.session_status === 'complete')
  const completionPct = required.length ? Math.round((done.length / required.length) * 100) : 0

  // Find current stage (first active or unlocked)
  let currentStage = ''
  for (const m of account.milestones || []) {
    for (const s of m.stages) {
      if (s.status === 'active' || s.status === 'unlocked') {
        currentStage = s.name
        break
      }
    }
    if (currentStage) break
  }

  // Days since last qualifying interaction (internal_note does not count)
  const interactions = (account.interactions || []).filter(i => i.type !== 'internal_note')
  let daysSinceContact = 999
  let lastContactDate: string | undefined
  if (interactions.length > 0) {
    const latest = interactions.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b
    )
    lastContactDate = latest.created_at
    const diff = Date.now() - new Date(latest.created_at).getTime()
    daysSinceContact = Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  return {
    ...account,
    currentStage,
    completionPct,
    daysSinceContact,
    lastContactDate,
    openTaskCount: (account.open_tasks || []).filter(t => !t.done).length,
  }
}

interface CreateAccountModalProps {
  onClose: () => void
  onCreated: () => void
  orgMembers: OrgMember[]
  trainingTemplates: TrainingTemplate[]
  planTemplates: PlanTemplate[]
  sessionTemplates: SessionTemplate[]
}

function CreateAccountModal({ onClose, onCreated, orgMembers: _orgMembers, trainingTemplates, planTemplates, sessionTemplates }: CreateAccountModalProps) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [sku, setSku] = useState<string>('dispatch')
  const [addons, setAddons] = useState<string[]>([])
  const [arr, setArr] = useState('')
  const [salesContext, setSalesContext] = useState('')
  const [contacts, setContacts] = useState([{ name: '', role: '', email: '' }])
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null) // null = default
  const [loading, setLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  const toggleAddon = (addon: string) => {
    setAddons(prev => prev.includes(addon) ? prev.filter(a => a !== addon) : [...prev, addon])
  }

  // Templates matching current SKU (or universal ones with no sku)
  const matchingPlans = planTemplates.filter(t => !t.sku || t.sku === sku)

  const handleCreate = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) { setLoading(false); return }

    const { data: account, error } = await supabase
      .from('accounts')
      .insert({
        org_id: member.org_id,
        name,
        sku,
        addons,
        arr: parseInt(arr) || 0,
        sales_context: salesContext || null,
        owner_id: user.id,
      })
      .select('id')
      .single()

    if (error || !account) { setLoading(false); return }

    const validContacts = contacts.filter(c => c.name.trim())
    if (validContacts.length > 0) {
      await supabase.from('contacts').insert(
        validContacts.map((c, i) => ({
          account_id: account.id,
          name: c.name,
          role: c.role || null,
          email: c.email || null,
          primary_contact: i === 0,
        }))
      )
    }

    const customPlan = selectedPlanId
      ? planTemplates.find(t => t.id === selectedPlanId) ?? null
      : null

    // Build plan JSON and call SECURITY DEFINER RPC — bypasses RLS reliably
    const milestonesJson = buildMilestonesJSON(sku, addons, trainingTemplates, sessionTemplates, customPlan)
    let planErr: string | null = null
    const { error: rpcErr } = await supabase.rpc('create_account_plan', {
      p_account_id: account.id,
      p_milestones: milestonesJson,
    })
    if (rpcErr) planErr = rpcErr.message

    setLoading(false)
    if (planErr) {
      setPlanError(planErr)
      return
    }
    onCreated()
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-b)', borderRadius: 10,
        width: 480, padding: '28px 32px', fontFamily: 'var(--font-ui)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)' }}>New Account — Step {step}/3</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--text)' }}>Account Name *
              <input value={name} onChange={e => setName(e.target.value)}
                style={inputStyle} placeholder="Acme Metals Inc." />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text)' }}>ARR
              <input value={arr} onChange={e => setArr(e.target.value)}
                style={inputStyle} placeholder="60000" type="number" />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text)' }}>Sales Context
              <textarea value={salesContext} onChange={e => setSalesContext(e.target.value)}
                rows={3} style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Key context from the deal..." />
            </label>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>SKU</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['dispatch', 'Dispatch'], ['facility_management', 'Facility Mgmt'], ['full_suite', 'Full Suite']].map(([val, label]) => (
                <button key={val} onClick={() => { setSku(val); setSelectedPlanId(null) }} style={{
                  flex: 1, padding: '8px 0', borderRadius: 6,
                  background: sku === val ? SKU_COLORS[val] + '22' : 'var(--bg-surface2)',
                  border: `1px solid ${sku === val ? SKU_COLORS[val] : 'var(--border-b)'}`,
                  color: sku === val ? SKU_COLORS[val] : 'var(--text-2)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                }}>{label}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4 }}>Add-ons</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['brokerage', 'Brokerage'], ['export', 'Export'], ['api', 'API']].map(([val, label]) => (
                <button key={val} onClick={() => toggleAddon(val)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 6,
                  background: addons.includes(val) ? '#3b82f622' : 'var(--bg-surface2)',
                  border: `1px solid ${addons.includes(val) ? '#3b82f6' : 'var(--border-b)'}`,
                  color: addons.includes(val) ? '#3b82f6' : 'var(--text-2)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                }}>{label}</button>
              ))}
            </div>

            {/* Plan template picker */}
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 8 }}>Onboarding Plan</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Default option */}
                <button onClick={() => setSelectedPlanId(null)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 7, cursor: 'pointer',
                  background: selectedPlanId === null ? '#3b82f610' : 'var(--bg-surface2)',
                  border: `1px solid ${selectedPlanId === null ? '#3b82f6' : 'var(--border-b)'}`,
                  fontFamily: 'var(--font-ui)', textAlign: 'left',
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${selectedPlanId === null ? '#3b82f6' : 'var(--text-3)'}`,
                    background: selectedPlanId === null ? '#3b82f6' : 'transparent',
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: selectedPlanId === null ? '#93c5fd' : 'var(--text)' }}>Default</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Configuration → Training → Validation → Go-Live</div>
                  </div>
                </button>

                {matchingPlans.map(plan => (
                  <button key={plan.id} onClick={() => setSelectedPlanId(plan.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 7, cursor: 'pointer',
                    background: selectedPlanId === plan.id ? '#3b82f610' : 'var(--bg-surface2)',
                    border: `1px solid ${selectedPlanId === plan.id ? '#3b82f6' : 'var(--border-b)'}`,
                    fontFamily: 'var(--font-ui)', textAlign: 'left',
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${selectedPlanId === plan.id ? '#3b82f6' : 'var(--text-3)'}`,
                      background: selectedPlanId === plan.id ? '#3b82f6' : 'transparent',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: selectedPlanId === plan.id ? '#93c5fd' : 'var(--text)' }}>{plan.name}</div>
                      {plan.description && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{plan.description}</div>}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                      {plan.structure?.milestones?.length ?? 0}m
                    </span>
                  </button>
                ))}

                {matchingPlans.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 12px' }}>
                    No custom plans for {SKU_LABELS[sku]} — using default. Create one in Templates.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>Contacts</div>
            {contacts.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <input value={c.name} onChange={e => setContacts(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  style={{ ...inputStyle, flex: 2 }} placeholder="Name" />
                <input value={c.role} onChange={e => setContacts(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                  style={{ ...inputStyle, flex: 1 }} placeholder="Role" />
                <input value={c.email} onChange={e => setContacts(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                  style={{ ...inputStyle, flex: 2 }} placeholder="Email" />
              </div>
            ))}
            <button onClick={() => setContacts(prev => [...prev, { name: '', role: '', email: '' }])}
              style={{ background: 'none', border: '1px dashed var(--border-b)', borderRadius: 6, padding: '6px', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>
              + Add contact
            </button>
          </div>
        )}

        {planError && (
          <div style={{
            background: '#7f1d1d22', border: '1px solid #7f1d1d66', borderRadius: 7,
            padding: '8px 12px', marginTop: 16, fontSize: 11, color: '#fca5a5', lineHeight: 1.5,
          }}>
            <strong>Plan generation failed:</strong> {planError}
            <div style={{ marginTop: 4, color: '#f87171' }}>Account was created — you can add the plan manually from the account view.</div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          {planError ? (
            <button onClick={() => { onCreated(); onClose() }} style={primaryBtnStyle}>Open Account</button>
          ) : (
            <>
              {step > 1 && (
                <button onClick={() => setStep(s => s - 1)} style={secondaryBtnStyle}>Back</button>
              )}
              {step < 3 ? (
                <button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !name.trim()} style={primaryBtnStyle}>
                  Next
                </button>
              ) : (
                <button onClick={handleCreate} disabled={loading} style={primaryBtnStyle}>
                  {loading ? 'Creating...' : 'Create Account'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Builds the milestones JSON passed to the create_account_plan RPC.
// All items are fully expanded here — "exchange" becomes two tasks (Send + Return).
function buildMilestonesJSON(
  sku: string,
  addons: string[],
  trainingTemplates: TrainingTemplate[],
  sessionTemplates: SessionTemplate[],
  customPlan: PlanTemplate | null,
) {
  const triggers = [sku, ...addons]

  const matchingTraining = trainingTemplates.filter(t =>
    !t.triggers?.length || t.triggers.some(tr => triggers.includes(tr))
  )

  type Item = Record<string, unknown>
  type Stage = { name: string; items: Item[] }
  type Milestone = { name: string; stages: Stage[] }

  const expandItems = (rawItems: { type: string; name: string; assignee?: string; required: boolean; session_template_id?: string }[]): Item[] => {
    const out: Item[] = []
    for (const item of rawItems) {
      if (item.type === 'exchange') {
        out.push({ type: 'task', required: item.required, task_name: `Send ${item.name}`, task_assignee: 'personal', task_source: 'plan', task_done: false })
        out.push({ type: 'task', required: item.required, task_name: `Return ${item.name}`, task_assignee: 'customer', task_source: 'plan', task_done: false })
      } else if (item.type === 'session') {
        // Look up session template if linked
        const tmpl = item.session_template_id ? sessionTemplates.find(s => s.id === item.session_template_id) : null
        out.push({
          type: 'session',
          required: item.required,
          session_name: item.name,
          session_status: 'pending',
          ...(tmpl ? {
            session_agenda: tmpl.agenda || [],
            session_goals: tmpl.agenda?.slice(0, 3) || [],
          } : {}),
        })
        // Inject associated tasks from session template
        if (tmpl && tmpl.tasks?.length) {
          for (const t of tmpl.tasks) {
            out.push({ type: 'task', required: false, task_name: t.name, task_assignee: t.assignee || 'personal', task_source: 'plan', task_done: false })
          }
        }
      } else if (item.type === 'handoff') {
        out.push({ type: 'handoff', required: item.required, handoff_name: item.name })
      } else {
        out.push({ type: item.type, required: item.required, task_name: item.name, task_assignee: item.assignee || 'personal', task_source: 'plan', task_done: false })
      }
    }
    return out
  }

  const trainingStages: Stage[] = matchingTraining.length > 0
    ? matchingTraining.map(t => ({
        name: t.name,
        items: [
          { type: 'session', required: true, session_name: t.name, session_status: 'pending', training_template_id: t.id },
        ],
      }))
    : [{ name: 'Training', items: [
        { type: 'session', required: true, session_name: 'Training Session', session_status: 'pending' },
      ]}]

  let milestones: Milestone[]

  if (customPlan && customPlan.structure?.milestones?.length > 0) {
    milestones = customPlan.structure.milestones.map(m => ({
      name: m.name,
      stages: m.name === 'Training'
        ? trainingStages
        : (m.stages || []).map(s => ({ name: s.name, items: expandItems(s.items || []) })),
    }))
  } else {
    milestones = [
      { name: 'Configuration', stages: [
        { name: 'Account Creation', items: expandItems([
          { type: 'task', name: 'Add primary contacts',   assignee: 'personal', required: true },
          { type: 'task', name: 'Select products / SKUs', assignee: 'personal', required: true },
          { type: 'task', name: 'Set ARR',                assignee: 'personal', required: true },
          { type: 'task', name: 'Add sales context',      assignee: 'personal', required: true },
        ])},
        { name: 'Kickoff', items: expandItems([
          { type: 'session',  name: 'Kickoff Meeting', required: true },
          { type: 'exchange', name: 'Data Template',   required: true },
        ])},
        { name: 'Discovery', items: expandItems([
          { type: 'session',  name: 'Discovery Meeting', required: true },
          { type: 'exchange', name: 'Hardware Doc',      required: true },
          { type: 'exchange', name: 'Compliance Doc',    required: true },
          { type: 'exchange', name: 'Reporting Doc',     required: true },
          { type: 'exchange', name: 'Accounting Doc',    required: true },
        ])},
        { name: 'Environment Setup', items: expandItems([
          { type: 'task', name: 'Upload Data',              assignee: 'personal', required: true },
          { type: 'task', name: 'Integrate Hardware',       assignee: 'personal', required: true },
          { type: 'task', name: 'Set Up Compliance Flows',  assignee: 'personal', required: true },
          { type: 'task', name: 'Integrate Accounting',     assignee: 'personal', required: true },
          { type: 'task', name: 'Custom Workflow Setup',    assignee: 'personal', required: false },
        ])},
      ]},
      { name: 'Training', stages: trainingStages },
      { name: 'Validation', stages: [
        { name: 'User Testing', items: expandItems([
          { type: 'log', name: 'Daily Job/Ticket Usage', required: true },
        ])},
        { name: 'Readiness Review', items: expandItems([
          { type: 'session',  name: 'Q&A',                        required: true },
          { type: 'exchange', name: 'Pre-Launch Checklist',        required: true },
          { type: 'task',     name: 'Review Pre-Launch Checklist', assignee: 'personal', required: true },
        ])},
      ]},
      { name: 'Go-Live', stages: [
        { name: 'Launch', items: expandItems([
          { type: 'task',    name: 'Usage Review',         assignee: 'personal', required: true },
          { type: 'session', name: 'Post-Launch Check-In', required: false },
          { type: 'handoff', name: 'CSM Handoff',          required: false },
        ])},
      ]},
    ]
  }

  return milestones
}

// ── Weekly Summary Modal ───────────────────────────────────────────────────────

function WeeklySummaryModal({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const now = Date.now()
  const weekMs = 7 * 24 * 60 * 60 * 1000

  // Split active vs inactive upfront
  const active = accounts.filter(a =>
    (a.interactions || []).some(i => now - new Date(i.created_at).getTime() <= weekMs) ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a.open_tasks || []).some((t: any) => now - new Date(t.created_at || 0).getTime() <= weekMs)
  )
  const inactive = accounts.filter(a => !active.includes(a))

  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiGenerated, setAiGenerated] = useState(false)

  // Generate AI summaries on mount if there are active accounts
  useEffect(() => {
    if (!active.length) return
    setAiLoading(true)
    fetch('/api/ai/weekly-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accounts: active }),
    })
      .then(r => r.json())
      .then(data => {
        const map: Record<string, string> = {}
        for (const s of data.summaries || []) {
          if (s.account_id) map[s.account_id] = s.summary
          else {
            // fallback: match by name
            const match = active.find(a => a.name === s.account_name)
            if (match) map[match.id] = s.summary
          }
        }
        setAiSummaries(map)
        setAiGenerated(true)
      })
      .catch(() => setAiGenerated(true))
      .finally(() => setAiLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback summary (used while loading or if AI fails)
  const fallbackSummary = (account: Account) => {
    const recent = (account.interactions || []).filter(
      i => now - new Date(i.created_at).getTime() <= weekMs
    )
    const emails = recent.filter(i => i.type === 'email').length
    const calls  = recent.filter(i => i.type === 'call').length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newTasks = (account.open_tasks || []).filter((t: any) =>
      now - new Date(t.created_at || 0).getTime() <= weekMs
    ).length
    const parts: string[] = []
    if (emails > 0) parts.push(`${emails} email${emails > 1 ? 's' : ''}`)
    if (calls  > 0) parts.push(`${calls} call${calls > 1 ? 's' : ''}`)
    if (newTasks > 0) parts.push(`${newTasks} new task${newTasks > 1 ? 's' : ''}`)
    return parts.length ? parts.join(', ') + '.' : 'Activity logged this week.'
  }

  const getSummary = (account: Account) =>
    aiSummaries[account.id] || (aiGenerated ? fallbackSummary(account) : '...')

  // Copy plain text to clipboard
  const copyText = () => {
    const lines = [
      `Weekly Account Summary — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      '',
      ...active.map(a => `• ${a.name}: ${getSummary(a)}`),
      '',
      `No activity: ${inactive.map(a => a.name).join(', ')}`,
    ].join('\n')
    navigator.clipboard.writeText(lines)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, width: 600, maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-h)' }}>Weekly Summary</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
              {aiLoading ? '✦ Generating AI summaries…' : 'Past 7 days across all accounts'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyText} disabled={aiLoading} style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border-b)', borderRadius: 6, padding: '6px 14px', color: aiLoading ? 'var(--text-3)' : 'var(--text)', fontSize: 12, cursor: aiLoading ? 'default' : 'pointer', fontFamily: 'var(--font-ui)' }}>Copy</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '12px 20px 20px' }}>
          {active.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Active this week ({active.length})</div>
              {active.map(account => (
                <div key={account.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#93c5fd', marginBottom: 4 }}>{account.name}</div>
                  <div style={{ fontSize: 12, color: aiLoading ? 'var(--text-3)' : 'var(--text-2)', lineHeight: 1.6, fontStyle: aiLoading ? 'italic' : 'normal' }}>
                    {aiLoading ? 'Generating…' : getSummary(account)}
                  </div>
                </div>
              ))}
            </>
          )}
          {inactive.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 8px' }}>No activity ({inactive.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {inactive.map(account => (
                  <span key={account.id} style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px' }}>{account.name}</span>
                ))}
              </div>
            </>
          )}
          {active.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: 13 }}>
              No activity logged in the past 7 days.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-surface2)', border: '1px solid var(--border-b)',
  borderRadius: 6, padding: '7px 10px', color: 'var(--text-h)',
  fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none', display: 'block', marginTop: 4,
}
const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '8px 18px',
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
}
const secondaryBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border-b)', borderRadius: 6, padding: '8px 18px',
  color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)',
}


interface Props {
  accounts: Account[]
  currentMember: OrgMember | undefined
  orgMembers: OrgMember[]
  trainingTemplates: TrainingTemplate[]
  planTemplates: PlanTemplate[]
  sessionTemplates: SessionTemplate[]
  accountsWithSuggestions: Set<string>
  onSelectAccount: (account: Account) => void
  onRefresh: () => void
}

export function DashboardView({ accounts, currentMember: _currentMember, orgMembers, trainingTemplates, planTemplates, sessionTemplates, accountsWithSuggestions, onSelectAccount, onRefresh }: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [showWeeklySummary, setShowWeeklySummary] = useState(false)

  const [healthUpdating, setHealthUpdating] = useState<string | null>(null)
  const supabase = createClient()

  const summaries = useMemo(() => accounts.map(computeSummary), [accounts])

  // Sort: least completed → most completed; ties broken by name
  const sorted = useMemo(() =>
    [...summaries].sort((a, b) => a.completionPct - b.completionPct || a.name.localeCompare(b.name)),
    [summaries]
  )

  const updateHealth = async (accountId: string, status: HealthStatus) => {
    setHealthUpdating(accountId)
    await supabase.from('accounts').update({ health_status: status }).eq('id', accountId)
    await onRefresh()
    setHealthUpdating(null)
  }

  // Account | SKU | Stage | Completion | Last Contact | Tasks | Health
  const cols = 'minmax(120px,1.5fr) 90px 140px 110px 100px 48px 120px'

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-h)', marginBottom: 2 }}>Accounts</h1>
          <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowWeeklySummary(true)} style={secondaryBtnStyle}>
            Weekly Summary
          </button>
          <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>
            + New Account
          </button>
        </div>
      </div>

      {showWeeklySummary && <WeeklySummaryModal accounts={accounts} onClose={() => setShowWeeklySummary(false)} />}

      {accounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 14, marginBottom: 8 }}>No accounts yet</p>
          <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>Create your first account</button>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
            {[
              { label: 'Account', align: 'left' },
              { label: 'SKU', align: 'left' },
              { label: 'Current Stage', align: 'left' },
              { label: 'Completion', align: 'left' },
              { label: 'Last Contact', align: 'center' },
              { label: 'Tasks', align: 'center' },
              { label: 'Health', align: 'right' },
            ].map(({ label, align }) => (
              <span key={label} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: align as 'left' | 'center' | 'right' }}>{label}</span>
            ))}
          </div>

          {sorted.map((account) => {
            const healthOpt = HEALTH_OPTIONS.find(o => o.value === (account.health_status || 'active')) || HEALTH_OPTIONS[0]
            const openTaskCount = (account.open_tasks || []).filter(t => !t.done).length
            const expanded = expandedTask === account.id

            return (
              <div key={account.id}>
                <div
                  style={{
                    display: 'grid', gridTemplateColumns: cols,
                    padding: '10px 16px', borderBottom: '1px solid var(--border)',
                    alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => onSelectAccount(account)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 13, color: '#60a5fa', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</span>
                      {account.arr > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                          ${account.arr >= 1000 ? `${(account.arr / 1000).toFixed(account.arr % 1000 === 0 ? 0 : 1)}k` : account.arr.toLocaleString()}
                        </span>
                      )}
                      {accountsWithSuggestions.has(account.id) && (
                        <span className="ai-dot" title="AI suggestions available" />
                      )}
                    </div>
                    {account.sales_context && (
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                        {account.sales_context.length > 60 ? account.sales_context.slice(0, 60) + '…' : account.sales_context}
                      </div>
                    )}
                  </div>

                  {/* SKU + addons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                      background: (SKU_COLORS[account.sku] || '#6b7280') + '22',
                      color: SKU_COLORS[account.sku] || '#6b7280',
                      fontFamily: 'var(--font-mono)',
                    }}>{SKU_LABELS[account.sku] || account.sku}</span>
                    {(account.addons || []).map(a => (
                      <span key={a} style={{
                        fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                        background: 'var(--bg-surface3)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)',
                      }}>{ADDON_LABELS[a] || a}</span>
                    ))}
                  </div>

                  <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.currentStage || '—'}</span>

                  {/* Completion — bar + % */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 12 }}>
                    <div style={{ flex: 1, background: 'var(--bg-surface2)', borderRadius: 99, height: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${account.completionPct}%`, height: '100%', borderRadius: 99, background: account.completionPct >= 75 ? '#10b981' : '#3b82f6' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', flexShrink: 0, width: 30, textAlign: 'right' }}>{account.completionPct}%</span>
                  </div>

                  {/* Last Contact */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span
                      title={account.lastContactDate ? new Date(account.lastContactDate).toLocaleString() : undefined}
                      style={{
                        fontSize: 11,
                        color: account.daysSinceContact >= 14 ? '#ef4444' : account.daysSinceContact >= 7 ? '#f59e0b' : 'var(--text-2)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {account.daysSinceContact === 999 ? '—' : account.daysSinceContact === 0 ? 'today' : `${account.daysSinceContact}d ago`}
                    </span>
                  </div>

                  {/* Tasks */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setExpandedTask(expanded ? null : account.id) }}
                      style={{
                        background: openTaskCount > 0 ? 'var(--bg-surface3)' : 'none',
                        border: `1px solid ${openTaskCount > 0 ? 'var(--border-b)' : 'var(--border)'}`,
                        borderRadius: 5, padding: '2px 8px',
                        color: openTaskCount > 0 ? 'var(--text)' : 'var(--text-3)',
                        fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 600,
                        minWidth: 28, textAlign: 'center',
                      }}
                    >{openTaskCount}</button>
                  </div>

                  {/* Health — manual dropdown */}
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <select
                      value={account.health_status || 'active'}
                      disabled={healthUpdating === account.id}
                      onChange={e => updateHealth(account.id, e.target.value as HealthStatus)}
                      style={{
                        background: healthOpt.color + '14',
                        border: `1px solid ${healthOpt.color}40`,
                        borderRadius: 5, padding: '3px 8px',
                        color: healthOpt.color, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'var(--font-ui)',
                        appearance: 'none', WebkitAppearance: 'none',
                        outline: 'none',
                      }}
                    >
                      {HEALTH_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Expanded tasks */}
                {expanded && (
                  <div style={{ padding: '8px 16px 12px 32px', background: 'var(--bg-stage)', borderBottom: '1px solid var(--border)' }}>
                    {(account.open_tasks || []).filter(t => !t.done).length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No open tasks</span>
                    ) : (
                      (account.open_tasks || []).filter(t => !t.done).map(task => (
                        <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: task.assignee === 'customer' ? '#f59e0b' : '#3b82f6', flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--text)' }}>{task.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>{task.assignee}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showCreate && (
        <CreateAccountModal
          onClose={() => setShowCreate(false)}
          onCreated={onRefresh}
          orgMembers={orgMembers}
          trainingTemplates={trainingTemplates}
          planTemplates={planTemplates}
          sessionTemplates={sessionTemplates}
        />
      )}
    </div>
  )
}
