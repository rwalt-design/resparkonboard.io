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
  const required = allItems.filter((i: any) => i.required)
  const done = required.filter((i: any) => i.task_done || i.session_status === 'complete')
  const completionPct = required.length ? Math.round((done.length / required.length) * 100) : 0

  const customerPending = allItems.filter((i: any) =>
    i.task_assignee === 'customer' && !i.task_done && i.type === 'task'
  ).map((i: any) => i.task_name)

  const recentInteractions = [...(account.interactions || [])]
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((i: any) => `${i.type} (${new Date(i.created_at).toLocaleDateString()}): ${i.summary}${i.detail ? ' — ' + i.detail.slice(0, 120) : ''}`)

  const openRequests = (account.requests || []).filter((r: any) => r.status !== 'complete')
    .map((r: any) => `${r.label} [${r.status}]`)

  const prompt = `You are a customer success manager reviewing an account.
Summarize the current state of this onboarding in 3-5 bullet points. Be direct and specific — what's going well, what's at risk, what needs attention. Write for a CS team standup.

Account: ${account.name} (${account.sku})
Onboarding progress: ${completionPct}%
Pending customer tasks: ${customerPending.join(', ') || 'none'}
Open document requests: ${openRequests.join(', ') || 'none'}
Recent interactions: ${recentInteractions.join(' | ') || 'none logged'}

Format as 3-5 bullet points starting with •. No header needed.`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ summary: text })
}
