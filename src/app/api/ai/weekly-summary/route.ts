import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SKU_LABEL: Record<string, string> = {
  essentials:          'Essentials',
  pro:                 'Pro',
  dispatch:            'Dispatch',
  rail:                'Rail',
  exports:             'Exports',
  uptimepm_core:       'UptimePM Core',
  uptimepm_pro:        'UptimePM Pro',
  uptimepm_enterprise: 'UptimePM Enterprise',
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { accounts } = await request.json() as { accounts: any[] }
  if (!accounts?.length) return NextResponse.json({ summaries: [] })

  const now = Date.now()
  const weekMs = 7 * 24 * 60 * 60 * 1000

  // Only accounts that had interactions or new tasks this week
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const active = accounts.filter((a: any) =>
    (a.interactions || []).some((i: any) => now - new Date(i.created_at).getTime() <= weekMs) ||
    (a.open_tasks   || []).some((t: any) => now - new Date(t.created_at || 0).getTime() <= weekMs)
  )
  if (!active.length) return NextResponse.json({ summaries: [] })

  // ── Build structured fields from account data ─────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const structured = active.map((a: any) => {
    const goLiveDate = a.go_live_date ? new Date(a.go_live_date + 'T00:00:00') : null
    const rawDaysToLive = goLiveDate ? Math.round((goLiveDate.getTime() - now) / 86400000) : null
    const paused = a.paused_days ?? 0
    const daysToLive = rawDaysToLive != null ? rawDaysToLive + paused : null

    return {
      account_id:         a.id,
      account_name:       a.name,
      sku:                SKU_LABEL[a.sku] ?? a.sku,
      current_stage:      a.currentStage  ?? null,
      completion_pct:     a.completionPct ?? null,
      days_since_contact: a.daysSinceContact === 999 ? null : (a.daysSinceContact ?? null),
      days_since_outreach:a.daysSinceOutreach === 999 ? null : (a.daysSinceOutreach ?? null),
      days_to_live:       daysToLive,
    }
  })

  // ── Build activity blocks for Claude ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activityBlocks = active.map((a: any) => {
    const recent = (a.interactions || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (i: any) => now - new Date(i.created_at).getTime() <= weekMs
    )
    // Only email and meetings/calendar — skip Slack and tasks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relevant = recent.filter((i: any) =>
      i.type === 'email' || i.type === 'meeting' || i.type === 'calendar'
    )
    const s = structured.find(s => s.account_id === a.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = relevant.map((i: any) =>
      `  [${i.type}] ${i.summary}${i.detail ? ' — ' + i.detail.slice(0, 120) : ''}`
    )
    const header = `Account: ${a.name}${s?.current_stage ? ` (current stage: ${s.current_stage})` : ''}`
    return [header, ...lines].join('\n')
  }).join('\n\n')

  const prompt = `You are writing a brief weekly status note for an onboarding team that missed their weekly sync.
For each account answer only these three questions if the data supports it:
1. Did they move to a new stage this week? (only mention if you can infer a recent change — if you can't tell, skip it)
2. Was a meeting or session scheduled or held this week?
3. Did the client send any emails this week?

Rules:
- 1-2 sentences max per account. Be direct and factual.
- Do not mention Slack. Do not mention internal tasks.
- If none of the three things happened, say "No meetings or emails this week."
- No filler phrases like "It appears" or "Based on the data."

${activityBlocks}

Return a JSON array in the same order:
[{"account_name": "...", "summary": "..."}]

Only return the JSON array.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
    const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any[] = JSON.parse(clean)

    const summaries = structured.map(s => {
      const aiRow = parsed.find(p => p.account_name === s.account_name)
      return { ...s, summary: aiRow?.summary ?? '' }
    })

    return NextResponse.json({ summaries })
  } catch (e) {
    console.error('Weekly summary AI error:', e)
    // Return structured data without summaries rather than nothing
    return NextResponse.json({ summaries: structured.map(s => ({ ...s, summary: '' })) })
  }
}
