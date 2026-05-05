import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tokenRow } = await supabase
    .from('connector_tokens')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('provider', 'slack')
    .single()

  if (!tokenRow?.access_token) {
    return NextResponse.json({ error: 'Slack not connected' }, { status: 400 })
  }

  const { data: accounts } = await supabase.from('accounts').select('id, name').order('name')
  if (!accounts?.length) return NextResponse.json({ count: 0, message: 'No accounts to search' })

  let logged = 0

  for (const account of accounts) {
    try {
      const res = await fetch(
        `https://slack.com/api/search.messages?query=${encodeURIComponent(`"${account.name}"`)}&count=10&sort=timestamp`,
        { headers: { Authorization: `Bearer ${tokenRow.access_token}` } }
      )
      const data = await res.json()

      if (!data.ok) {
        console.error('Slack search error:', data.error, 'for account', account.name)
        if (data.error === 'token_revoked' || data.error === 'invalid_auth') break
        continue
      }
      if (!data.messages?.matches?.length) continue

      for (const match of data.messages.matches) {
        if (match.username === 'bot' || match.subtype) continue

        const { data: existing } = await supabase
          .from('interactions')
          .select('id')
          .eq('account_id', account.id)
          .eq('slack_ts', match.ts)
          .single()
        if (existing) continue

        const channelName = match.channel?.name || 'unknown'
        const text = match.text?.slice(0, 500) || ''

        await supabase.from('interactions').insert({
          account_id: account.id,
          type: 'note',
          summary: `Slack mention in #${channelName}`,
          detail: text,
          slack_ts: match.ts,
        })
        logged++
      }
    } catch (e) {
      console.error('Slack sync error for account', account.name, e)
    }
  }

  return NextResponse.json({
    count: logged,
    message: logged === 0 ? 'No new mentions found' : `${logged} new mention${logged === 1 ? '' : 's'} logged`,
  })
}
