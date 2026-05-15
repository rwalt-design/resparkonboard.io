import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // user_id
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/?connector=google&status=error`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== state) {
    return NextResponse.redirect(`${appUrl}/?connector=google&status=error`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${appUrl}/api/connectors/google/callback`,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()
  if (!tokens.access_token) {
    return NextResponse.redirect(`${appUrl}/?connector=google&status=error`)
  }

  // Get their Google email
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile = await profileRes.json()

  // Get org_id
  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).single()
  if (!member) return NextResponse.redirect(`${appUrl}/?connector=google&status=error`)

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  await supabase.from('connector_tokens').upsert({
    user_id: user.id,
    org_id: member.org_id,
    provider: 'google',
    scopes: ['calendar.events', 'gmail.send', 'gmail.readonly'],
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at: expiresAt,
    google_email: profile.email || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' })

  return NextResponse.redirect(`${appUrl}/?connector=google&status=connected`)
}
