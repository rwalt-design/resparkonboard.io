import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/dedupe-plan-items
// Body: { account_id?: string }  — omit to dedupe all accounts in the org
// For each stage, finds items with the same display name and removes duplicates.
// Keeps the "best" copy: prefers task_done=true, then lowest order_index (original).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).single()
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { account_id } = body

  let accountQuery = supabase.from('accounts').select('id, name').eq('org_id', member.org_id)
  if (account_id) accountQuery = accountQuery.eq('id', account_id)
  const { data: accounts } = await accountQuery
  if (!accounts?.length) return NextResponse.json({ removed: 0 })

  let totalRemoved = 0
  const details: { account_name: string; removed: number }[] = []

  for (const account of accounts) {
    const { data: stages } = await supabase
      .from('stages')
      .select('id, milestone_id, milestones!inner(account_id)')
      .eq('milestones.account_id', account.id)

    if (!stages?.length) continue

    let accountRemoved = 0

    for (const stage of stages) {
      const { data: items } = await supabase
        .from('items')
        .select('id, type, task_name, session_name, handoff_name, task_done, order_index')
        .eq('stage_id', stage.id)
        .order('order_index')

      if (!items || items.length < 2) continue

      // Group by normalized display name + type
      const groups = new Map<string, typeof items>()
      for (const item of items) {
        const displayName = (item.task_name || item.session_name || item.handoff_name || '').toLowerCase().trim()
        const key = `${item.type}::${displayName}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
      }

      const toDelete: string[] = []
      for (const group of Array.from(groups.values())) {
        if (group.length < 2) continue
        // Keep the one that's done (if any), otherwise lowest order_index (first inserted)
        const sorted = [...group].sort((a, b) => {
          if (a.task_done && !b.task_done) return -1
          if (!a.task_done && b.task_done) return 1
          return (a.order_index ?? 0) - (b.order_index ?? 0)
        })
        toDelete.push(...sorted.slice(1).map(i => i.id))
      }

      if (toDelete.length > 0) {
        const { error } = await supabase.from('items').delete().in('id', toDelete)
        if (!error) accountRemoved += toDelete.length
      }
    }

    totalRemoved += accountRemoved
    if (accountRemoved > 0) details.push({ account_name: account.name, removed: accountRemoved })
  }

  return NextResponse.json({ removed: totalRemoved, details })
}
