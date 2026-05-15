import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase
    .from('connector_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'google')

  return NextResponse.json({ ok: true })
}
