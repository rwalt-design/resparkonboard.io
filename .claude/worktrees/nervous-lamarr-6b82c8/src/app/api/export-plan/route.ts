import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { OnboardingPlanPDF } from '@/lib/pdf/OnboardingPlanPDF'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SKU_LABELS: Record<string, string> = {
  // Legacy (ReMatter)
  facility_management:    'Facility Management',
  full_suite:             'Full Suite',
  // ReSpark — Yard Ops
  essentials:             'Essentials',
  pro:                    'Pro',
  // ReSpark — Logistics
  dispatch:               'Dispatch',
  dispatch_pro:           'Dispatch Pro',
  rail:                   'Rail',
  exports:                'Exports',
  // ReSpark — Maintenance
  maintenance_essentials: 'Maintenance Essentials',
  maintenance_pro:        'Maintenance Pro',
  maintenance_enterprise: 'Maintenance Enterprise',
}

async function generateIntro(account: any, repName: string): Promise<string> {
  const contacts = (account.contacts || [])
    .slice(0, 3)
    .map((c: any) => c.name + (c.role ? ` (${c.role})` : ''))
    .join(', ')
  const skuLabel = SKU_LABELS[account.sku] || account.sku
  const goLive = account.go_live_date
    ? `Target go-live: ${new Date(account.go_live_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    : ''
  const salesContext = account.sales_context ? `Background: ${account.sales_context}` : ''

  const prompt = `Write a 2–3 sentence personalized intro paragraph for a customer onboarding plan PDF.

Guidelines:
- Warm, direct, plain English — no jargon or filler phrases
- Speak to the customer ("your team", "you'll be working with")
- Do NOT name individual contacts — refer to them collectively as "your team"
- Don't start with "Welcome" or "Dear"
- Reference the product, CSM name, and go-live target naturally
- Return only the paragraph, no quotes or labels

Account: ${account.name}
Product: ${skuLabel}
CSM: ${repName} at Respark
${goLive}
${salesContext}`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 160,
      messages: [{ role: 'user', content: prompt }],
    })
    return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  } catch {
    return ''
  }
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account')
  if (!accountId) return NextResponse.json({ error: 'Missing account' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch account with all nested data
  const { data: account } = await supabase
    .from('accounts')
    .select(`
      *,
      contacts(*),
      requests(*),
      milestones(
        *,
        stages(
          *,
          items(*)
        )
      )
    `)
    .eq('id', accountId)
    .single()

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  // Get current user's member record for rep name
  const { data: member } = await supabase
    .from('org_members')
    .select('name')
    .eq('user_id', user.id)
    .single()

  // Sort nested arrays
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sorted = {
    ...account,
    contacts: (account.contacts || []).sort((a: any, b: any) =>
      a.primary_contact === b.primary_contact ? 0 : a.primary_contact ? -1 : 1
    ),
    requests: (account.requests || []),
    milestones: ((account.milestones || []) as any[])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((m: any) => ({
        ...m,
        stages: ((m.stages || []) as any[])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((s: any) => ({
            ...s,
            items: ((s.items || []) as any[])
              .sort((a: any, b: any) => a.order_index - b.order_index),
          })),
      })),
  }

  const repName = member?.name || user.email?.split('@')[0] || 'Your Rep'

  // Generate personalized intro paragraph with AI
  const intro = await generateIntro(sorted, repName)

  // Generate PDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(
    createElement(OnboardingPlanPDF, {
      account: sorted,
      repName,
      companyName: 'Respark',
      intro,
    }) as any
  )

  // File name: AcmeCorp_Onboarding_Plan_May2026.pdf
  const safeName = account.name.replace(/[^a-zA-Z0-9]/g, '')
  const now = new Date()
  const month = now.toLocaleString('en-US', { month: 'long' })
  const year = now.getFullYear()
  const filename = `${safeName}_Onboarding_Plan_${month}${year}.pdf`

  return new NextResponse(Buffer.from(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
