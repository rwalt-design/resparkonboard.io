import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/ai/suggestions — all pending suggestions for the org across all accounts
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).single()
  if (!member) return NextResponse.json([])

  // Fetch pending suggestions joined with account name
  const { data: suggestions } = await supabase
    .from('ai_suggestions')
    .select('*, accounts!inner(name, org_id)')
    .eq('accounts.org_id', member.org_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)

  const result = (suggestions || []).map((s: {
    accounts?: { name?: string }
    [key: string]: unknown
  }) => ({
    ...s,
    account_name: s.accounts && typeof s.accounts === 'object' && 'name' in s.accounts
      ? (s.accounts as { name: string }).name
      : undefined,
    accounts: undefined,
  }))

  return NextResponse.json(result)
}

// PATCH /api/ai/suggestions — accept or dismiss a suggestion
// body: { id: string, action: 'accept' | 'dismiss' }
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, action } = await req.json()
  if (!id || !action) return NextResponse.json({ error: 'Missing id or action' }, { status: 400 })

  if (action === 'dismiss') {
    await supabase.from('ai_suggestions').update({ status: 'dismissed' }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'undo') {
    await supabase.from('ai_suggestions').update({ status: 'pending' }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (action !== 'accept') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  // Fetch the suggestion to know what to do
  const { data: suggestion } = await supabase
    .from('ai_suggestions').select('*').eq('id', id).single()
  if (!suggestion) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const meta = (suggestion.meta || {}) as Record<string, unknown>
  const category = meta.suggestion_category as string | undefined

  if (category === 'extracted' || category === 'next_action') {
    // Create an open_task from the staged suggestion
    const isDep = suggestion.type === 'dependency' || (meta.item_type as string) === 'dependency'
    const { error } = await supabase.from('open_tasks').insert({
      account_id: suggestion.account_id,
      name:       suggestion.title,
      assignee:   isDep ? 'customer' : 'personal',
      source:     (meta.source as string) || (category === 'next_action' ? 'manual' : 'email'),
      done:       false,
      notes:      (meta.why_important as string) || suggestion.body || null,
      item_type:   isDep ? 'dependency' : 'task',
      item_owner:  isDep ? 'customer' : 'respark',
      item_status: isDep ? 'waiting' : 'open',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  } else if (category === 'completion') {
    const planItemType = meta.plan_item_type as string
    if (planItemType === 'task') {
      await supabase.from('items').update({ task_done: true }).eq('id', meta.plan_item_id as string)
    } else if (planItemType === 'session') {
      await supabase.from('items').update({ session_status: 'complete' }).eq('id', meta.plan_item_id as string)
    } else if (planItemType === 'stage') {
      await supabase.from('stages').update({ status: 'complete' }).eq('id', meta.stage_id as string)
      // Unlock the next stage if there is one
      const { data: currentStage } = await supabase
        .from('stages').select('milestone_id, order_index').eq('id', meta.stage_id as string).single()
      if (currentStage) {
        const { data: nextStage } = await supabase
          .from('stages')
          .select('id')
          .eq('milestone_id', currentStage.milestone_id)
          .eq('order_index', currentStage.order_index + 1)
          .single()
        if (nextStage) {
          await supabase.from('stages').update({ status: 'active' }).eq('id', nextStage.id)
        }
      }
    }
  }

  // Mark suggestion as confirmed
  await supabase.from('ai_suggestions').update({ status: 'confirmed' }).eq('id', id)
  return NextResponse.json({ ok: true })
}
