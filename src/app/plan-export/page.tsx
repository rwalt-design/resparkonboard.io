import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlanExportClient } from './PlanExportClient'

export default async function PlanExportPage({
  searchParams,
}: {
  searchParams: { account?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const accountId = searchParams.account
  if (!accountId) redirect('/')

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

  return <PlanExportClient account={sorted} />
}
