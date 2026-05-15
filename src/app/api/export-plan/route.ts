import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { ExportPlanPDF } from '@/lib/pdf/ExportPlanPDF'
import { createElement } from 'react'
import { readFileSync } from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const accountId = req.nextUrl.searchParams.get('account')
  if (!accountId) return new NextResponse('Missing account', { status: 400 })

  const [
    { data: account },
    { data: hardwareTasks },
    { data: reportTasks },
    { data: complianceTasks },
    { data: currentMember },
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select(`
        *,
        milestones(
          *,
          stages(
            *,
            items(*)
          )
        )
      `)
      .eq('id', accountId)
      .single(),
    supabase.from('hardware_tasks').select('*').eq('account_id', accountId).order('sort_order'),
    supabase.from('report_tasks').select('*').eq('account_id', accountId).order('sort_order'),
    supabase.from('compliance_tasks').select('*').eq('account_id', accountId).order('sort_order'),
    supabase.from('org_members').select('name, role').eq('user_id', user.id).single(),
  ])

  if (!account) return new NextResponse('Account not found', { status: 404 })

  // Sort nested arrays
  const sorted = {
    ...account,
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

  const rep = {
    name: currentMember?.name || user.email?.split('@')[0] || 'Your ReSpark Rep',
    role: 'Implementation Specialist',
    email: user.email || 'ryan@respark.com',
  }

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Load logo as base64 data URI for react-pdf
  const logoPath = path.join(process.cwd(), 'public', 'logo-horizontal.png')
  const logoBuffer = readFileSync(logoPath)
  const logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`

  const element = createElement(ExportPlanPDF, {
    account: sorted,
    hardwareTasks: hardwareTasks || [],
    reportTasks: reportTasks || [],
    complianceTasks: complianceTasks || [],
    rep,
    logoSrc,
    today,
  })

  const buffer = await renderToBuffer(element as any)

  const safeName = account.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const filename = `${safeName}-onboarding-plan.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
