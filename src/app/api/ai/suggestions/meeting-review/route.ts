import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { suggestionId, action } = await req.json() as { suggestionId: string; action: 'complete' | 'no_show' }
  if (!suggestionId || !action) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  // Load the suggestion
  const { data: suggestion } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .single()
  if (!suggestion) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { account_id, meta } = suggestion
  const eventAt = meta?.event_at ?? new Date().toISOString()
  const eventTitle = meta?.event_title ?? 'Meeting'

  if (action === 'complete') {
    // Log as a call interaction (counts as Last Contact)
    await supabase.from('interactions').insert({
      account_id,
      type: 'call',
      summary: `Meeting: ${eventTitle}`,
      detail: meta?.gcal_event_id ? `gcal:${meta.gcal_event_id}` : null,
      event_at: eventAt,
    })

    // Find and mark the best-matching pending session item complete
    const { data: sessions } = await supabase
      .from('items')
      .select('id, session_name, stage_id, stages!inner(milestone_id, milestones!inner(account_id))')
      .eq('type', 'session')
      .neq('session_status', 'complete')
      .eq('stages.milestones.account_id', account_id)

    if (sessions?.length) {
      // Pick the session whose name most closely matches the event title (case-insensitive substring)
      const titleLower = eventTitle.toLowerCase()
      const best = sessions.find(s => titleLower.includes((s.session_name || '').toLowerCase()) || (s.session_name || '').toLowerCase().includes(titleLower)) ?? sessions[0]
      await supabase.from('items').update({ session_status: 'complete', task_done: true }).eq('id', best.id)
    }
  } else {
    // No-show: log as no_show interaction (counts as Last Outreach — they attempted)
    await supabase.from('interactions').insert({
      account_id,
      type: 'no_show',
      summary: `No-show: ${eventTitle}`,
      detail: meta?.gcal_event_id ? `gcal:${meta.gcal_event_id}` : null,
      event_at: eventAt,
    })
  }

  // Dismiss the suggestion
  await supabase.from('ai_suggestions').update({ status: 'dismissed' }).eq('id', suggestionId)

  return NextResponse.json({ ok: true })
}
