import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).single()
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase
    .from('ai_suggestions')
    .update({ status: 'dismissed' })
    .eq('status', 'pending')
    .neq('type', 'sync')
    .in('account_id',
      supabase.from('accounts').select('id').eq('org_id', member.org_id)
    )

  return NextResponse.json({ ok: true })
}
