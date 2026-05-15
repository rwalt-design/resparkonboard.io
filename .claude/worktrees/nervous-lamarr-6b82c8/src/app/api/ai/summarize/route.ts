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

  const lastActivity = recentInteractions[0]
    ? new Date((account.interactions || []).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]?.created_at).toLocaleDateString()
    : 'none'

  const onboardingStart = account.created_at
    ? Math.floor((Date.now() - new Date(account.created_at).getTime()) / 86400000)
    : null

  const prompt = `Summarize this account's onboarding status for a CS team standup. Write 3-5 bullet points.

Each bullet must:
- Start with a status label: "On Track" | "At Risk" | "Blocked" | "Complete"
- Include a specific data point (e.g., "4 of 7 tasks complete," "no activity since May 1," "data template received yesterday")
- Be one sentence

Structure:
- First bullet: overall progress (X of Y tasks complete, current stage, days since onboarding started)
- Remaining bullets: the most important signals — open dependencies waiting on the customer, recent completions, tasks going stale, upcoming sessions or trainings

Do not use phrases like "progressing well" or "on track" without citing the specific evidence. If 6 of 8 tasks are done and last activity was yesterday, say that — the reader will judge whether it's going well.

If recent sync data includes call transcript insights or notable email signals, incorporate the most significant findings (key decisions, open blockers, sentiment shifts).

---
Account: ${account.name} (${account.sku})
Progress: ${done.length} of ${required.length} required tasks complete (${completionPct}%)
Days since onboarding started: ${onboardingStart ?? 'unknown'}
Last activity: ${lastActivity}
Pending customer tasks: ${customerPending.join(', ') || 'none'}
Open document requests: ${openRequests.join(', ') || 'none'}
Recent interactions: ${recentInteractions.join(' | ') || 'none logged'}`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ summary: text })
}
