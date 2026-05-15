import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/apply-plan-template
// Body: { account_id: string, plan_template_id?: string }
// Deletes existing milestones (and cascades to stages/items) and rebuilds
// the plan from the chosen template (or default if none given).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { account_id, plan_template_id } = await req.json()
  if (!account_id) return NextResponse.json({ error: 'Missing account_id' }, { status: 400 })

  // Verify org membership and that account belongs to the org
  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).single()
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('accounts').select('id, sku, addons').eq('id', account_id).eq('org_id', member.org_id).single()
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  // Fetch all templates for this org
  const [
    { data: trainingTemplates },
    { data: sessionTemplates },
    { data: planTemplate },
  ] = await Promise.all([
    supabase.from('training_templates').select('*').eq('org_id', member.org_id),
    supabase.from('session_templates').select('*').eq('org_id', member.org_id),
    plan_template_id
      ? supabase.from('plan_templates').select('*').eq('id', plan_template_id).eq('org_id', member.org_id).single()
      : Promise.resolve({ data: null }),
  ])

  const milestones = buildMilestonesJSON(
    account.sku,
    account.addons || [],
    trainingTemplates || [],
    sessionTemplates || [],
    planTemplate || null,
  )

  // Rebuild the plan via the SECURITY DEFINER RPC (which deletes existing milestones first)
  const { error } = await supabase.rpc('create_account_plan', {
    p_account_id: account_id,
    p_milestones: milestones,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Record which template this account was built from (enables template sync later)
  if (plan_template_id) {
    await supabase.from('accounts').update({ plan_template_id }).eq('id', account_id)
  }

  return NextResponse.json({ ok: true })
}

// ── Milestone builder (mirrors DashboardView's buildMilestonesJSON) ──────────

type Item = Record<string, unknown>
type Stage = { name: string; items: Item[] }
type Milestone = { name: string; stages: Stage[] }

interface TrainingTemplate {
  id: string
  name: string
  triggers?: string[]
}

interface SessionTemplate {
  id: string
  name: string
  agenda?: string[]
  tasks?: { name: string; assignee: string }[]
}

interface PlanTemplateItem {
  type: 'task' | 'session' | 'handoff' | 'log' | 'exchange'
  name: string
  assignee?: string
  required: boolean
  session_template_id?: string
}

interface PlanTemplateMilestone {
  name: string
  stages: { name: string; items: PlanTemplateItem[] }[]
}

interface PlanTemplate {
  structure?: {
    milestones?: PlanTemplateMilestone[]
  }
}

function buildMilestonesJSON(
  sku: string,
  addons: string[],
  trainingTemplates: TrainingTemplate[],
  sessionTemplates: SessionTemplate[],
  customPlan: PlanTemplate | null,
): Milestone[] {
  const triggers = [sku, ...addons]

  const matchingTraining = trainingTemplates.filter(t =>
    !t.triggers?.length || t.triggers.some(tr => triggers.includes(tr))
  )

  const expandItems = (rawItems: PlanTemplateItem[]): Item[] => {
    const out: Item[] = []
    for (const item of rawItems) {
      if (item.type === 'exchange') {
        out.push({ type: 'task', required: item.required, task_name: `Send ${item.name}`, task_assignee: 'personal', task_source: 'plan', task_done: false })
        out.push({ type: 'task', required: item.required, task_name: `Return ${item.name}`, task_assignee: 'customer', task_source: 'plan', task_done: false })
      } else if (item.type === 'session') {
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
        if (tmpl && tmpl.tasks?.length) {
          for (const t of tmpl.tasks) {
            out.push({ type: 'task', required: false, task_name: t.name, task_assignee: t.assignee || 'personal', task_source: 'plan', task_done: false })
          }
        }
      } else if (item.type === 'handoff') {
        out.push({ type: 'handoff', required: item.required, handoff_name: item.name })
      } else {
        out.push({
          type: item.type,
          required: item.required,
          task_name: item.name,
          task_assignee: item.assignee || 'personal',
          task_source: 'plan',
          task_done: false,
          ...(item.checklist?.length ? {
            checklist: item.checklist.map(c => ({
              id: crypto.randomUUID(),
              text: c.text,
              done: false,
              created_at: new Date().toISOString(),
            }))
          } : {}),
        })
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

  if (customPlan?.structure?.milestones?.length) {
    milestones = customPlan.structure.milestones.map((m: PlanTemplateMilestone) => ({
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
