import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import type { Account, OrgMember, TrainingTemplate, Connector, PlanTemplate, SessionTemplate } from '@/types'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch everything in parallel
  const [
    { data: accounts },
    { data: orgMembers },
    { data: trainingTemplates },
    { data: planTemplates },
    { data: sessionTemplates },
    { data: connectors },
    { data: connectorTokens },
    { data: pendingSuggestions },
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select(`
        *,
        contacts(*),
        interactions(*, created_at),
        open_tasks(*),
        requests(*),
        milestones(
          *,
          stages(
            *,
            items(*, action_items(*))
          )
        )
      `)
      .order('created_at', { ascending: false }),
    supabase.from('org_members').select('*').order('name'),
    supabase.from('training_templates').select('*').order('name'),
    supabase.from('plan_templates').select('*').order('name'),
    supabase.from('session_templates').select('*').order('name'),
    supabase.from('connectors').select('*').order('name'),
    supabase.from('connector_tokens').select('provider, scopes, google_email, updated_at').eq('user_id', user.id),
    supabase.from('ai_suggestions').select('account_id').eq('status', 'pending'),
  ])

  // Sort nested arrays by order_index
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedAccounts = ((accounts || []) as any[]).map((a: any) => ({
    ...a,
    milestones: ((a.milestones || []) as any[])
      .sort((x: any, y: any) => x.order_index - y.order_index)
      .map((m: any) => ({
        ...m,
        stages: ((m.stages || []) as any[])
          .sort((x: any, y: any) => x.order_index - y.order_index)
          .map((s: any) => ({
            ...s,
            items: ((s.items || []) as any[])
              .sort((x: any, y: any) => x.order_index - y.order_index),
          })),
      })),
  })) as Account[]

  const currentMember = (orgMembers || []).find(
    (m: Record<string, unknown>) => m.user_id === user.id
  ) as OrgMember | undefined

  return (
    <AppShell
      accounts={sortedAccounts}
      currentUser={user}
      currentMember={currentMember}
      orgMembers={(orgMembers || []) as OrgMember[]}
      trainingTemplates={(trainingTemplates || []) as TrainingTemplate[]}
      planTemplates={(planTemplates || []) as PlanTemplate[]}
      sessionTemplates={(sessionTemplates || []) as SessionTemplate[]}
      connectors={(connectors || []) as Connector[]}
      connectorTokens={(connectorTokens || []) as any[]}
      accountsWithSuggestions={new Set((pendingSuggestions || []).map((s: any) => s.account_id))}
    />
  )
}
