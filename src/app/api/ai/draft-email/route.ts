import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { accountId, context } = body

  const { data: account } = await supabase
    .from('accounts')
    .select(`*, contacts(*), milestones(*, stages(*, items(*)))`)
    .eq('id', accountId)
    .single()

  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await supabase
    .from('org_members').select('name').eq('user_id', user.id).single()

  const repName = member?.name || user.email?.split('@')[0] || 'Your rep'

  // Build a compact account summary for the prompt
  const allItems = (account.milestones || []).flatMap((m: any) =>
    m.stages.flatMap((s: any) => s.items)
  )
  const overdue = allItems.filter((i: any) =>
    i.task_assignee === 'customer' && !i.task_done && i.type === 'task'
  )
  const primaryContact = (account.contacts || [])[0]

  const prompt = `You are a customer success manager at Respark, a software company.
Write a concise, warm follow-up email to ${primaryContact?.name || 'the customer'} at ${account.name}.

Account context:
- Product: ${account.sku}
- Open customer tasks: ${overdue.length} pending items
- Rep: ${repName}
${context ? `- Additional context: ${context}` : ''}

Write the email in plain text with a subject line on the first line (format: "Subject: ..."), then a blank line, then the body.
Keep it under 150 words. Professional but human. Do not use placeholder brackets.`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const lines = text.split('\n')
  const subjectLine = lines.find((l: string) => l.startsWith('Subject:'))
  const subject = subjectLine ? subjectLine.replace('Subject:', '').trim() : 'Following up on your onboarding'
  const bodyStart = lines.findIndex((l: string) => l.startsWith('Subject:'))
  const emailBody = lines.slice(bodyStart + 2).join('\n').trim()

  return NextResponse.json({ subject, body: emailBody })
}
