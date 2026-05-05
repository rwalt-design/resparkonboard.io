import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { accounts } = await request.json() as { accounts: any[] }
  if (!accounts?.length) return NextResponse.json({ summaries: [] })

  const now = Date.now()
  const weekMs = 7 * 24 * 60 * 60 * 1000

  // Build a compact snapshot for each account that had activity this week
  const activeAccounts = accounts
    .map((a: any) => {
      const recent = (a.interactions || []).filter((i: any) =>
        now - new Date(i.created_at).getTime() <= weekMs
      )
      const newTasks = (a.open_tasks || []).filter((t: any) =>
        now - new Date(t.created_at || 0).getTime() <= weekMs
      )
      return { account: a, recent, newTasks }
    })
    .filter(({ recent, newTasks }) => recent.length > 0 || newTasks.length > 0)

  if (!activeAccounts.length) return NextResponse.json({ summaries: [] })

  // Build a single prompt covering all active accounts (cheaper than N calls)
  const accountBlocks = activeAccounts.map(({ account, recent, newTasks }) => {
    const lines = recent.map((i: any) =>
      `  - [${i.type}] ${i.summary}${i.detail ? ': ' + i.detail.slice(0, 80) : ''}`
    )
    const taskLines = newTasks.map((t: any) => `  - Task: ${t.name} (${t.assignee})`)
    return [
      `Account: ${account.name}`,
      ...lines,
      ...taskLines,
    ].join('\n')
  }).join('\n\n')

  const prompt = `You are a customer success manager writing a quick weekly standup update.
For each account below, write exactly 1-2 sentences summarizing what happened this week.
Be specific and plain — no fluff, no "it's important to note that", just the facts.
If there was a call or meeting, mention it. If there were emails or requests, mention those.
If tasks were created, mention what kind.

${accountBlocks}

Respond as a JSON array with one object per account, in the same order:
[{"account_id": "...", "account_name": "...", "summary": "..."}]

Use the exact account names provided. Only return the JSON array.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
    const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any[] = JSON.parse(clean)

    // Match back by name since we didn't pass IDs in the prompt
    const summaries = parsed.map((item: any) => {
      const match = activeAccounts.find(({ account }) =>
        account.name === item.account_name
      )
      return {
        account_id: match?.account.id || item.account_id || '',
        account_name: item.account_name,
        summary: item.summary,
      }
    })

    return NextResponse.json({ summaries })
  } catch (e) {
    console.error('Weekly summary AI error:', e)
    return NextResponse.json({ summaries: [] })
  }
}
