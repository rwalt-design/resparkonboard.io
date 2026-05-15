import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Token refresh ──────────────────────────────────────────────────────────────

async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  return data.access_token || null
}

// ── Extract readable text from a Gmail message payload ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEmailBody(payload: any): string {
  if (!payload) return ''

  // Decode a single body part
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decode = (part: any): string => {
    if (!part?.body?.data) return ''
    try {
      return Buffer.from(part.body.data, 'base64').toString('utf-8')
    } catch {
      return ''
    }
  }

  // Prefer text/plain, fall back to text/html stripped of tags
  if (payload.mimeType === 'text/plain') return decode(payload)
  if (payload.mimeType === 'text/html') return decode(payload).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  // Multipart — walk parts
  if (payload.parts?.length) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain) return decode(plain)
    const html = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (html) return decode(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const text = extractEmailBody(part)
      if (text) return text
    }
  }
  return ''
}

// ── AI task extraction ─────────────────────────────────────────────────────────

interface ExtractedItem {
  type:         'task' | 'dependency'
  owner:        'respark' | 'customer'
  title:        string
  source:       string
  why_important: string
  status:       'open' | 'waiting' | 'done'
}

interface ExtractionResult {
  items: ExtractedItem[]
}

const EXTRACTION_SYSTEM = `You extract structured onboarding work items for ReSpark from email threads.

There are two kinds of items:
1. "task": something Ryan/ReSpark must do.
2. "dependency": something the customer has agreed to do that ReSpark is waiting on, and that clearly blocks onboarding progress.

Only create a "dependency" item if:
- The message contains an explicit or strongly implied commitment by the customer, AND
- ReSpark cannot move forward on some onboarding step until this is done.

Positive signals to look for:
- For tasks (ReSpark): "can you…", "please…", "we need you to…", "could you…", "once you…", "next step is…", "action item", "you'll handle…"
- For dependencies (customer): "we'll fill out…", "we will test…", "I'll send over…", "we'll complete…", "we will send…"

Do NOT create items for:
- Vague expectations: "keep us posted", "let us know if you have questions"
- Pure FYI updates, greetings, signatures, or legal footers
- Automated notifications that require no human action
- Quoted email history below "On [date], [name] wrote:" unless there is new content above it
- Generic confirmations with no new commitment

Return at most 5 of the highest-impact items. Choose those that most directly move the account toward go-live.`

async function extractTasksFromText(
  text: string,
  accountName: string,
  sourceLabel: string
): Promise<ExtractionResult> {
  if (!text.trim() || text.length < 30) return { items: [] }

  // Truncate to avoid huge token usage
  const truncated = text.slice(0, 3000)

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 700,
      system: EXTRACTION_SYSTEM,
      messages: [{
        role: 'user',
        content: `Account: ${accountName}
Source: ${sourceLabel}

Content:
${truncated}

Respond only with JSON matching this schema. Do not include any explanations or extra text.
{
  "items": [
    {
      "type": "task",
      "owner": "respark",
      "title": "verb-first short title",
      "source": "${sourceLabel}",
      "why_important": "one sentence",
      "status": "open"
    }
  ]
}`,
      }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
    return JSON.parse(clean) as ExtractionResult
  } catch {
    return { items: [] }
  }
}

// ── Stage extracted items as ai_suggestions (pending review) ──────────────────
// Instead of writing directly to open_tasks, we stage every AI-extracted item as a
// pending ai_suggestion so the user can review, accept, or dismiss it first.

async function stageExtractedItems(
  supabase: SupabaseClient,
  accountId: string,
  items: ExtractedItem[],
  source: string,
  sourceLabel: string,
  sourceMessageId?: string,
): Promise<number> {
  // If we have a message ID, skip entirely if we've already extracted from this message.
  // This prevents re-processing the same email/Slack message across syncs even if
  // the AI generates slightly different task titles each time.
  if (sourceMessageId) {
    const { data: alreadyProcessed } = await supabase
      .from('ai_suggestions')
      .select('id')
      .eq('account_id', accountId)
      .eq('meta->>source_message_id', sourceMessageId)
      .limit(1)
      .single()
    if (alreadyProcessed) return 0
  }

  let count = 0
  for (const item of items) {
    if (item.status === 'done') continue

    await supabase.from('ai_suggestions').insert({
      account_id: accountId,
      type:       item.type,
      title:      item.title,
      body:       item.why_important || null,
      status:     'pending',
      meta: {
        suggestion_category: 'extracted',
        item_type:    item.type,
        item_owner:   item.owner,
        item_status:  item.type === 'dependency' ? 'waiting' : 'open',
        source,
        source_label: sourceLabel,
        why_important: item.why_important,
        source_message_id: sourceMessageId,
      },
    })
    count++
  }
  return count
}

// ── Main sync handler ──────────────────────────────────────────────────────────

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).single()
  const orgId = member?.org_id

  const { data: tokens } = await supabase
    .from('connector_tokens')
    .select('provider, access_token, refresh_token, expires_at, last_synced_at')
    .eq('user_id', user.id)

  if (!tokens?.length) return NextResponse.json({ count: 0, message: 'No connectors connected' })

  const { data: accounts } = await supabase.from('accounts').select('id, name').order('name')
  const { data: contacts } = await supabase
    .from('contacts').select('id, name, email, account_id').not('email', 'is', null)

  const contactEmailMap = new Map<string, { name: string; account_id: string }>()
  for (const c of contacts || []) {
    if (c.email) contactEmailMap.set(c.email.toLowerCase(), { name: c.name, account_id: c.account_id })
  }

  // Track account IDs that got new content so we can pull account names for AI
  const accountNameMap = new Map((accounts || []).map(a => [a.id, a.name]))

  // ── Preload already-seen source IDs ───────────────────────────────────────────
  // Load once at the start so we never query per-message and never re-process
  // anything we've already logged — interactions OR AI extractions.
  const { data: existingInteractions } = await supabase
    .from('interactions')
    .select('gmail_message_id, slack_ts, detail, account_id')
    .or('gmail_message_id.not.is.null,slack_ts.not.is.null,detail.like.gcal:%')

  const { data: existingSignals } = await supabase
    .from('unmatched_signals')
    .select('raw_text')
    .like('raw_text', 'gmail:%')

  const seenGmailIds   = new Set<string>()
  const seenSlackKeys  = new Set<string>()  // `${account_id}:${slack_ts}`
  const seenGcalIds    = new Set<string>()  // `gcal:${event_id}`

  for (const row of existingInteractions || []) {
    if (row.gmail_message_id) seenGmailIds.add(row.gmail_message_id)
    if (row.slack_ts && row.account_id) seenSlackKeys.add(`${row.account_id}:${row.slack_ts}`)
    if (row.detail?.startsWith('gcal:')) seenGcalIds.add(row.detail)
  }
  // Also treat previously-stored unmatched signals as seen
  for (const row of existingSignals || []) {
    const gmailId = row.raw_text?.replace('gmail:', '')
    if (gmailId) seenGmailIds.add(gmailId)
  }

  // Set of account IDs that received new interactions this sync run
  const touchedAccountIds = new Set<string>()

  let emailCount = 0
  let taskCount = 0
  let calCount = 0
  let unmatched = 0
  const errors: string[] = []

  for (let token of tokens) {

    // ── Refresh Google token ───────────────────────────────────────────────────
    if (token.provider === 'google' && token.refresh_token) {
      const expiresAt = token.expires_at ? new Date(token.expires_at).getTime() : 0
      if (!expiresAt || Date.now() + 300_000 > expiresAt) {
        const newToken = await refreshGoogleToken(token.refresh_token)
        if (newToken) {
          await supabase.from('connector_tokens').update({
            access_token: newToken,
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('user_id', user.id).eq('provider', 'google')
          token = { ...token, access_token: newToken }
        }
      }
    }

    // ── Gmail — known contacts ─────────────────────────────────────────────────
    if (token.provider === 'google' && token.access_token) {
      // Build date filter: use last sync time if available, otherwise 14 days ago
      const sinceDate = token.last_synced_at
        ? new Date(token.last_synced_at)
        : new Date(Date.now() - 14 * 86400 * 1000)
      const afterFilter = `after:${sinceDate.getFullYear()}/${String(sinceDate.getMonth() + 1).padStart(2, '0')}/${String(sinceDate.getDate()).padStart(2, '0')}`

      for (const contact of contacts || []) {
        if (!contact.email) continue
        const accountName = accountNameMap.get(contact.account_id) || 'Unknown'
        try {
          const q = encodeURIComponent(`from:${contact.email} ${afterFilter}`)
          const listRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=10`,
            { headers: { Authorization: `Bearer ${token.access_token}` } }
          )
          const listData = await listRes.json()
          if (listData.error) { errors.push(`Gmail: ${listData.error.message}`); break }
          if (!listData.messages?.length) continue

          for (const msg of listData.messages) {
            if (seenGmailIds.has(msg.id)) continue

            // Fetch full message for body + subject
            const fullRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
              { headers: { Authorization: `Bearer ${token.access_token}` } }
            )
            const fullData = await fullRes.json()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const headers: any[] = fullData.payload?.headers || []
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No subject'
            const body = extractEmailBody(fullData.payload)
            // Use internalDate (ms since epoch) for the actual send time
            const emailDate = fullData.internalDate
              ? new Date(parseInt(fullData.internalDate)).toISOString()
              : null

            // Log interaction
            await supabase.from('interactions').insert({
              account_id: contact.account_id,
              type: 'email',
              summary: `Email from ${contact.name}: ${subject}`,
              detail: body.slice(0, 500) || null,
              gmail_message_id: msg.id,
              event_at: emailDate,
            })
            seenGmailIds.add(msg.id)
            emailCount++
            touchedAccountIds.add(contact.account_id)

            // AI task extraction → stage as suggestions for review
            if (body.length > 30) {
              const extracted = await extractTasksFromText(
                `Subject: ${subject}\n\n${body}`,
                accountName,
                subject || 'email'
              )
              taskCount += await stageExtractedItems(supabase, contact.account_id, extracted.items, 'email', subject || 'email', `gmail:${msg.id}`)
            }
          }

          // Outbound: emails YOU sent to this contact → counts as Last Outreach
          const sentQ = encodeURIComponent(`in:sent to:${contact.email} ${afterFilter}`)
          const sentRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${sentQ}&maxResults=5`,
            { headers: { Authorization: `Bearer ${token.access_token}` } }
          )
          const sentData = await sentRes.json()
          if (sentData.messages?.length) {
            for (const msg of sentData.messages) {
              if (seenGmailIds.has(msg.id)) continue

              const fullRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
                { headers: { Authorization: `Bearer ${token.access_token}` } }
              )
              const fullData = await fullRes.json()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const headers: any[] = fullData.payload?.headers || []
              const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No subject'
              const emailDate = fullData.internalDate
                ? new Date(parseInt(fullData.internalDate)).toISOString()
                : null

              await supabase.from('interactions').insert({
                account_id: contact.account_id,
                type: 'email_sent',
                summary: `Email to ${contact.name}: ${subject}`,
                gmail_message_id: msg.id,
                event_at: emailDate,
              })
              seenGmailIds.add(msg.id)
              emailCount++
              touchedAccountIds.add(contact.account_id)
            }
          }
        } catch (e) {
          console.error('Gmail sync error for contact', contact.email, e)
        }
      }

      // ── Gmail — unknown senders (unmatched signals) ──────────────────────────
      // Known provider domains: emails from these are always parsed for tasks,
      // even if the sender address includes "noreply" / "no-reply"
      const KNOWN_PROVIDER_DOMAINS = ['gong.io']

      if (orgId) {
        try {
          const inboxRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(afterFilter)}&maxResults=50`,
            { headers: { Authorization: `Bearer ${token.access_token}` } }
          )
          const inboxData = await inboxRes.json()
          if (!inboxData.error && inboxData.messages?.length) {
            for (const msg of inboxData.messages) {
              try {
                const msgRes = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject,From`,
                  { headers: { Authorization: `Bearer ${token.access_token}` } }
                )
                const msgData = await msgRes.json()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const hdrs: any[] = msgData.payload?.headers || []
                const from = hdrs.find((h: any) => h.name === 'From')?.value || ''
                const subject = hdrs.find((h: any) => h.name === 'Subject')?.value || 'No subject'
                const emailMatch = from.match(/<([^>]+)>/) || [null, from.trim()]
                const fromEmail = emailMatch[1]?.toLowerCase() || ''
                const fromDomain = fromEmail.split('@')[1] || ''
                const isKnownProvider = KNOWN_PROVIDER_DOMAINS.some(d => fromDomain === d || fromDomain.endsWith(`.${d}`))

                if (!fromEmail || contactEmailMap.has(fromEmail)) continue
                // Skip no-reply addresses UNLESS they're from a known provider like Gong
                if (!isKnownProvider && (fromEmail.includes('noreply') || fromEmail.includes('no-reply'))) continue
                // Skip if already processed (interaction or unmatched signal)
                if (seenGmailIds.has(msg.id)) continue

                const subjectLower = subject.toLowerCase()
                const STOP_WORDS = ['the', 'and', 'inc', 'llc', 'ltd', 'co', 'corp', 'of', 'a', 'an']
                const matchedAccount = (accounts || []).find(a => {
                  const words = a.name.toLowerCase().split(/\s+/).filter(
                    (w: string) => w.length > 2 && !STOP_WORDS.includes(w)
                  )
                  return words.some((w: string) => subjectLower.includes(w) || fromDomain.includes(w))
                })

                const senderName = from.replace(/<[^>]+>/, '').trim() || fromEmail

                if (matchedAccount) {
                  {
                    const autoEmailDate = msgData.internalDate
                      ? new Date(parseInt(msgData.internalDate)).toISOString()
                      : null
                    await supabase.from('interactions').insert({
                      account_id: matchedAccount.id,
                      type: 'email',
                      summary: `Email from ${senderName}: ${subject}`,
                      detail: 'Sender not in contacts — auto-matched by subject',
                      gmail_message_id: msg.id,
                      event_at: autoEmailDate,
                    })
                    seenGmailIds.add(msg.id)
                    emailCount++
                    touchedAccountIds.add(matchedAccount.id)

                    // For known providers (e.g. Gong), fetch full body and extract tasks
                    if (isKnownProvider) {
                      try {
                        const fullRes = await fetch(
                          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
                          { headers: { Authorization: `Bearer ${token.access_token}` } }
                        )
                        const fullData = await fullRes.json()
                        const body = extractEmailBody(fullData.payload)
                        if (body.length > 30) {
                          const extracted = await extractTasksFromText(
                            `Subject: ${subject}\n\n${body}`,
                            matchedAccount.name,
                            `${fromDomain} email`
                          )
                          taskCount += await stageExtractedItems(supabase, matchedAccount.id, extracted.items, 'email', subject || `${fromDomain} email`, `gmail:${msg.id}`)
                        }
                      } catch { /* skip full fetch */ }
                    }
                  }
                } else if (isKnownProvider) {
                  // Known provider but no account match — save as unmatched signal
                  try {
                    const fullRes = await fetch(
                      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
                      { headers: { Authorization: `Bearer ${token.access_token}` } }
                    )
                    const fullData = await fullRes.json()
                    const body = extractEmailBody(fullData.payload)
                    await supabase.from('unmatched_signals').insert({
                      org_id: orgId,
                      provider: 'gmail',
                      raw_text: `gmail:${msg.id}`,
                      detail: `From: ${senderName} <${fromEmail}>\nSubject: ${subject}\n\n${body.slice(0, 800)}`,
                      signal_date: new Date().toISOString(),
                    })
                  } catch {
                    await supabase.from('unmatched_signals').insert({
                      org_id: orgId,
                      provider: 'gmail',
                      raw_text: `gmail:${msg.id}`,
                      detail: `From: ${senderName} <${fromEmail}>\nSubject: ${subject}`,
                      signal_date: new Date().toISOString(),
                    })
                  }
                  seenGmailIds.add(msg.id)
                  unmatched++
                } else {
                  await supabase.from('unmatched_signals').insert({
                    org_id: orgId,
                    provider: 'gmail',
                    raw_text: `gmail:${msg.id}`,
                    detail: `From: ${senderName} <${fromEmail}>\nSubject: ${subject}`,
                    signal_date: new Date().toISOString(),
                  })
                  seenGmailIds.add(msg.id)
                  unmatched++
                }
              } catch { /* skip */ }
            }
          }
        } catch (e) {
          console.error('Gmail inbox scan error', e)
        }
      }

      // ── Google Calendar — past events ────────────────────────────────────────
      // Always look back 14 days regardless of last_synced_at — dedup on gcal event ID
      // prevents double-logging, and using sinceDate would skip meetings that predated
      // the last email sync run.
      try {
        const now = new Date().toISOString()
        const calLookback = new Date(Date.now() - 14 * 86400 * 1000).toISOString()
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
          `timeMin=${encodeURIComponent(calLookback)}&timeMax=${encodeURIComponent(now)}` +
          `&singleEvents=true&orderBy=startTime&maxResults=50`,
          { headers: { Authorization: `Bearer ${token.access_token}` } }
        )
        const calData = await calRes.json()

        if (!calData.error && calData.items?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const event of calData.items as any[]) {
            if (event.status === 'cancelled') continue

            // Match attendees to known contact emails → find account
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const attendeeEmails: string[] = (event.attendees || []).map((a: any) => (a.email || '').toLowerCase())
            let matchedAccountId: string | null = null
            let matchedAccountName = ''
            for (const email of attendeeEmails) {
              const contact = contactEmailMap.get(email)
              if (contact) {
                matchedAccountId = contact.account_id
                matchedAccountName = accountNameMap.get(contact.account_id) || ''
                break
              }
            }

            // Fallback: match by account name appearing in event title.
            // Industry-generic words are excluded so e.g. "recycling" in one
            // account name doesn't match a different account's meeting title.
            if (!matchedAccountId) {
              const titleLower = (event.summary || '').toLowerCase()
              const CAL_STOP_WORDS = new Set([
                'the', 'and', 'inc', 'llc', 'ltd', 'co', 'corp', 'of', 'a', 'an',
                'recycling', 'recycle', 'metals', 'metal', 'scrap', 'iron', 'steel',
                'aluminum', 'industries', 'industry', 'enterprises', 'enterprise',
                'group', 'services', 'service', 'company', 'center', 'transport',
                'logistics', 'supply', 'resources',
              ])
              const titleMatch = (accounts || []).find(a => {
                const words = a.name.toLowerCase().split(/\s+/).filter(
                  (w: string) => w.length > 2 && !CAL_STOP_WORDS.has(w)
                )
                // Require at least one distinctive word to match
                return words.length > 0 && words.some((w: string) => titleLower.includes(w))
              })
              if (titleMatch) {
                matchedAccountId = titleMatch.id
                matchedAccountName = titleMatch.name
              }
            }

            if (!matchedAccountId) continue

            const eventTitle = event.summary || 'Meeting'
            const eventDesc = event.description || ''
            const startTime = event.start?.dateTime || event.start?.date || ''

            // Skip if already logged
            if (seenGcalIds.has(`gcal:${event.id}`)) continue

            // Log the meeting directly as an interaction — updates Last Contact immediately
            await supabase.from('interactions').insert({
              account_id: matchedAccountId,
              type: 'meeting',
              summary: eventTitle,
              detail: `gcal:${event.id}`,
              event_at: startTime || null,
            })
            seenGcalIds.add(`gcal:${event.id}`)
            calCount++
            touchedAccountIds.add(matchedAccountId)

            // AI extraction from event title + description
            const textToAnalyze = [
              `Meeting: ${eventTitle}`,
              eventDesc ? `Notes/Description:\n${eventDesc}` : '',
            ].filter(Boolean).join('\n\n')

            if (textToAnalyze.length > 20) {
              const extracted = await extractTasksFromText(
                textToAnalyze,
                matchedAccountName,
                'calendar event'
              )

              taskCount += await stageExtractedItems(supabase, matchedAccountId, extracted.items, 'session', eventTitle || 'calendar event', `gcal:${event.id}`)
            }
          }
        }
      } catch (e) {
        console.error('Calendar sync error', e)
      }
    }

    // ── Slack ──────────────────────────────────────────────────────────────────
    if (token.provider === 'slack' && token.access_token) {
      let count = 0
      for (const account of accounts || []) {
        try {
          const res = await fetch(
            `https://slack.com/api/search.messages?query=${encodeURIComponent(`"${account.name}"`)}&count=10&sort=timestamp`,
            { headers: { Authorization: `Bearer ${token.access_token}` } }
          )
          const data = await res.json()
          if (!data.ok) {
            if (data.error === 'token_revoked' || data.error === 'invalid_auth') {
              errors.push(`Slack token invalid: ${data.error}`)
              break
            }
            continue
          }
          if (!data.messages?.matches?.length) continue

          for (const match of data.messages.matches) {
            if (match.subtype) continue

            // Skip DMs and channels that look like Slack user/channel IDs (e.g. U0AREFKS50X, C01234ABCDE)
            const channelName = match.channel?.name || ''
            const channelId = match.channel?.id || ''
            const isDmOrId = /^[A-Z][A-Z0-9]{6,}$/.test(channelName) || !channelName
            if (isDmOrId) continue

            // Skip channels the user isn't a member of
            if (match.channel?.is_member === false) continue
            // Also skip if channel ID starts with D (DM) or G (group DM)
            if (channelId.startsWith('D') || channelId.startsWith('G')) continue

            const slackKey = `${account.id}:${match.ts}`
            if (seenSlackKeys.has(slackKey)) continue

            const text = match.text?.slice(0, 500) || ''

            const slackDate = match.ts
              ? new Date(parseFloat(match.ts) * 1000).toISOString()
              : null
            await supabase.from('interactions').insert({
              account_id: account.id,
              type: 'note',
              summary: `Slack: mention in #${channelName}`,
              detail: text,
              slack_ts: match.ts,
              event_at: slackDate,
            })
            seenSlackKeys.add(slackKey)
            count++
            touchedAccountIds.add(account.id)

            // Extract tasks from Slack message content → stage as suggestions
            if (text.length > 30) {
              const extracted = await extractTasksFromText(text, account.name, 'Slack message')
              taskCount += await stageExtractedItems(supabase, account.id, extracted.items, 'manual', 'Slack', `slack:${match.ts}`)
            }
          }
        } catch (e) {
          console.error('Slack sync error for account', account.name, e)
        }
      }
      if (count > 0) calCount += count // reuse counter for display
    }
  }

  // ── Post-sync: mark touched accounts as having new AI suggestions ─────────────
  // Upserts a pending ai_suggestion so the pulsing dot appears on the dashboard.
  // Existing pending suggestions for the same account are left untouched (dedup by
  // checking status = 'pending' before inserting).
  if (touchedAccountIds.size > 0) {
    for (const accountId of Array.from(touchedAccountIds)) {
      // Skip if there's already a pending suggestion so we don't spam the table
      const { data: existing } = await supabase
        .from('ai_suggestions').select('id')
        .eq('account_id', accountId).eq('status', 'pending').limit(1).single()
      if (!existing) {
        await supabase.from('ai_suggestions').insert({
          account_id: accountId,
          type: 'sync',
          title: 'New activity detected',
          body: 'Sync found new interactions — open the AI tab for updated insights.',
          status: 'pending',
        })
      }
    }
  }

  // ── Record sync time for all connected providers ──────────────────────────────
  await supabase.from('connector_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', user.id)

  const parts: string[] = []
  if (emailCount > 0) parts.push(`${emailCount} email${emailCount !== 1 ? 's' : ''}`)
  if (calCount > 0) parts.push(`${calCount} calendar event${calCount !== 1 ? 's' : ''}`)
  if (taskCount > 0) parts.push(`${taskCount} task${taskCount !== 1 ? 's' : ''} extracted`)
  if (unmatched > 0) parts.push(`${unmatched} unmatched`)
  if (touchedAccountIds.size > 0) parts.push(`${touchedAccountIds.size} account${touchedAccountIds.size !== 1 ? 's' : ''} flagged for AI review`)

  const message = errors.length > 0
    ? `Sync issues: ${errors.join('; ')}`
    : parts.length === 0
      ? 'Already up to date'
      : `Synced: ${parts.join(' · ')}`

  return NextResponse.json({ emailCount, calCount, taskCount, unmatched, aiQueued: touchedAccountIds.size, message, errors })
}
