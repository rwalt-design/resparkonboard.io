import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ScanAccount {
  id: string
  name: string
  pending_items: {
    id: string
    type: 'task' | 'session'
    name: string
    milestone_name: string
    stage_name: string
    stage_id: string
  }[]
  recent_interactions: {
    type: string
    summary: string
  }[]
}

// POST /api/ai/suggestions/scan
// Body: { accounts: ScanAccount[] }
// For each account that has pending plan items AND recent interactions, run Claude
// and generate structured completion suggestions → insert into ai_suggestions.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accounts } = await req.json() as { accounts: ScanAccount[] }
  if (!accounts?.length) return NextResponse.json({ inserted: 0 })

  let inserted = 0

  for (const account of accounts) {
    if (!account.pending_items?.length || !account.recent_interactions?.length) continue

    const itemsBlock = account.pending_items.map(i =>
      `  [${i.id}] ${i.type.toUpperCase()}: "${i.name}" (${i.milestone_name} › ${i.stage_name})`
    ).join('\n')

    const interactionsBlock = account.recent_interactions.map(i =>
      `  - [${i.type}] ${i.summary}`
    ).join('\n')

    const prompt = `You are analyzing an onboarding account to determine which plan items may be ready to mark as complete, based on recent activity.

Account: ${account.name}

Recent activity (last 14 days):
${interactionsBlock}

Open plan items:
${itemsBlock}

Based only on the activity above, suggest which items are likely complete. Only suggest if there is clear, specific evidence — not just general progress. Confidence must be high.

Do NOT suggest items if:
- The evidence is ambiguous or indirect
- The item requires specific output (e.g. a document) with no confirmation it was received
- The activity is a generic check-in or FYI

Return JSON only:
{
  "completions": [
    {
      "plan_item_id": "...",
      "plan_item_name": "...",
      "plan_item_type": "task or session",
      "stage_id": "...",
      "milestone_name": "...",
      "stage_name": "...",
      "reason": "one sentence why this is likely complete"
    }
  ]
}

If nothing is clearly complete, return { "completions": [] }.`

    try {
      const msg = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      })

      const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
      const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
      const { completions = [] } = JSON.parse(clean) as {
        completions: {
          plan_item_id: string
          plan_item_name: string
          plan_item_type: 'task' | 'session'
          stage_id: string
          milestone_name: string
          stage_name: string
          reason: string
        }[]
      }

      for (const c of completions) {
        // Deduplicate: skip if there's already a pending completion suggestion for this item
        const { data: existing } = await supabase
          .from('ai_suggestions')
          .select('id')
          .eq('account_id', account.id)
          .eq('status', 'pending')
          .eq('title', `Mark complete: ${c.plan_item_name}`)
          .single()
        if (existing) continue

        await supabase.from('ai_suggestions').insert({
          account_id: account.id,
          type:       'mark_complete',
          title:      `Mark complete: ${c.plan_item_name}`,
          body:       c.reason,
          status:     'pending',
          meta: {
            suggestion_category: 'completion',
            plan_item_id:   c.plan_item_id,
            plan_item_type: c.plan_item_type,
            plan_item_name: c.plan_item_name,
            stage_id:       c.stage_id,
            milestone_name: c.milestone_name,
            stage_name:     c.stage_name,
          },
        })
        inserted++
      }
    } catch { /* skip account on error */ }
  }

  return NextResponse.json({ inserted })
}
