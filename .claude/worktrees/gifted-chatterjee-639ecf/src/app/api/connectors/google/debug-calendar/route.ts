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

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tokenRow } = await supabase
    .from('connector_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (!tokenRow) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })

  let accessToken = tokenRow.access_token
  if (tokenRow.refresh_token) {
    const newToken = await refreshGoogleToken(tokenRow.refresh_token)
    if (newToken) accessToken = newToken
  }

  const lookback = new Date(Date.now() - 14 * 86400 * 1000).toISOString()
  const now = new Date().toISOString()

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(lookback)}&timeMax=${encodeURIComponent(now)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()

  if (data.error) return NextResponse.json({ error: data.error }, { status: 400 })

  const { data: accounts } = await supabase.from('accounts').select('id, name')
  const { data: contacts } = await supabase.from('contacts').select('id, name, email, account_id').not('email', 'is', null)
  const contactEmailMap = new Map((contacts || []).filter(c => c.email).map(c => [c.email!.toLowerCase(), c]))

  const CAL_STOP_WORDS = new Set(['the', 'and', 'inc', 'llc', 'ltd', 'co', 'corp', 'of', 'a', 'an'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = (data.items || []).map((event: any) => {
    const attendeeEmails = (event.attendees || []).map((a: any) => (a.email || '').toLowerCase())
    let matchedBy = null
    let matchedAccount = null

    for (const email of attendeeEmails) {
      const contact = contactEmailMap.get(email)
      if (contact) {
        matchedBy = `attendee: ${email}`
        matchedAccount = (accounts || []).find(a => a.id === contact.account_id)?.name
        break
      }
    }

    if (!matchedAccount) {
      const titleLower = (event.summary || '').toLowerCase()
      const acct = (accounts || []).find(a => {
        const words = a.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !CAL_STOP_WORDS.has(w))
        return words.some((w: string) => titleLower.includes(w))
      })
      if (acct) {
        matchedBy = 'title'
        matchedAccount = acct.name
      }
    }

    return {
      title: event.summary,
      status: event.status,
      start: event.start?.dateTime || event.start?.date,
      attendees: attendeeEmails,
      matchedAccount,
      matchedBy,
    }
  })

  return NextResponse.json({ eventCount: events.length, events })
}
