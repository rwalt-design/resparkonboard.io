import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accountId } = await request.json()

  const { data: account } = await supabase
    .from('accounts')
    .select(`*, contacts(*), requests(*), interactions(*), milestones(*, stages(*, items(*)))`)
    .eq('id', accountId)
    .single()

  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allItems = (account.milestones || []).flatMap((m: any) =>
    m.stages.flatMap((s: any) => s.items)
  )

  const blockedCustomerTasks = allItems.filter((i: any) =>
    i.task_assignee === 'customer' && !i.task_done && i.type === 'task'
  ).map((i: any) => i.task_name)

  const pendingInternalTasks = allItems.filter((i: any) =>
    i.task_assignee !== 'customer' && !i.task_done && i.type === 'task'
  ).map((i: any) => i.task_name)

  const openRequests = (account.requests || []).filter((r: any) => r.status === 'pending' || r.status === 'sent')
    .map((r: any) => `${r.label} (${r.status})`)

  const lastInteraction = [...(account.interactions || [])]
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  const daysSince = lastInteraction
    ? Math.floor((Date.now() - new Date(lastInteraction.created_at).getTime()) / 86400000)
    : null

  const prompt = `You are generating suggestions for a CSM based on recently parsed activity for an onboarding account. The CSM will review each suggestion and either accept or dismiss it.

You will receive:
- account: the account name and contacts
- plan_tasks: the account's current plan tasks, each with a name, type, and status. Task types are: task, dependency, exchange, session, training. (Log tasks are internal and should be ignored — do not generate suggestions for them.)
- parsed_signals: structured signals representing the account's current state.

Generate suggested action items — specific things the CSM should do this week based on the account's current state.

Action items come from:
- Blocked customer tasks (dependencies the customer needs to complete)
- Pending internal tasks going stale
- Open document requests not yet returned
- Long gaps since last contact

Do NOT create an action item if an existing plan task already covers it. The plan is the CSM's source of truth.

For each suggested action item, return:
- suggestion_type: "action_item"
- action: a specific task starting with a verb (e.g., "Follow up with Sarah Chen on missing data template", "Send booking link for Post-Transaction training")
- trigger: the specific reason this matters now
- urgency: "high" | "normal"
  - "high" = customer is blocked, expressed frustration, or has a deadline mentioned

Return exactly 3 action items as a JSON array. Only return the JSON array.

---
account: ${account.name} (${account.sku})
last_contact: ${daysSince !== null ? `${daysSince} days ago` : 'never'}
blocked_customer_tasks: ${blockedCustomerTasks.join(', ') || 'none'}
pending_internal_tasks: ${pendingInternalTasks.join(', ') || 'none'}
open_document_requests: ${openRequests.join(', ') || 'none'}`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  try {
    const raw = text.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
    const suggestions = JSON.parse(raw) as { action: string; trigger: string; urgency: string }[]
    const actions = suggestions.map(s => ({
      action:   s.action,
      reason:   s.trigger,
      priority: s.urgency === 'high' ? 'high' : 'medium',
    }))
    return NextResponse.json({ actions })
  } catch {
    return NextResponse.json({ actions: [] })
  }
}
