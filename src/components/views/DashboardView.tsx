'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Tooltip } from '@/components/Tooltip'
import type { Account, AccountSummary, OrgMember, TrainingTemplate, PlanTemplate, SessionTemplate, HealthStatus } from '@/types'

const INTERACTION_TYPE_LABELS: Record<string, string> = {
  email:           'Email received',
  email_sent:      'Email sent',
  called:          'Called',
  texted:          'Text',
  bumped_email:    'Bumped email',
  sent_follow_up:  'Follow-up sent',
  no_show:         'No-show',
  custom:          'Logged',
  meeting:         'Meeting',
  call:            'Call',
}

const SKU_LABELS: Record<string, string> = {
  essentials:          'Essentials',
  pro:                 'Pro',
  dispatch:            'Dispatch',
  rail:                'Rail',
  exports:             'Exports',
  uptimepm_core:       'UptimePM Core',
  uptimepm_pro:        'UptimePM Pro',
  uptimepm_enterprise: 'UptimePM Enterprise',
}
const SKU_COLORS: Record<string, string> = {
  essentials:          '#10b981',
  pro:                 '#1BB3BB',
  dispatch:            '#f59e0b',
  rail:                '#6b7280',
  exports:             '#3b82f6',
  uptimepm_core:       '#7757F5',
  uptimepm_pro:        '#6366f1',
  uptimepm_enterprise: '#4f46e5',
}
const ADDON_LABELS: Record<string, string> = {
  ai_commercial:  'Commercial Agent',
  ai_operations:  'Operations Agent',
  ai_finance:     'Finance Agent',
  ai_dispatch:    'Dispatch Agent',
  supplier_portal: 'Supplier Portal',
  integrated_gl:  'Integrated GL',
  brokerage:      'Brokerage',
  crv_processing: 'CRV Processing',
  dispatch:       'Dispatch',
  rail:           'Rail',
  exports:        'Exports',
  positive_pay:   'Positive Pay',
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

  // Use calendar-day diff so "yesterday at 11pm" = 1d ago, not 0d ago
  const calendarDaysAgo = (dateStr: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
    return Math.round((today.getTime() - d.getTime()) / 86400000)
  }

  // Use event_at when present (synced emails/calendar), fall back to created_at
  const effectiveDate = (i: { event_at?: string | null; created_at: string }) =>
    i.event_at ?? i.created_at

  // Contact = actual two-way interaction
  //   inbound email, calendar meeting, call where they picked up,
  //   or custom interaction explicitly marked [contact]
  const isContact = (i: { type: string; summary?: string; detail?: string; gmail_message_id?: string | null }) => {
    if (i.type === 'email' && i.gmail_message_id) return true
    if (i.type === 'meeting' || i.type === 'call') return true
    if (i.type === 'called') return !!(i.summary?.includes('Reached'))
    if (i.type === 'custom') return !!(i.detail?.startsWith('[contact]'))
    return false
  }

  // Outreach = CSM-initiated action (includes meetings and all call outcomes)
  const isOutreach = (i: { type: string; detail?: string }) => {
    if (['email_sent', 'texted', 'bumped_email', 'sent_follow_up', 'no_show', 'meeting', 'call', 'called'].includes(i.type)) return true
    if (i.type === 'custom') return !(i.detail?.startsWith('[contact]'))
    return false
  }

  const contactInteractions = (account.interactions || []).filter(isContact)
  let daysSinceContact = 999
  let lastContactDate: string | undefined
  let lastContactSummary: string | undefined
  let lastContactType: string | undefined
  if (contactInteractions.length > 0) {
    const latest = contactInteractions.reduce((a, b) =>
      new Date(effectiveDate(a)) > new Date(effectiveDate(b)) ? a : b
    )
    lastContactDate = effectiveDate(latest)
    lastContactSummary = latest.summary || undefined
    lastContactType = latest.type
    daysSinceContact = calendarDaysAgo(lastContactDate)
  }

  // Last Outreach = last time the CSM reached out
  const outreachInteractions = (account.interactions || []).filter(isOutreach)
  let daysSinceOutreach = 999
  let lastOutreachDate: string | undefined
  let lastOutreachSummary: string | undefined
  let lastOutreachType: string | undefined
  if (outreachInteractions.length > 0) {
    const latest = outreachInteractions.reduce((a, b) =>
      new Date(effectiveDate(a)) > new Date(effectiveDate(b)) ? a : b
    )
    lastOutreachDate = effectiveDate(latest)
    lastOutreachSummary = latest.summary || undefined
    lastOutreachType = latest.type
    daysSinceOutreach = calendarDaysAgo(lastOutreachDate)
  }

  return {
    ...account,
    currentStage,
    completionPct,
    daysSinceContact,
    lastContactDate,
    lastContactSummary,
    lastContactType,
    daysSinceOutreach,
    lastOutreachDate,
    lastOutreachSummary,
    lastOutreachType,
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
  const [sku, setSku] = useState<string>('essentials')
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

    const form_slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

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
        form_slug: form_slug || null,
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(SKU_LABELS).map(([val, label]) => (
                <button key={val} onClick={() => { setSku(val); setSelectedPlanId(null) }} style={{
                  padding: '6px 10px', borderRadius: 6,
                  background: sku === val ? SKU_COLORS[val] + '22' : 'var(--bg-surface2)',
                  border: `1px solid ${sku === val ? SKU_COLORS[val] : 'var(--border-b)'}`,
                  color: sku === val ? SKU_COLORS[val] : 'var(--text-2)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                }}>{label}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4 }}>Add-ons</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(ADDON_LABELS).map(([val, label]) => (
                <button key={val} onClick={() => toggleAddon(val)} style={{
                  padding: '6px 10px', borderRadius: 6,
                  background: addons.includes(val) ? '#1BB3BB22' : 'var(--bg-surface2)',
                  border: `1px solid ${addons.includes(val) ? '#1BB3BB' : 'var(--border-b)'}`,
                  color: addons.includes(val) ? '#1BB3BB' : 'var(--text-2)',
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
                  background: selectedPlanId === null ? '#1BB3BB10' : 'var(--bg-surface2)',
                  border: `1px solid ${selectedPlanId === null ? '#1BB3BB' : 'var(--border-b)'}`,
                  fontFamily: 'var(--font-ui)', textAlign: 'left',
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${selectedPlanId === null ? '#1BB3BB' : 'var(--text-3)'}`,
                    background: selectedPlanId === null ? '#1BB3BB' : 'transparent',
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: selectedPlanId === null ? '#5DDDE3' : 'var(--text)' }}>Default</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Configuration → Training → Validation → Go-Live</div>
                  </div>
                </button>

                {matchingPlans.map(plan => (
                  <button key={plan.id} onClick={() => setSelectedPlanId(plan.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 7, cursor: 'pointer',
                    background: selectedPlanId === plan.id ? '#1BB3BB10' : 'var(--bg-surface2)',
                    border: `1px solid ${selectedPlanId === plan.id ? '#1BB3BB' : 'var(--border-b)'}`,
                    fontFamily: 'var(--font-ui)', textAlign: 'left',
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${selectedPlanId === plan.id ? '#1BB3BB' : 'var(--text-3)'}`,
                      background: selectedPlanId === plan.id ? '#1BB3BB' : 'transparent',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: selectedPlanId === plan.id ? '#5DDDE3' : 'var(--text)' }}>{plan.name}</div>
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#5DDDE3', marginBottom: 4 }}>{account.name}</div>
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

type SortCol = 'name' | 'completion' | 'outreach' | 'contact' | 'tasks' | 'health' | 'stage'

function loadDashState() {
  if (typeof window === 'undefined') return { sortCol: null as SortCol | null, sortDir: 'asc' as 'asc' | 'desc', filterSearch: '', filterHealth: '' }
  try {
    const sort = JSON.parse(localStorage.getItem('dash-sort') || 'null')
    const filter = JSON.parse(localStorage.getItem('dash-filter') || 'null')
    return {
      sortCol: (sort?.col ?? null) as SortCol | null,
      sortDir: (sort?.dir ?? 'asc') as 'asc' | 'desc',
      filterSearch: filter?.search ?? '',
      filterHealth: filter?.health ?? '',
    }
  } catch { return { sortCol: null as SortCol | null, sortDir: 'asc' as 'asc' | 'desc', filterSearch: '', filterHealth: '' } }
}

function isHandedOff(account: Account): boolean {
  const milestones = account.milestones || []
  if (milestones.length === 0) return false
  // Explicit handoff item completed
  const hasCompletedHandoff = milestones.some(m =>
    m.stages.some(s => s.items.some(i =>
      (i.type === 'handoff' || /hand.?off/i.test(i.task_name || '') || /hand.?off/i.test(i.handoff_name || ''))
      && i.task_done
    ))
  )
  if (hasCompletedHandoff) return true
  // Fallback: every milestone has all stages complete
  return milestones.every(m => m.stages.length > 0 && m.stages.every(s => s.status === 'complete'))
}

export function DashboardView({ accounts, currentMember, orgMembers, trainingTemplates, planTemplates, sessionTemplates, accountsWithSuggestions, onSelectAccount, onRefresh }: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [showWeeklySummary, setShowWeeklySummary] = useState(false)
  const [healthUpdating, setHealthUpdating] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'onboarding' | 'handed_off'>('onboarding')

  const isManager = currentMember?.role === 'manager'

  const init = useMemo(loadDashState, [])
  const [sortCol, setSortCol] = useState<SortCol | null>(init.sortCol)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(init.sortDir)
  const [filterSearch, setFilterSearch] = useState(init.filterSearch)
  const [filterHealth, setFilterHealth] = useState(init.filterHealth)

  const supabase = createClient()

  const setSort = (col: SortCol) => {
    const next = sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
    setSortCol(col)
    setSortDir(next)
    localStorage.setItem('dash-sort', JSON.stringify({ col, dir: next }))
  }

  const updateFilter = (patch: { search?: string; health?: string }) => {
    const next = { search: filterSearch, health: filterHealth, ...patch }
    if (patch.search !== undefined) setFilterSearch(patch.search)
    if (patch.health !== undefined) setFilterHealth(patch.health)
    localStorage.setItem('dash-filter', JSON.stringify(next))
  }

  const summaries = useMemo(() => accounts.map(computeSummary), [accounts])
  const onboardingAccounts = useMemo(() => summaries.filter(a => !isHandedOff(a)), [summaries])
  const handedOffAccounts = useMemo(() => summaries.filter(a => isHandedOff(a)), [summaries])

  const sorted = useMemo(() => {
    let list = [...(activeTab === 'handed_off' ? handedOffAccounts : onboardingAccounts)]

    // Filter
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase()
      list = list.filter(a => a.name.toLowerCase().includes(q))
    }
    if (filterHealth) {
      list = list.filter(a => (a.health_status || 'active') === filterHealth)
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortCol === 'name') list.sort((a, b) => a.name.localeCompare(b.name) * dir)
    else if (sortCol === 'completion') list.sort((a, b) => (a.completionPct - b.completionPct) * dir)
    else if (sortCol === 'outreach') list.sort((a, b) => (a.daysSinceOutreach - b.daysSinceOutreach) * dir)
    else if (sortCol === 'contact') list.sort((a, b) => (a.daysSinceContact - b.daysSinceContact) * dir)
    else if (sortCol === 'tasks') list.sort((a, b) => (a.openTaskCount - b.openTaskCount) * dir)
    else if (sortCol === 'health') list.sort((a, b) => (a.health_status || 'active').localeCompare(b.health_status || 'active') * dir)
    else if (sortCol === 'stage') list.sort((a, b) => (a.currentStage || '').localeCompare(b.currentStage || '') * dir)
    else list.sort((a, b) => a.completionPct - b.completionPct || a.name.localeCompare(b.name))

    return list
  }, [summaries, sortCol, sortDir, filterSearch, filterHealth, activeTab])

  const updateHealth = async (accountId: string, status: HealthStatus) => {
    setHealthUpdating(accountId)
    await supabase.from('accounts').update({ health_status: status }).eq('id', accountId)
    await onRefresh()
    setHealthUpdating(null)
  }

  // Account | SKU | Stage | Completion | Last Outreach | Last Contact | Timeline | Tasks | Health
  const cols = 'minmax(140px,1.6fr) minmax(90px,1fr) minmax(100px,1.2fr) 112px 128px 128px 120px 80px 128px'

  // Date helpers for header columns
  const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() }
  const daysFromToday = (dateStr?: string | null): number | null => {
    if (!dateStr) return null
    const target = new Date(dateStr); target.setHours(0,0,0,0)
    return Math.round((target.getTime() - startOfToday()) / 86400000)
  }
  const daysSinceDate = (dateStr?: string | null): number | null => {
    if (!dateStr) return null
    const past = new Date(dateStr); past.setHours(0,0,0,0)
    return Math.max(0, Math.round((startOfToday() - past.getTime()) / 86400000))
  }

  // Light green → rich green based on completion %
  const stageColor = (pct: number) => {
    const t = Math.min(pct / 100, 1)
    const r = Math.round(0xbb + (0x10 - 0xbb) * t)
    const g = Math.round(0xf7 + (0xb9 - 0xf7) * t)
    const b = Math.round(0xd0 + (0x81 - 0xd0) * t)
    return `rgb(${r},${g},${b})`
  }

  return (
    <div className="dash-wrap" style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-h)' }}>Accounts</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowWeeklySummary(true)} style={secondaryBtnStyle}>
            <span className="hide-mobile">Weekly </span>Summary
          </button>
          <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>
            + <span className="hide-mobile">New Account</span><span className="mobile-only" style={{ display: 'none' }}>New</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {([
          { key: 'onboarding', label: 'Onboarding', count: onboardingAccounts.length },
          { key: 'handed_off', label: 'Handed Off',  count: handedOffAccounts.length },
        ] as const).map(({ key, label, count }) => {
          const active = activeTab === key
          return (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              background: 'none', border: 'none', padding: '6px 14px 10px',
              fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? 'var(--text-h)' : 'var(--text-3)',
              cursor: 'pointer', fontFamily: 'var(--font-ui)',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.1s',
            }}>
              {label}
              <span style={{
                marginLeft: 6, fontSize: 11, fontWeight: 600,
                background: active ? 'var(--accent)' : 'var(--bg-surface3)',
                color: active ? '#fff' : 'var(--text-3)',
                borderRadius: 99, padding: '1px 6px',
              }}>{count}</span>
            </button>
          )
        })}
      </div>

      {showWeeklySummary && <WeeklySummaryModal accounts={accounts} onClose={() => setShowWeeklySummary(false)} />}

      {accounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 14, marginBottom: 8 }}>No accounts yet</p>
          <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>Create your first account</button>
        </div>
      ) : (
        <>
        {/* Filter bar */}
        <div className="dash-filter-bar" style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <input
            value={filterSearch}
            onChange={e => updateFilter({ search: e.target.value })}
            placeholder="Search accounts…"
            className="dash-filter-search"
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '5px 10px', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-ui)',
              outline: 'none', width: 200,
            }}
          />
          <select
            value={filterHealth}
            onChange={e => updateFilter({ health: e.target.value })}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '5px 8px', fontSize: 12, color: filterHealth ? 'var(--text)' : 'var(--text-3)',
              fontFamily: 'var(--font-ui)', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All health</option>
            {HEALTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {(filterSearch || filterHealth) && (
            <button
              onClick={() => updateFilter({ search: '', health: '' })}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                padding: '5px 8px', fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-ui)',
              }}
            >Clear</button>
          )}
          {sorted.length !== summaries.length && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>{sorted.length} of {summaries.length}</span>
          )}
        </div>

        {/* ── Mobile card list ─────────────────────────────────── */}
        <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(account => {
            const healthOpt = HEALTH_OPTIONS.find(o => o.value === (account.health_status || 'active')) || HEALTH_OPTIONS[0]
            const openTasks = (account.open_tasks || []).filter(t => !t.done)
            const owner = orgMembers.find(m => m.user_id === account.owner_id)
            return (
              <div
                key={account.id}
                onClick={() => onSelectAccount(account)}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                }}
              >
                {/* Row 1: avatar + name + health */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {owner?.avatar_url
                    ? <img src={owner.avatar_url} alt="" width={20} height={20} referrerPolicy="no-referrer" style={{ borderRadius: '50%', border: '1.5px solid var(--border)', flexShrink: 0 }} />
                    : owner
                      ? <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 99, background: 'var(--accent)', color: '#fff', flexShrink: 0, fontFamily: 'var(--font-ui)' }}>
                          {owner.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      : null
                  }
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#5DDDE3', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: healthOpt.color + '18', color: healthOpt.color, flexShrink: 0 }}>{healthOpt.label}</span>
                </div>

                {/* Row 2: SKU + stage */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: (SKU_COLORS[account.sku] || '#6b7280') + '22', color: SKU_COLORS[account.sku] || '#6b7280', fontFamily: 'var(--font-mono)' }}>
                    {SKU_LABELS[account.sku] || account.sku}
                  </span>
                  {account.currentStage && (
                    <>
                      <span style={{ fontSize: 10, color: 'var(--text-3)' }}>·</span>
                      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{account.currentStage}</span>
                    </>
                  )}
                </div>

                {/* Row 3: completion bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, background: 'var(--bg-surface2)', borderRadius: 99, height: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${account.completionPct}%`, height: '100%', borderRadius: 99, background: account.completionPct >= 75 ? '#10b981' : '#1BB3BB' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{account.completionPct}%</span>
                </div>

                {/* Row 4: outreach / contact / tasks */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 11, color: account.daysSinceOutreach >= 14 ? '#ef4444' : account.daysSinceOutreach >= 7 ? '#f59e0b' : 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    Out: {account.daysSinceOutreach === 999 ? '—' : account.daysSinceOutreach === 0 ? 'today' : `${account.daysSinceOutreach}d`}
                  </span>
                  <span style={{ fontSize: 11, color: account.daysSinceContact >= 14 ? '#ef4444' : account.daysSinceContact >= 7 ? '#f59e0b' : 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    Contact: {account.daysSinceContact === 999 ? '—' : account.daysSinceContact === 0 ? 'today' : `${account.daysSinceContact}d`}
                  </span>
                  {openTasks.length > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
                      {openTasks.length} task{openTasks.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {sorted.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>No accounts match filters</div>
          )}
        </div>

        {/* ── Desktop table ────────────────────────────────────── */}
        <div className="desktop-only" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
          {activeTab === 'handed_off' ? (
            /* ── Handed-off columns ── */
            <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,2fr) minmax(90px,1fr) 100px 100px 100px 80px 100px', columnGap: 16, padding: '8px 16px', borderBottom: '1px solid var(--border)', minWidth: 780 }}>
              {['Account', 'SKU', 'KO Date', 'Went Live', 'Days to Live', 'Paused', 'Since Live'].map((label, i) => (
                <span key={label} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i > 1 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{label}</span>
              ))}
            </div>
            {sorted.map(account => {
              const ko   = account.kickoff_date ? new Date(account.kickoff_date + 'T00:00:00') : null
              const live = account.go_live_date ? new Date(account.go_live_date + 'T00:00:00') : null
              const paused = account.paused_days ?? 0
              const rawDays = ko && live ? Math.round((live.getTime() - ko.getTime()) / 86400000) : null
              const daysToLive = rawDays != null ? Math.max(0, rawDays - paused) : null
              const daysSinceLive = live ? Math.round((Date.now() - live.getTime()) / 86400000) : null
              const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'
              return (
                <div key={account.id}
                  onClick={() => onSelectAccount(account)}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,2fr) minmax(90px,1fr) 100px 100px 100px 80px 100px', columnGap: 16, padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', cursor: 'pointer', minWidth: 780 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>{account.name}</div>
                    {account.arr > 0 && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>${account.arr.toLocaleString()}</div>}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{account.sku}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'right' }}>{fmtDate(ko)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'right' }}>{fmtDate(live)}</span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', color: daysToLive != null ? 'var(--text)' : 'var(--text-3)' }}>{daysToLive != null ? `${daysToLive}d` : '—'}</span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', color: paused > 0 ? '#f59e0b' : 'var(--text-3)' }}>{paused > 0 ? `${paused}d` : '—'}</span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--text-2)' }}>{daysSinceLive != null ? `${daysSinceLive}d` : '—'}</span>
                </div>
              )
            })}
            {sorted.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No handed-off accounts yet</div>}
            </>
          ) : (
          /* ── Onboarding columns ── */
          <>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 16, padding: '8px 16px', borderBottom: '1px solid var(--border)', minWidth: 900 }}>
            {([
              { label: 'Account',       align: 'left',   sortKey: 'name',       tip: 'Account name and ARR' },
              { label: 'SKU',           align: 'left',   sortKey: null,         tip: 'Product tier and active add-ons' },
              { label: 'Current Stage', align: 'left',   sortKey: 'stage',      tip: 'The active onboarding stage — click the pill to manually advance' },
              { label: 'Completion',    align: 'left',   sortKey: 'completion', tip: '% of required plan items marked complete' },
              { label: 'Last Outreach', align: 'center', sortKey: 'outreach',   tip: 'Days since you last reached out (call, email, follow-up). Red = 14+ days, orange = 7–13 days.' },
              { label: 'Last Contact',  align: 'center', sortKey: 'contact',    tip: 'Days since any interaction — includes inbound emails and sessions from the customer side' },
              { label: 'Timeline',      align: 'center', sortKey: null,         tip: 'KO = days since kickoff · GL = days until (or past) go-live date. Red = overdue.' },
              { label: 'Tasks',         align: 'center', sortKey: 'tasks',      tip: 'Open tasks — click to expand. Blue dot = your team, orange = waiting on customer.' },
              { label: 'Health',        align: 'right',  sortKey: 'health',     tip: 'Overall account health. Change here or from inside the account.' },
            ] as { label: string; align: string; sortKey: SortCol | null; tip: string }[]).map(({ label, align, sortKey, tip }) => {
              const active = sortCol === sortKey
              const indicator = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
              return sortKey ? (
                <Tooltip key={label} content={tip} placement="bottom">
                  <button onClick={() => setSort(sortKey)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: align as 'left' | 'center' | 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-ui)' }}>{label}{indicator}</button>
                </Tooltip>
              ) : (
                <Tooltip key={label} content={tip} placement="bottom">
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: align as 'left' | 'center' | 'right', whiteSpace: 'nowrap', cursor: 'default' }}>{label}</span>
                </Tooltip>
              )
            })}
          </div>

          {sorted.map((account) => {
            const healthOpt = HEALTH_OPTIONS.find(o => o.value === (account.health_status || 'active')) || HEALTH_OPTIONS[0]
            const openTaskCount = (account.open_tasks || []).filter(t => !t.done).length
            const expanded = expandedTask === account.id

            return (
              <div key={account.id}>
                <div
                  style={{
                    display: 'grid', gridTemplateColumns: cols, columnGap: 16,
                    padding: '10px 16px', borderBottom: '1px solid var(--border)',
                    alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s',
                    minWidth: 900,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => onSelectAccount(account)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {/* Owner avatar / initials — visible to managers for all accounts, to members for their own */}
                      {(() => {
                        const owner = orgMembers.find(m => m.user_id === account.owner_id)
                        if (!owner) return null
                        const isMine = owner.user_id === currentMember?.user_id
                        const label = isMine ? 'Your account' : owner.name
                        if (owner.avatar_url) {
                          return (
                            <Tooltip content={label} placement="top">
                              <img
                                src={owner.avatar_url}
                                alt=""
                                width={18} height={18}
                                referrerPolicy="no-referrer"
                                style={{ borderRadius: '50%', flexShrink: 0, border: '1.5px solid var(--border)', display: 'block' }}
                              />
                            </Tooltip>
                          )
                        }
                        const initials = owner.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                        return (
                          <Tooltip content={label} placement="top">
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                              background: 'var(--accent)', color: '#fff', flexShrink: 0,
                              fontFamily: 'var(--font-ui)', cursor: 'default',
                            }}>{initials}</span>
                          </Tooltip>
                        )
                      })()}
                      <span style={{ fontSize: 13, color: '#5DDDE3', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</span>
                      {account.arr > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                          ${account.arr >= 1000 ? `${(account.arr / 1000).toFixed(account.arr % 1000 === 0 ? 0 : 1)}k` : account.arr.toLocaleString()}
                        </span>
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
                    <Tooltip content={`SKU: ${SKU_LABELS[account.sku] || account.sku} — determines which plan template and features apply`} placement="bottom">
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: (SKU_COLORS[account.sku] || '#6b7280') + '22',
                        color: SKU_COLORS[account.sku] || '#6b7280',
                        fontFamily: 'var(--font-mono)',
                      }}>{SKU_LABELS[account.sku] || account.sku}</span>
                    </Tooltip>
                    {(account.addons || []).map(a => (
                      <Tooltip key={a} content={`Add-on: ${ADDON_LABELS[a] || a}`} placement="bottom">
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                          background: 'var(--bg-surface3)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)',
                        }}>{ADDON_LABELS[a] || a}</span>
                      </Tooltip>
                    ))}
                  </div>

                  {/* Current Stage — color-coded pill + clickable override */}
                  {(() => {
                    const allStages = (account.milestones || []).flatMap(m => m.stages)
                    const color = stageColor(account.completionPct)
                    return (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center',
                        background: color + '22', border: `1px solid ${color}55`,
                        borderRadius: 20, padding: '2px 10px',
                        maxWidth: '100%', overflow: 'hidden',
                      }}>
                        <select
                          value={account.currentStage || ''}
                          onClick={e => e.stopPropagation()}
                          onChange={async e => {
                            e.stopPropagation()
                            const selectedName = e.target.value
                            const supabase = createClient()
                            let found = false
                            for (const stage of allStages) {
                              if (stage.name === selectedName) {
                                await supabase.from('stages').update({ status: 'active' }).eq('id', stage.id)
                                found = true
                              } else if (!found) {
                                await supabase.from('stages').update({ status: 'complete' }).eq('id', stage.id)
                              } else {
                                await supabase.from('stages').update({ status: 'locked' }).eq('id', stage.id)
                              }
                            }
                            await onRefresh()
                          }}
                          style={{
                            background: 'none', border: 'none', outline: 'none',
                            fontSize: 11, fontWeight: 600, color, cursor: 'pointer',
                            fontFamily: 'var(--font-ui)',
                            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                            appearance: 'none', WebkitAppearance: 'none',
                          }}
                        >
                          {!account.currentStage && <option value="">—</option>}
                          {allStages.map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })()}

                  {/* Completion — bar + % */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 12, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <div style={{ flex: 1, background: 'var(--bg-surface2)', borderRadius: 99, height: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${account.completionPct}%`, height: '100%', borderRadius: 99, background: account.completionPct >= 75 ? '#10b981' : '#1BB3BB' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', flexShrink: 0, width: 30, textAlign: 'right' }}>{account.completionPct}%</span>
                  </div>

                  {/* Last Outreach */}
                  <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    {(() => {
                      const label = account.daysSinceOutreach === 999 ? '—' : account.daysSinceOutreach === 0 ? 'today' : `${account.daysSinceOutreach}d ago`
                      const tip = account.lastOutreachDate
                        ? [
                            INTERACTION_TYPE_LABELS[account.lastOutreachType ?? ''] ?? account.lastOutreachType ?? 'Outreach',
                            '·',
                            new Date(account.lastOutreachDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                            account.lastOutreachSummary ? `\n${account.lastOutreachSummary.slice(0, 120)}` : '',
                          ].join(' ').trim()
                        : 'No outreach logged'
                      return (
                        <Tooltip content={tip} placement="top">
                          <span style={{
                            fontSize: 11, whiteSpace: 'nowrap',
                            color: account.daysSinceOutreach >= 14 ? '#ef4444' : account.daysSinceOutreach >= 7 ? '#f59e0b' : 'var(--text-2)',
                            fontFamily: 'var(--font-mono)',
                            cursor: 'default',
                          }}>
                            {label}
                          </span>
                        </Tooltip>
                      )
                    })()}
                  </div>

                  {/* Last Contact */}
                  <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    {(() => {
                      const label = account.daysSinceContact === 999 ? '—' : account.daysSinceContact === 0 ? 'today' : `${account.daysSinceContact}d ago`
                      const tip = account.lastContactDate
                        ? [
                            INTERACTION_TYPE_LABELS[account.lastContactType ?? ''] ?? account.lastContactType ?? 'Contact',
                            '·',
                            new Date(account.lastContactDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                            account.lastContactSummary ? `\n${account.lastContactSummary.slice(0, 120)}` : '',
                          ].join(' ').trim()
                        : 'No contact recorded'
                      return (
                        <Tooltip content={tip} placement="top">
                          <span style={{
                            fontSize: 11, whiteSpace: 'nowrap',
                            color: account.daysSinceContact >= 14 ? '#ef4444' : account.daysSinceContact >= 7 ? '#f59e0b' : 'var(--text-2)',
                            fontFamily: 'var(--font-mono)',
                            cursor: 'default',
                          }}>
                            {label}
                          </span>
                        </Tooltip>
                      )
                    })()}
                  </div>

                  {/* Timeline — KO and Go Live stacked */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, flexShrink: 0, lineHeight: 1.3 }}>
                    {(() => {
                      const ko = daysSinceDate(account.kickoff_date)
                      const gl = daysFromToday(account.go_live_date)
                      if (ko === null && gl === null) {
                        return <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>—</span>
                      }
                      const glColor = gl === null ? 'var(--text-3)' : gl < 0 ? '#ef4444' : gl <= 14 ? '#f59e0b' : 'var(--text-2)'
                      const glLabel = gl === null ? '—' : gl < 0 ? `${-gl}d over` : gl === 0 ? 'today' : `in ${gl}d`
                      return (
                        <>
                          <Tooltip
                            content={account.kickoff_date ? `Kicked off ${new Date(account.kickoff_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Kickoff date not set'}
                            placement="top"
                          >
                            <span style={{ fontSize: 10, whiteSpace: 'nowrap', color: ko === null ? 'var(--text-3)' : 'var(--text-2)', fontFamily: 'var(--font-mono)', cursor: 'default' }}>
                              <span style={{ color: 'var(--text-3)' }}>KO </span>{ko === null ? '—' : `${ko}d ago`}
                            </span>
                          </Tooltip>
                          <Tooltip
                            content={account.go_live_date ? `Go-live ${new Date(account.go_live_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Go-live date not set'}
                            placement="bottom"
                          >
                            <span style={{ fontSize: 10, whiteSpace: 'nowrap', color: glColor, fontFamily: 'var(--font-mono)', cursor: 'default' }}>
                              <span style={{ color: 'var(--text-3)' }}>GL </span>{glLabel}
                            </span>
                          </Tooltip>
                        </>
                      )
                    })()}
                  </div>

                  {/* Tasks */}
                  <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <Tooltip content={openTaskCount === 0 ? 'No open tasks' : `${openTaskCount} open task${openTaskCount > 1 ? 's' : ''} — click to expand. Blue = your team · Orange = customer`} placement="left">
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
                    </Tooltip>
                  </div>

                  {/* Health — manual dropdown */}
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <Tooltip content={`Health: ${healthOpt.label} — use this to flag accounts that are stalled, on hold, blocked, or unresponsive`} placement="left">
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
                    </Tooltip>
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
                          <Tooltip content={task.assignee === 'customer' ? 'Waiting on customer' : 'Your team\'s task'} placement="right">
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: task.assignee === 'customer' ? '#f59e0b' : '#1BB3BB', flexShrink: 0 }} />
                          </Tooltip>
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
        </>
        )}
        </div>
        </>
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
