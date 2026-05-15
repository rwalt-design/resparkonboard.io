import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/signals — list pending unmatched signals scoped to the caller's org
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).single()
  if (!member) return NextResponse.json([])

  const { data } = await supabase
    .from('unmatched_signals')
    .select('*')
    .eq('org_id', member.org_id)
    .eq('dismissed', false)
    .order('signal_date', { ascending: false })
    .limit(50)

  return NextResponse.json(data || [])
}

// PATCH /api/signals — link or dismiss a signal
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, account_id, dismissed } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (dismissed !== undefined) patch.dismissed = dismissed
  if (account_id !== undefined) patch.linked_account_id = account_id

  // If linking to an account, create an interaction, dismiss the signal,
  // and queue an AI suggestion dot for that account
  if (account_id) {
    const { data: signal } = await supabase
      .from('unmatched_signals').select('*').eq('id', id).single()
    if (signal) {
      // Build a meaningful summary from the stored detail lines
      const detailLines = (signal.detail || '').split('\n')
      const fromLine    = detailLines.find((l: string) => l.startsWith('From:')) || ''
      const subjectLine = detailLines.find((l: string) => l.startsWith('Subject:')) || ''
      const summary = [fromLine, subjectLine].filter(Boolean).join(' · ') || signal.raw_text

      await supabase.from('interactions').insert({
        account_id,
        type: signal.provider === 'gmail' ? 'email' : signal.provider === 'google_calendar' ? 'call' : 'note',
        summary,
        detail: signal.detail,
      })

      // Queue AI suggestion dot for the newly linked account
      const { data: existingSuggestion } = await supabase
        .from('ai_suggestions').select('id')
        .eq('account_id', account_id).eq('status', 'pending').limit(1).single()
      if (!existingSuggestion) {
        await supabase.from('ai_suggestions').insert({
          account_id,
          type: 'sync',
          title: 'Signal linked',
          body: 'A new signal was manually linked to this account — check the AI tab for updated insights.',
          status: 'pending',
        })
      }
    }
    patch.dismissed = true
  }

  const { error } = await supabase.from('unmatched_signals').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
