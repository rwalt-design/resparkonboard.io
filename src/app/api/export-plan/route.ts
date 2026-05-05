import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { OnboardingPlanPDF } from '@/lib/pdf/OnboardingPlanPDF'

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

  // Generate PDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(
    createElement(OnboardingPlanPDF, {
      account: sorted,
      repName: member?.name || user.email?.split('@')[0] || 'Your Rep',
      companyName: 'Respark',
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
