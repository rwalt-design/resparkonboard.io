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

  const prompt = `You are a senior customer success manager. Based on this account's current state, suggest the top 3 specific next actions the CSM should take this week. Be concrete and actionable — not generic.

Account: ${account.name} (${account.sku})
Last contact: ${daysSince !== null ? `${daysSince} days ago` : 'never'}
Blocked customer tasks: ${blockedCustomerTasks.join(', ') || 'none'}
Pending internal tasks: ${pendingInternalTasks.join(', ') || 'none'}
Open document requests: ${openRequests.join(', ') || 'none'}

Return exactly 3 actions. Format each as a JSON object in an array:
[{"action": "...", "reason": "...", "priority": "high|medium|low"}]
Only return the JSON array, nothing else.`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  try {
    const actions = JSON.parse(text)
    return NextResponse.json({ actions })
  } catch {
    return NextResponse.json({ actions: [] })
  }
}
