import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Slack sends a URL verification challenge when you first configure the Events API
// After that, it sends event payloads for subscribed events

export async function POST(request: NextRequest) {
  const body = await request.json()

  // Step 1: URL verification handshake
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  // Step 2: Ignore retries (Slack retries if we don't respond within 3s)
  const retryNum = request.headers.get('x-slack-retry-num')
  if (retryNum && parseInt(retryNum) > 0) {
    return NextResponse.json({ ok: true })
  }

  // Step 3: Handle message events
  if (body.event?.type === 'message' && body.event?.text && !body.event?.bot_id) {
    const text = (body.event.text as string).toLowerCase()
    const channelId = body.event.channel
    const ts = body.event.ts
    const user = body.event.user

    try {
      const supabase = await createClient()

      // Fetch all account names to check for mentions
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name')

      if (accounts) {
        for (const account of accounts) {
          if (text.includes(account.name.toLowerCase())) {
            // Log as an interaction on the account
            await supabase.from('interactions').insert({
              account_id: account.id,
              type: 'note',
              note: `Slack mention in <#${channelId}>: "${body.event.text.slice(0, 280)}"`,
              slack_ts: ts,
              slack_user: user,
            })
            break // only log once per message even if multiple accounts mentioned
          }
        }
      }
    } catch (err) {
      console.error('Slack event handler error:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
