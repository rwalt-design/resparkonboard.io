import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/plan-templates/[id]/sync
// Additively pushes items from the template to accounts that use it.
// Only adds missing items — never removes or modifies existing ones.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: milestones } = await supabase
      .from('milestones')
      .select('id, name, order_index, stages(id, name, order_index, items(id, type, task_name, session_name, handoff_name, order_index))')
      .eq('account_id', account.id)
      .order('order_index')

    let accountAdded = 0

    for (const tmplMilestone of (template.structure?.milestones || [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acctMilestone = (milestones as any[] || []).find(
        (m: { name: string }) => m.name.toLowerCase() === tmplMilestone.name.toLowerCase()
      )
      if (!acctMilestone) continue

      for (const tmplStage of (tmplMilestone.stages || [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const acctStage = (acctMilestone.stages as any[] || []).find(
          (s: { name: string }) => s.name.toLowerCase() === tmplStage.name.toLowerCase()
        )
        if (!acctStage) continue

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingItems: any[] = acctStage.items || []
        const existingNames = new Set(
          existingItems.map((i) =>
            (i.task_name || i.session_name || i.handoff_name || '').toLowerCase()
          )
        )
        const maxOrder: number = existingItems.reduce(
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
          if (!error) accountAdded += toInsert.length
        }
      }
    }

    totalAdded += accountAdded
    details.push({ account_name: account.name, items_added: accountAdded })
  }

  return NextResponse.json({ accounts_synced: accounts.length, items_added: totalAdded, details })
}
