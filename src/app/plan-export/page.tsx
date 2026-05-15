import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlanExportClient } from './PlanExportClient'

export default async function PlanExportPage({
  searchParams,
}: {
  searchParams: { account?: string; print?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const accountId = searchParams.account
  if (!accountId) redirect('/')

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
      .single(),
    supabase.from('hardware_tasks').select('*').eq('account_id', accountId).order('sort_order'),
    supabase.from('report_tasks').select('*').eq('account_id', accountId).order('sort_order'),
    supabase.from('compliance_tasks').select('*').eq('account_id', accountId).order('sort_order'),
    supabase.from('org_members').select('name, role').eq('user_id', user!.id).single(),
  ])

  if (!account) redirect('/')

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
    name: currentMember?.name || user!.email?.split('@')[0] || 'Your ReSpark Rep',
    role: 'Implementation Specialist',
    email: user!.email || 'ryan@respark.com',
  }

  return (
    <PlanExportClient
      account={sorted}
      hardwareTasks={hardwareTasks || []}
      reportTasks={reportTasks || []}
      complianceTasks={complianceTasks || []}
      rep={rep}
      autoprint={searchParams.print === '1'}
    />
  )
}
