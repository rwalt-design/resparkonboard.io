import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

type ItemConfig = { type: string; name: string; assignee?: string; required: boolean }
type StageConfig = { name: string; items: ItemConfig[] }
type MilestoneConfig = { name: string; stages: StageConfig[] }

interface GeneratePlanBody {
  accountId: string
  sku: string
  addons: string[]
  trainingTemplates: { name: string; triggers?: string[] }[]
  customPlan: {
    structure: {
      milestones: {
        name: string
        stages: { name: string; items: { type: string; name: string; assignee?: string; required: boolean }[] }[]
      }[]
    }
  } | null
  accessToken: string
  refreshToken: string
}

export async function POST(req: NextRequest) {
  const body: GeneratePlanBody = await req.json()
  const { accountId, sku, addons, trainingTemplates, customPlan, accessToken, refreshToken } = body

  if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Create a Supabase client and set the session so auth.uid() is properly set in every RLS check
  const db = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { error: sessionErr } = await db.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (sessionErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify this account belongs to the user's org
  const { data: account } = await db.from('accounts').select('org_id').eq('id', accountId).single()
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const { data: member } = await db.from('org_members').select('org_id').eq('user_id', user.id).single()
  if (!member || member.org_id !== account.org_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const triggers = [sku, ...addons]

  const matchingTraining = trainingTemplates.filter(t =>
    !t.triggers?.length || t.triggers.some(tr => triggers.includes(tr))
  )

  // Training stages — driven by training templates
  const trainingStages: StageConfig[] = matchingTraining.length > 0
    ? matchingTraining.map(t => ({
        name: t.name,
        items: [
          { type: 'session', name: t.name, required: true },
          { type: 'task', name: `Confirm ${t.name} complete`, assignee: 'customer', required: true },
        ],
      }))
    : [{ name: 'Training', items: [
        { type: 'session', name: 'Training Session', required: true },
        { type: 'task', name: 'Confirm training complete', assignee: 'customer', required: true },
      ]}]

  let milestoneConfigs: MilestoneConfig[]

  if (customPlan && customPlan.structure?.milestones?.length > 0) {
    milestoneConfigs = customPlan.structure.milestones.map(m => ({
      name: m.name,
      stages: m.name === 'Training'
        ? trainingStages
        : (m.stages || []).map(s => ({
            name: s.name,
            items: (s.items || []).map(i => ({
              type: i.type,
              name: i.name,
              assignee: i.assignee,
              required: i.required,
            })),
          })),
    }))
  } else {
    milestoneConfigs = [
      {
        name: 'Configuration',
        stages: [
          { name: 'Account Creation', items: [
            { type: 'task', name: 'Add primary contacts',   assignee: 'personal', required: true },
            { type: 'task', name: 'Select products / SKUs', assignee: 'personal', required: true },
            { type: 'task', name: 'Set ARR',                assignee: 'personal', required: true },
            { type: 'task', name: 'Add sales context',      assignee: 'personal', required: true },
          ]},
          { name: 'Kickoff', items: [
            { type: 'session',  name: 'Kickoff Meeting',  required: true },
            { type: 'exchange', name: 'Data Template',    required: true },
          ]},
          { name: 'Discovery', items: [
            { type: 'session',  name: 'Discovery Meeting', required: true },
            { type: 'exchange', name: 'Hardware Doc',      required: true },
            { type: 'exchange', name: 'Compliance Doc',    required: true },
            { type: 'exchange', name: 'Reporting Doc',     required: true },
            { type: 'exchange', name: 'Accounting Doc',    required: true },
          ]},
          { name: 'Environment Setup', items: [
            { type: 'task', name: 'Upload Data',              assignee: 'personal', required: true },
            { type: 'task', name: 'Integrate Hardware',       assignee: 'personal', required: true },
            { type: 'task', name: 'Set Up Compliance Flows',  assignee: 'personal', required: true },
            { type: 'task', name: 'Integrate Accounting',     assignee: 'personal', required: true },
            { type: 'task', name: 'Custom Workflow Setup',    assignee: 'personal', required: false },
          ]},
        ],
      },
      { name: 'Training', stages: trainingStages },
      {
        name: 'Validation',
        stages: [
          { name: 'User Testing', items: [
            { type: 'log', name: 'Daily Job/Ticket Usage', required: true },
          ]},
          { name: 'Readiness Review', items: [
            { type: 'session',  name: 'Q&A',                         required: true },
            { type: 'exchange', name: 'Pre-Launch Checklist',         required: true },
            { type: 'task',     name: 'Review Pre-Launch Checklist',  assignee: 'personal', required: true },
          ]},
        ],
      },
      {
        name: 'Go-Live',
        stages: [
          { name: 'Launch', items: [
            { type: 'task',    name: 'Usage Review',         assignee: 'personal', required: true },
            { type: 'session', name: 'Post-Launch Check-In', required: false },
            { type: 'handoff', name: 'CSM Handoff',          required: false },
          ]},
        ],
      },
    ]
  }

  for (let mi = 0; mi < milestoneConfigs.length; mi++) {
    const mc = milestoneConfigs[mi]
    const { data: milestone, error: mErr } = await db.from('milestones').insert({
      account_id: accountId, name: mc.name, order_index: mi,
    }).select('id').single()
    if (mErr || !milestone) {
      console.error('Milestone insert failed:', mErr)
      return NextResponse.json({ error: `Failed to create milestone "${mc.name}": ${mErr?.message}` }, { status: 500 })
    }

    for (let si = 0; si < mc.stages.length; si++) {
      const sc = mc.stages[si]
      const { data: stage, error: sErr } = await db.from('stages').insert({
        milestone_id: milestone.id,
        name: sc.name,
        status: si === 0 && mi === 0 ? 'active' : 'locked',
        order_index: si,
      }).select('id').single()
      if (sErr || !stage) {
        console.error('Stage insert failed:', sErr)
        return NextResponse.json({ error: `Failed to create stage "${sc.name}": ${sErr?.message}` }, { status: 500 })
      }

      let orderIdx = 0
      const rows: Record<string, unknown>[] = []
      for (const item of sc.items) {
        if (item.type === 'exchange') {
          rows.push(
            { stage_id: stage.id, type: 'task', required: item.required, order_index: orderIdx++,
              task_name: `Send ${item.name}`, task_assignee: 'personal', task_source: 'plan', task_done: false },
            { stage_id: stage.id, type: 'task', required: item.required, order_index: orderIdx++,
              task_name: `Return ${item.name}`, task_assignee: 'customer', task_source: 'plan', task_done: false },
          )
        } else {
          rows.push({
            stage_id: stage.id,
            type: item.type,
            required: item.required,
            order_index: orderIdx++,
            ...(item.type === 'task' || item.type === 'log' ? {
              task_name: item.name,
              task_assignee: item.assignee || 'personal',
              task_source: 'plan',
              task_done: false,
            } : {}),
            ...(item.type === 'session' ? { session_name: item.name, session_status: 'pending' } : {}),
            ...(item.type === 'handoff' ? { handoff_name: item.name } : {}),
          })
        }
      }
      if (rows.length > 0) {
        const { error: iErr } = await db.from('items').insert(rows)
        if (iErr) {
          console.error('Items insert failed:', iErr)
          return NextResponse.json({ error: `Failed to create items for "${sc.name}": ${iErr.message}` }, { status: 500 })
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
