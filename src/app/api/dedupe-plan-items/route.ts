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
    // Step 1: get milestone IDs for this account
    const { data: milestones } = await supabase
      .from('milestones').select('id').eq('account_id', account.id)
    if (!milestones?.length) continue

    const milestoneIds = milestones.map(m => m.id)

    // Step 2: get all stage IDs under those milestones
    const { data: stages } = await supabase
      .from('stages').select('id').in('milestone_id', milestoneIds)
    if (!stages?.length) continue

    let accountRemoved = 0

    for (const stage of stages) {
      // Step 3: get all items in this stage
      const { data: items } = await supabase
        .from('items')
        .select('id, type, task_name, session_name, handoff_name, task_done, order_index')
        .eq('stage_id', stage.id)
        .order('order_index')

      if (!items || items.length < 2) continue

      // Group by type + normalized display name
      const groups = new Map<string, typeof items>()
      for (const item of items) {
        const name = (item.task_name || item.session_name || item.handoff_name || '').toLowerCase().trim()
        const key = `${item.type}::${name}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
      }

      const toDelete: string[] = []
      for (const group of Array.from(groups.values())) {
        if (group.length < 2) continue
        // Keep the done one first, then lowest order_index (earliest inserted)
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
        else console.error('Dedup delete error:', error.message)
      }
    }

    totalRemoved += accountRemoved
    if (accountRemoved > 0) details.push({ account_name: account.name, removed: accountRemoved })
  }

  return NextResponse.json({ removed: totalRemoved, details })
}
