import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/plan-templates/[id]/sync
// Additively pushes items from the template to accounts that use it.
// Creates missing stages; only adds missing items — never removes or modifies existing ones.
// scope: 'linked' (default) = only accounts with plan_template_id set
//        'all'              = every account in the org
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).single()
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const scope: 'linked' | 'all' = body.scope === 'all' ? 'all' : 'linked'

  const { data: template } = await supabase
    .from('plan_templates').select('*').eq('id', params.id).eq('org_id', member.org_id).single()
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  let accountQuery = supabase
    .from('accounts').select('id, name').eq('org_id', member.org_id)
  if (scope === 'linked') {
    accountQuery = accountQuery.eq('plan_template_id', params.id)
  }
  const { data: accounts } = await accountQuery
  if (!accounts?.length) return NextResponse.json({ accounts_synced: 0, items_added: 0, details: [] })

  let totalAdded = 0
  const details: { account_name: string; items_added: number }[] = []

  for (const account of accounts) {
    // Fetch milestones explicitly (no nested selects — RLS on nested tables is unreliable)
    const { data: milestones } = await supabase
      .from('milestones')
      .select('id, name, order_index')
      .eq('account_id', account.id)
      .order('order_index')

    if (!milestones?.length) continue
    const milestoneIds = milestones.map(m => m.id)

    // Fetch all stages for these milestones in one query
    const { data: allStages } = await supabase
      .from('stages')
      .select('id, name, order_index, milestone_id')
      .in('milestone_id', milestoneIds)
      .order('order_index')

    // Fetch all items for these stages in one query
    const stageIds = (allStages || []).map(s => s.id)
    const { data: allItems } = stageIds.length
      ? await supabase
          .from('items')
          .select('id, type, task_name, session_name, handoff_name, order_index, stage_id')
          .in('stage_id', stageIds)
      : { data: [] }

    // Build lookup maps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stagesByMilestone = new Map<string, any[]>()
    for (const s of allStages || []) {
      if (!stagesByMilestone.has(s.milestone_id)) stagesByMilestone.set(s.milestone_id, [])
      stagesByMilestone.get(s.milestone_id)!.push(s)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsByStage = new Map<string, any[]>()
    for (const i of allItems || []) {
      if (!itemsByStage.has(i.stage_id)) itemsByStage.set(i.stage_id, [])
      itemsByStage.get(i.stage_id)!.push(i)
    }

    let accountAdded = 0

    for (const tmplMilestone of (template.structure?.milestones || [])) {
      const acctMilestone = milestones.find(
        m => m.name.toLowerCase() === tmplMilestone.name.toLowerCase()
      )
      if (!acctMilestone) continue

      const acctStages = stagesByMilestone.get(acctMilestone.id) || []
      const maxStageOrder = acctStages.reduce((max, s) => Math.max(max, s.order_index ?? 0), acctStages.length - 1)
      let nextStageOrder = maxStageOrder + 1

      for (const tmplStage of (tmplMilestone.stages || [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let acctStage: any = acctStages.find(
          s => s.name.toLowerCase() === tmplStage.name.toLowerCase()
        )

        // Stage doesn't exist yet — create it
        if (!acctStage) {
          const { data: newStage } = await supabase
            .from('stages')
            .insert({ milestone_id: acctMilestone.id, name: tmplStage.name, status: 'locked', order_index: nextStageOrder++ })
            .select('id, name, order_index, milestone_id')
            .single()
          if (!newStage) continue
          acctStage = newStage
          acctStages.push(acctStage)
          stagesByMilestone.set(acctMilestone.id, acctStages)
          itemsByStage.set(acctStage.id, [])
        }

        const existingItems = itemsByStage.get(acctStage.id) || []
        const existingNames = new Set(
          existingItems.map(i =>
            (i.task_name || i.session_name || i.handoff_name || '').toLowerCase()
          )
        )
        const maxOrder = existingItems.reduce(
          (max, i) => Math.max(max, i.order_index ?? 0),
          existingItems.length - 1
        )
        let orderIdx = maxOrder + 1
        const toInsert: Record<string, unknown>[] = []

        for (const tmplItem of (tmplStage.items || [])) {
          if (tmplItem.type === 'exchange') {
            const sendName = `Send ${tmplItem.name}`
            const returnName = `Return ${tmplItem.name}`
            if (!existingNames.has(sendName.toLowerCase())) {
              toInsert.push({
                stage_id: acctStage.id, type: 'task', required: tmplItem.required,
                order_index: orderIdx++, task_name: sendName,
                task_assignee: 'personal', task_source: 'plan', task_done: false,
              })
            }
            if (!existingNames.has(returnName.toLowerCase())) {
              toInsert.push({
                stage_id: acctStage.id, type: 'task', required: tmplItem.required,
                order_index: orderIdx++, task_name: returnName,
                task_assignee: 'customer', task_source: 'plan', task_done: false,
              })
            }
          } else if (tmplItem.type === 'session') {
            if (existingNames.has(tmplItem.name.toLowerCase())) continue
            toInsert.push({
              stage_id: acctStage.id, type: 'session', required: tmplItem.required,
              order_index: orderIdx++, session_name: tmplItem.name, session_status: 'pending',
            })
          } else if (tmplItem.type === 'handoff') {
            if (existingNames.has(tmplItem.name.toLowerCase())) continue
            toInsert.push({
              stage_id: acctStage.id, type: 'handoff', required: tmplItem.required,
              order_index: orderIdx++, handoff_name: tmplItem.name,
            })
          } else {
            if (existingNames.has(tmplItem.name.toLowerCase())) continue
            toInsert.push({
              stage_id: acctStage.id, type: tmplItem.type, required: tmplItem.required,
              order_index: orderIdx++, task_name: tmplItem.name,
              task_assignee: tmplItem.assignee || 'personal', task_source: 'plan', task_done: false,
            })
          }
        }

        if (toInsert.length > 0) {
          const { error } = await supabase.from('items').insert(toInsert)
          if (!error) {
            accountAdded += toInsert.length
            // Update local cache so subsequent stages in the same account don't re-add
            itemsByStage.set(acctStage.id, [...existingItems, ...toInsert as any[]])
          }
        }
      }
    }

    totalAdded += accountAdded
    details.push({ account_name: account.name, items_added: accountAdded })
  }

  return NextResponse.json({ accounts_synced: accounts.length, items_added: totalAdded, details })
}
