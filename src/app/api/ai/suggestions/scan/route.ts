import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ScanAccount {
  id: string
  name: string
  sku?: string
  pending_items: {
    id: string
    type: 'task' | 'session' | 'dependency'
    name: string
    assignee?: string       // 'personal' | 'customer'
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
// For each account with pending plan items AND recent interactions:
//   1. Suggest which plan items are ready to mark complete
//   2. Suggest next actions the CSM should take (stages to Action Items)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accounts } = await req.json() as { accounts: ScanAccount[] }
  if (!accounts?.length) return NextResponse.json({ inserted: 0 })

  let inserted = 0

  for (const account of accounts) {
    if (!account.recent_interactions?.length) continue

    const interactionsBlock = account.recent_interactions.map(i =>
      `  - [${i.type}] ${i.summary}`
    ).join('\n')

    // ── 1. Plan completion suggestions ────────────────────────────────────────
    if (account.pending_items?.length) {
      const itemsBlock = account.pending_items.map(i =>
        `  [${i.id}] ${i.type.toUpperCase()}${i.assignee === 'customer' ? ' (customer)' : ''}: "${i.name}" (${i.milestone_name} › ${i.stage_name})`
      ).join('\n')

      const completionPrompt = `You are analyzing an onboarding account to determine which plan items may be ready to mark as complete, based on recent activity.

Account: ${account.name}

Recent activity (last 14 days):
${interactionsBlock}

Open plan items:
${itemsBlock}

Only suggest completions where there is clear, specific evidence in the activity. Confidence must be high.
Do NOT suggest items if the evidence is ambiguous, the item requires output with no confirmation, or the activity is a generic check-in.

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
      "reason": "one sentence"
    }
  ]
}

If nothing is clearly complete, return { "completions": [] }.`

      try {
        const msg = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 500,
          messages: [{ role: 'user', content: completionPrompt }],
        })
        const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
        const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
        const { completions = [] } = JSON.parse(clean) as {
          completions: {
            plan_item_id: string; plan_item_name: string; plan_item_type: 'task' | 'session'
            stage_id: string; milestone_name: string; stage_name: string; reason: string
          }[]
        }
        for (const c of completions) {
          const { data: existing } = await supabase
            .from('ai_suggestions').select('id')
            .eq('account_id', account.id).eq('status', 'pending')
            .eq('title', `Mark complete: ${c.plan_item_name}`).single()
          if (existing) continue
          await supabase.from('ai_suggestions').insert({
            account_id: account.id,
            type:   'mark_complete',
            title:  `Mark complete: ${c.plan_item_name}`,
            body:   c.reason,
            status: 'pending',
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
      } catch { /* skip on error */ }
    }

    // ── 2. Next-action suggestions → staged for review in Action Items ────────
    const internalItems  = account.pending_items?.filter(i => i.assignee !== 'customer' && i.type !== 'dependency') ?? []
    const customerBlocks = account.pending_items?.filter(i => i.assignee === 'customer' || i.type === 'dependency') ?? []

    const nextActionsPrompt = `You are a senior customer success manager. Based on this account's current state and recent activity, suggest the top 3 specific next actions the CSM should take this week. Be concrete and actionable — not generic.

Account: ${account.name}${account.sku ? ` (${account.sku})` : ''}

Recent activity (last 14 days):
${interactionsBlock}

Open internal tasks: ${internalItems.map(i => `"${i.name}"`).join(', ') || 'none'}
Waiting on customer: ${customerBlocks.map(i => `"${i.name}"`).join(', ') || 'none'}

Return exactly 3 actions as JSON — no more, no fewer:
[{"action": "...", "reason": "one sentence why this matters now", "priority": "high|medium|low"}]
Only return the JSON array.`

    try {
      const msg = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 400,
        messages: [{ role: 'user', content: nextActionsPrompt }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
      const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
      const actions = JSON.parse(clean) as { action: string; reason: string; priority: string }[]

      for (const a of actions) {
        if (!a.action) continue
        // Deduplicate
        const { data: existing } = await supabase
          .from('ai_suggestions').select('id')
          .eq('account_id', account.id).eq('status', 'pending')
          .eq('title', a.action).single()
        if (existing) continue

        await supabase.from('ai_suggestions').insert({
          account_id: account.id,
          type:   'next_action',
          title:  a.action,
          body:   a.reason,
          status: 'pending',
          meta: {
            suggestion_category: 'next_action',
            item_type:  'task',
            item_owner: 'respark',
            item_status: 'open',
            priority:   a.priority,
            source:     'scan',
          },
        })
        inserted++
      }
    } catch { /* skip on error */ }
  }

  return NextResponse.json({ inserted })
}
