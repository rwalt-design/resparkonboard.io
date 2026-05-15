import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// One-shot endpoint: clears seeded_sample_accounts from user_metadata for every
// member of the caller's org so that seedSampleAccountsIfNeeded runs again on
// their next page load.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Get all org members for this user's org
  const { data: myMember } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!myMember) return NextResponse.json({ error: 'No org found' }, { status: 404 })

  const { data: members } = await admin
    .from('org_members')
    .select('user_id')
    .eq('org_id', myMember.org_id)

  if (!members?.length) return NextResponse.json({ cleared: 0 })

  let cleared = 0
  for (const m of members) {
    const { data: authData } = await admin.auth.admin.getUserById(m.user_id)
    if (authData?.user?.user_metadata?.seeded_sample_accounts) {
      const meta = { ...authData.user.user_metadata }
      delete meta.seeded_sample_accounts
      await admin.auth.admin.updateUserById(m.user_id, { user_metadata: meta })
      cleared++
    }
  }

  return NextResponse.json({ cleared, total: members.length })
}
