import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SCOPES = 'search:read channels:read'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    scope: '',
    user_scope: SCOPES,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connectors/slack/callback`,
    state: user.id,
  })

  return NextResponse.redirect(
    `https://slack.com/oauth/v2/authorize?${params.toString()}`
  )
}
