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
// Two-step pipeline per account:
//   1. Prompt 1 — parse each interaction into structured signals
//   2. Prompt 2 — generate task_completion and action_item suggestions from signals
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accounts } = await req.json() as { accounts: ScanAccount[] }
  if (!accounts?.length) return NextResponse.json({ inserted: 0 })

  let inserted = 0

  for (const account of accounts) {
    if (!account.recent_interactions?.length) continue

    // ── Step 1: Source Parsing — extract signals from each interaction ─────────
    const allSignals: {
      type: string; detail: string; who: string; source: string; sentiment: string
    }[] = []

    for (const interaction of account.recent_interactions) {
      const source =
        interaction.type === 'email'    ? 'gmail'
        : interaction.type === 'call'  ? 'quo'
        : interaction.type === 'slack' ? 'slack'
        : interaction.type === 'calendar' ? 'calendar'
        : 'gmail'

      const sourceParsingPrompt = `You are processing an incoming item from one of four sources — Gmail, Google Calendar, Slack, or Quo (call transcripts and text messages) — associated with an onboarding account. Your job is to extract structured signals. Do not generate suggestions or recommendations — just extract the facts.

You will receive:
- source: "gmail" | "calendar" | "slack" | "quo"
- content: the raw content (email body, calendar event details, Slack message, or call transcript/text message)
- account: the account name, known contacts (with email addresses), and the account's email domain(s)
- date: when this item occurred

## Source-specific notes
- Gmail: Emails may include Gong call review summaries. If the email is from Gong (e.g., notifications@gong.io or similar), treat it as a call transcript — extract call-specific signals (commitments, decisions, next steps) rather than standard email signals. The backend tags the source as "gmail" regardless; you identify Gong content by the sender and formatting.
- Quo: These are phone call transcripts and SMS/text messages. Extract signals the same way as other sources. For call transcripts, focus on commitments, requests, and decisions. For text messages, treat them like short emails.

## Contact matching
The system has already matched this item to an account before sending it to you. Your job is NOT to decide whether this item belongs to the account — that's already done. However, you should identify WHICH contact is involved:
- Match the sender/author to a known contact by email address (exact match).
- If the sender's email domain matches the account domain but they are not a saved contact, flag them in the signal as a new contact: include their name and email in the detail field and add a signal of type "new_contact_detected" so the CSM can add them.
- For Gong call reviews (arriving via Gmail), match speakers to known contacts by name.
- For form submission notifications (Tally, Typeform, etc.), match the submitter name/email to a known contact.

Extract the following:

signals: An array of structured observations. For each signal, return:
  - type: one of the following:
    - "request_from_customer": The customer is asking the CSM to do something.
    - "request_from_csm": The CSM asked the customer to do something (useful for tracking dependencies).
    - "deliverable_received": The customer sent back materials, a completed template, or other deliverable. Look for these indicators:
      * Phrases like "see attached," "please find attached," "attached is," "here are the materials"
      * A non-signature file attachment (PDF, Excel, CSV, Word doc — ignore image-only attachments in email signatures)
      * A form completion notification from a tool like Tally, Typeform, JotForm, or similar (e.g., "John Park completed Pre-Work Form")
      * The customer confirming they uploaded or submitted something
    - "deliverable_sent": The CSM sent materials to the customer.
    - "meeting_occurred": A meeting or call took place with this account.
    - "training_occurred": A training session took place with this account.
    - "decision_made": A decision was confirmed (e.g., go-live date set, approach agreed on).
    - "blocker_raised": Someone surfaced a problem, concern, or obstacle.
    - "milestone_confirmed": The customer or CSM confirmed that a step, phase, or task is done.
    - "scheduling_request": Someone is asking to schedule a meeting or call.
    - "information": A fact or update worth noting but requiring no action.
    - "new_contact_detected": A person from the account's domain appeared who is not in the saved contacts list. Include their name and email in the detail field.
  - detail: one sentence describing what specifically happened. Include names, dates, and specifics from the content.
  - who: who initiated or sent this (contact name or "CSM")
  - has_attachment: true | false (for emails only — true if a real file is attached like a PDF, Excel, CSV, or Word doc. Ignore signature images, logos, and inline tracking pixels.)
  - attachment_name: the filename if has_attachment is true, otherwise omit

sentiment: "positive" | "neutral" | "negative" | "escalation_risk"

If the content has no relevance to the account (spam, unrelated CC, noise), return: { "signals": [], "sentiment": "neutral", "skip": true }

---
source: "${source}"
content: ${interaction.summary}
account: ${account.name}
date: ${new Date().toISOString().split('T')[0]}

Return JSON only: { "signals": [...], "sentiment": "..." }`

      try {
        const msg = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 500,
          messages: [{ role: 'user', content: sourceParsingPrompt }],
        })
        const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
        const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
        const parsed = JSON.parse(clean) as {
          signals?: { type: string; detail: string; who: string }[]
          sentiment?: string
          skip?: boolean
        }
        if (!parsed.skip && parsed.signals?.length) {
          for (const sig of parsed.signals) {
            allSignals.push({ ...sig, source, sentiment: parsed.sentiment || 'neutral' })
          }
        }
      } catch { /* skip on error */ }
    }

    if (!allSignals.length) continue

    // ── Step 2: Suggestion Generation — match signals to plan tasks ───────────
    const planTasks = (account.pending_items || []).map(i => ({
      id:             i.id,
      name:           i.name,
      type:           i.type,
      assignee:       i.assignee,
      status:         'pending',
      stage_id:       i.stage_id,
      milestone_name: i.milestone_name,
      stage_name:     i.stage_name,
    }))

    const suggestionGenerationPrompt = `You are generating suggestions for a CSM based on recently parsed activity for an onboarding account. The CSM will review each suggestion and either accept or dismiss it.

You will receive:
- account: the account name and contacts
- plan_tasks: the account's current plan tasks, each with a name, type, and status. Task types are: task, dependency, exchange, session, training. (Log tasks are internal and should be ignored — do not generate suggestions for them.)
- parsed_signals: an array of structured signals extracted from recent Gmail emails, calendar events, Slack messages, and Quo transcripts.

Generate two types of suggestions:

## TYPE 1: Suggested Task Completion
When a parsed signal provides evidence that an existing plan task is done, suggest marking it complete.

Matching rules by task type:
- "session" or "training": Match if a "meeting_occurred" or "training_occurred" signal references the same topic or attendees. The calendar event must have already occurred (past date), not just be scheduled.
- "exchange": Exchanges are two-sided. Match "deliverable_sent" if the CSM sent the item out (suggest marking as sent). Match "deliverable_received" if the customer returned it (suggest marking as received/complete). An exchange can generate up to two suggestions at different times.
- "dependency": Match if a "milestone_confirmed" or "deliverable_received" signal shows the customer completed what was required. This includes form submissions (e.g., a Tally notification that a pre-work form was completed), returned documents, or explicit confirmation from the customer.
- "task": Match if a "deliverable_sent", "milestone_confirmed", or related signal shows the CSM completed the action described in the task name.

Do NOT generate suggestions for "log" tasks — these are internal CSM activities and cannot be inferred from external sources.

For each suggested completion, return:
- suggestion_type: "task_completion"
- task_id: the plan task's id field
- task_name: the plan task name
- task_type: the task's type (task, dependency, exchange, session, training)
- stage_id: the stage id
- milestone_name: the milestone name
- stage_name: the stage name
- evidence: the specific signal that supports this (copy the signal's detail field)
- source: where the evidence came from (gmail, calendar, slack, quo)
- label: a short human-readable suggestion, e.g., "Mark 'Pre-Transaction Training with Acme' complete" or "Mark 'Data Template' as received from Sarah Chen"

## TYPE 2: Suggested Action Item
When a parsed signal indicates something new the CSM needs to do — and no existing plan task already covers it — suggest a new action item.

Action items come from signals like:
- "request_from_customer": The customer asked for something. → Action: fulfill the request.
- "scheduling_request": Someone asked to schedule a meeting. → Action: send booking link or schedule it.
- "blocker_raised": A problem was surfaced. → Action: address or escalate.
- "request_from_csm" with no follow-up: The CSM asked for something that hasn't been received yet. → Action: follow up.

Do NOT create an action item if an existing plan task already covers the request. The plan is the CSM's source of truth — the AI should not duplicate it.

For each suggested action item, return:
- suggestion_type: "action_item"
- action: a specific task starting with a verb (e.g., "Send booking link to Sarah Chen", "Follow up on missing data template with John Park")
- source: where the signal came from (gmail, calendar, slack, quo)
- trigger: the specific signal that prompted this suggestion (copy the signal's detail field)
- urgency: "high" | "normal"
  - "high" = customer is blocked, expressed frustration, or has a deadline mentioned

Return an array of suggestion objects. If there are no suggestions, return an empty array — do not invent suggestions to fill space.

---
account: ${account.name}${account.sku ? ` (${account.sku})` : ''}
plan_tasks: ${JSON.stringify(planTasks)}
parsed_signals: ${JSON.stringify(allSignals)}

Return JSON only: an array of suggestion objects.`

    try {
      const msg = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: suggestionGenerationPrompt }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
      const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
      const suggestions = JSON.parse(clean) as Array<Record<string, unknown>>

      // Before inserting next_action suggestions, wipe any existing pending ones for this
      // account so we never accumulate duplicates across scans. Each scan is a fresh read.
      await supabase
        .from('ai_suggestions')
        .delete()
        .eq('account_id', account.id)
        .eq('status', 'pending')
        .eq('type', 'next_action')

      for (const s of suggestions) {
        if (s.suggestion_type === 'task_completion') {
          const title = (s.label as string) || `Mark complete: ${s.task_name}`
          // Dedup by plan_item_id — skip if a non-dismissed suggestion already exists
          if (s.task_id) {
            const { data: existingById } = await supabase
              .from('ai_suggestions').select('id')
              .eq('account_id', account.id)
              .in('status', ['pending', 'confirmed'])
              .filter('meta->>plan_item_id', 'eq', s.task_id as string)
              .limit(1).single()
            if (existingById) continue
          }
          // Also skip if dismissed for this same plan item (don't resurface)
          if (s.task_id) {
            const { data: dismissed } = await supabase
              .from('ai_suggestions').select('id')
              .eq('account_id', account.id)
              .eq('status', 'dismissed')
              .filter('meta->>plan_item_id', 'eq', s.task_id as string)
              .limit(1).single()
            if (dismissed) continue
          }
          await supabase.from('ai_suggestions').insert({
            account_id: account.id,
            type:   'mark_complete',
            title,
            body:   s.evidence as string,
            status: 'pending',
            meta: {
              suggestion_category: 'completion',
              plan_item_id:   s.task_id,
              plan_item_type: s.task_type,
              plan_item_name: s.task_name,
              stage_id:       s.stage_id,
              milestone_name: s.milestone_name,
              stage_name:     s.stage_name,
              source:         s.source,
            },
          })
          inserted++

        } else if (s.suggestion_type === 'action_item') {
          const title = s.action as string
          if (!title) continue
          await supabase.from('ai_suggestions').insert({
            account_id: account.id,
            type:   'next_action',
            title,
            body:   s.trigger as string,
            status: 'pending',
            meta: {
              suggestion_category: 'next_action',
              item_type:   'task',
              item_owner:  'respark',
              item_status: 'open',
              priority:    s.urgency === 'high' ? 'high' : 'medium',
              source:      s.source,
            },
          })
          inserted++
        }
      }
    } catch { /* skip on error */ }
  }

  return NextResponse.json({ inserted })
}
