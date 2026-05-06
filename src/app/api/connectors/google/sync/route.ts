import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function refreshGoogleToken(refreshTok: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshTok,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  return data.access_token || null
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tokenRow } = await supabase
    .from('connector_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .single()

  if (!tokenRow) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })

  // Refresh if expired or expiring soon
  let accessToken = tokenRow.access_token
  if (tokenRow.refresh_token) {
    const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0
    if (!expiresAt || Date.now() + 300_000 > expiresAt) {
      const newToken = await refreshGoogleToken(tokenRow.refresh_token)
      if (newToken) {
        accessToken = newToken
        await supabase.from('connector_tokens').update({
          access_token: newToken,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id).eq('provider', 'google')
      }
    }
  }

  if (!accessToken) return NextResponse.json({ error: 'Could not obtain access token' }, { status: 400 })

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, email, account_id')
    .not('email', 'is', null)

  if (!contacts?.length) return NextResponse.json({ count: 0, message: 'No contacts with emails' })

  let logged = 0

  for (const contact of contacts) {
    if (!contact.email) continue
    try {
      const query = encodeURIComponent(`from:${contact.email} newer_than:14d`)
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()
      if (data.error) {
        console.error('Gmail error:', data.error)
        return NextResponse.json({ error: `Gmail error: ${data.error.message}` }, { status: 400 })
      }
      if (!data.messages?.length) continue

      for (const msg of data.messages) {
        const { data: existing } = await supabase
          .from('interactions')
          .select('id')
          .eq('account_id', contact.account_id)
          .eq('gmail_message_id', msg.id)
          .single()
        if (existing) continue

        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const msgData = await msgRes.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subject = msgData.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'No subject'
        const eventAt = msgData.internalDate
          ? new Date(parseInt(msgData.internalDate)).toISOString()
          : null

        await supabase.from('interactions').insert({
          account_id: contact.account_id,
          type: 'email',
          summary: `Email from ${contact.name}: ${subject}`,
          detail: null,
          gmail_message_id: msg.id,
          event_at: eventAt,
        })
        logged++
      }
    } catch (e) {
      console.error('Gmail sync error for', contact.email, e)
    }
  }

  return NextResponse.json({
    count: logged,
    message: logged === 0 ? 'No new emails found' : `${logged} new email${logged === 1 ? '' : 's'} logged`,
  })
}
