import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/?connector=slack&status=error`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== state) {
    return NextResponse.redirect(`${appUrl}/?connector=slack&status=error`)
  }

  // Exchange code for token
  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      redirect_uri: `${appUrl}/api/connectors/slack/callback`,
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.ok || !tokens.authed_user?.access_token) {
    console.error('Slack token error:', tokens.error)
    return NextResponse.redirect(`${appUrl}/?connector=slack&status=error`)
  }

  const userToken = tokens.authed_user.access_token
  const slackUserId = tokens.authed_user.id

  // Get the user's Slack display name
  const profileRes = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  })
  const profile = await profileRes.json()
  const slackEmail = profile.user?.profile?.email || profile.user?.name || slackUserId

  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).single()
  if (!member) return NextResponse.redirect(`${appUrl}/?connector=slack&status=error`)

  await supabase.from('connector_tokens').upsert({
    user_id: user.id,
    org_id: member.org_id,
    provider: 'slack',
    scopes: ['search:read', 'channels:read'],
    access_token: userToken,
    refresh_token: null,
    expires_at: null,
    google_email: slackEmail,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' })

  return NextResponse.redirect(`${appUrl}/?connector=slack&status=connected`)
}
