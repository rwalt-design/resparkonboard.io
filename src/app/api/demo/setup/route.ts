import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  const admin = createAdminClient()

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Idempotent
  const { data: existing } = await admin
    .from('org_members').select('id').eq('user_id', user.id).single()
  if (existing) return NextResponse.json({ ok: true, already: true })

  // ── Create org + member ──
  const orgId = randomUUID()
  await admin.from('organizations').insert({ id: orgId, name: 'Demo Org' })
  await admin.from('org_members').insert({
    org_id: orgId, user_id: user.id,
    name: 'Demo User', role: 'csm', assignee_key: 'personal',
  })

  const now = Date.now()
  const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString()

  // ── Account 1: Landmark Transport ─────────────────────────────────────────
  // Full Suite + Brokerage, $84k ARR — mid-onboarding, Configuration complete, Training active
  const a1 = randomUUID()
  await admin.from('accounts').insert({
    id: a1, org_id: orgId, name: 'Landmark Transport',
    sku: 'full_suite', addons: ['brokerage'], arr: 84000, owner_id: user.id,
    sales_context: 'Large regional fleet, 12 terminals across the Southeast. Came in via referral from an existing customer. Main pain point was manual dispatch and zero visibility into driver performance. IT team is lean — Sarah handles everything and needs detailed guidance through setup. Mike is the exec sponsor and very bought in.',
  })

  await Promise.all([
    admin.from('contacts').insert([
      { account_id: a1, name: 'Mike Rodriguez', role: 'Operations Director', email: 'mike.rodriguez@landmarktransport.com', primary_contact: true },
      { account_id: a1, name: 'Sarah Chen', role: 'IT Manager', email: 's.chen@landmarktransport.com', primary_contact: false },
    ]),
    admin.from('interactions').insert([
      { account_id: a1, type: 'meeting', summary: 'Kickoff call', detail: 'Walked through the milestone plan with Mike and Sarah. Both engaged — Mike wants to hit go-live in 8 weeks. Sarah flagged hardware integration as her main concern. Sent the data template during the call. Set disco for next week.', created_at: daysAgo(21), user_id: user.id },
      { account_id: a1, type: 'email', summary: 'Data template received', detail: 'Sarah returned the completed driver + terminal data file. A few driver IDs were formatted incorrectly — replied with a fix and she turned it around same day.', created_at: daysAgo(17), user_id: user.id },
      { account_id: a1, type: 'meeting', summary: 'Discovery meeting', detail: 'Thorough session. Hardware: 47 ELDs across 12 terminals, all Samsara. Compliance: FMCSA HOS + state-level fuel tax. Reporting: weekly driver scorecards + monthly terminal P&L. Accounting: QuickBooks integration needed. One edge case — split loads across terminals need a custom workflow.', created_at: daysAgo(14), user_id: user.id },
      { account_id: a1, type: 'email', summary: 'All discovery docs returned', detail: 'Received hardware, compliance, reporting, and accounting questionnaires back from Sarah. Accounting doc needed a follow-up — she got it to me by EOD. Environment setup kicked off.', created_at: daysAgo(9), user_id: user.id },
      { account_id: a1, type: 'call', summary: 'Environment setup complete — training scheduled', detail: 'Confirmed all data uploaded, hardware integrated, compliance flows live, QuickBooks syncing correctly. Custom split-load workflow built and approved by Mike. Admin training session scheduled for next Thursday.', created_at: daysAgo(3), user_id: user.id },
    ]),
  ])

  // Pre-generate IDs
  const [m1cfg, m1tr, m1val, m1gl] = Array.from({ length: 4 }, randomUUID)
  const [s1ac, s1ki, s1di, s1es, s1at, s1ut, s1uts, s1rr, s1la] = Array.from({ length: 9 }, randomUUID)

  await admin.from('milestones').insert([
    { id: m1cfg, account_id: a1, name: 'Configuration', order_index: 0 },
    { id: m1tr,  account_id: a1, name: 'Training',      order_index: 1 },
    { id: m1val, account_id: a1, name: 'Validation',    order_index: 2 },
    { id: m1gl,  account_id: a1, name: 'Go-Live',       order_index: 3 },
  ])

  await admin.from('stages').insert([
    { id: s1ac,  milestone_id: m1cfg, name: 'Account Creation',  status: 'complete', order_index: 0 },
    { id: s1ki,  milestone_id: m1cfg, name: 'Kickoff',           status: 'complete', order_index: 1 },
    { id: s1di,  milestone_id: m1cfg, name: 'Discovery',         status: 'complete', order_index: 2 },
    { id: s1es,  milestone_id: m1cfg, name: 'Environment Setup', status: 'complete', order_index: 3 },
    { id: s1at,  milestone_id: m1tr,  name: 'Admin Training',    status: 'active',   order_index: 0 },
    { id: s1ut,  milestone_id: m1tr,  name: 'User Training',     status: 'locked',   order_index: 1 },
    { id: s1uts, milestone_id: m1val, name: 'User Testing',      status: 'locked',   order_index: 0 },
    { id: s1rr,  milestone_id: m1val, name: 'Readiness Review',  status: 'locked',   order_index: 1 },
    { id: s1la,  milestone_id: m1gl,  name: 'Launch',            status: 'locked',   order_index: 0 },
  ])

  await admin.from('items').insert([
    // Account Creation — all done
    { stage_id: s1ac, type: 'task', task_name: 'Add primary contacts',  task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 0 },
    { stage_id: s1ac, type: 'task', task_name: 'Select products / SKUs',task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s1ac, type: 'task', task_name: 'Set ARR',               task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s1ac, type: 'task', task_name: 'Add sales context',     task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    // Kickoff — all done
    { stage_id: s1ki, type: 'session', session_name: 'Kickoff Meeting', session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s1ki, type: 'task', task_name: 'Send Data Template',    task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s1ki, type: 'task', task_name: 'Return Data Template',  task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    // Discovery — all done
    { stage_id: s1di, type: 'session', session_name: 'Discovery Meeting', session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s1di, type: 'task', task_name: 'Send Hardware Doc',      task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s1di, type: 'task', task_name: 'Return Hardware Doc',    task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s1di, type: 'task', task_name: 'Send Compliance Doc',   task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    { stage_id: s1di, type: 'task', task_name: 'Return Compliance Doc', task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 4 },
    { stage_id: s1di, type: 'task', task_name: 'Send Reporting Doc',    task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 5 },
    { stage_id: s1di, type: 'task', task_name: 'Return Reporting Doc',  task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 6 },
    { stage_id: s1di, type: 'task', task_name: 'Send Accounting Doc',   task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 7 },
    { stage_id: s1di, type: 'task', task_name: 'Return Accounting Doc', task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 8 },
    // Environment Setup — all done
    { stage_id: s1es, type: 'task', task_name: 'Upload Data',              task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 0 },
    { stage_id: s1es, type: 'task', task_name: 'Integrate Hardware',       task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s1es, type: 'task', task_name: 'Set Up Compliance Flows',  task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s1es, type: 'task', task_name: 'Integrate Accounting',     task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    { stage_id: s1es, type: 'task', task_name: 'Custom Workflow Setup',    task_assignee: 'personal', task_source: 'plan', task_done: true,  required: false, order_index: 4 },
    // Admin Training — in progress
    { stage_id: s1at, type: 'session', session_name: 'Admin Training Session', session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s1at, type: 'task', task_name: 'Complete admin setup checklist', task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    // User Training — locked
    { stage_id: s1ut, type: 'session', session_name: 'User Training Session', session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s1ut, type: 'task', task_name: 'Confirm user accounts created', task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    // User Testing — locked
    { stage_id: s1uts, type: 'log', task_name: 'Log Daily Job/Ticket Usage', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    // Readiness Review — locked
    { stage_id: s1rr, type: 'session', session_name: 'Q&A',                               session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s1rr, type: 'task', task_name: 'Send Pre-Launch Checklist',  task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    { stage_id: s1rr, type: 'task', task_name: 'Return Pre-Launch Checklist',task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    { stage_id: s1rr, type: 'task', task_name: 'Review Pre-Launch Checklist',task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 3 },
    // Launch — locked
    { stage_id: s1la, type: 'task',    task_name: 'Usage Review',       task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    { stage_id: s1la, type: 'session', session_name: 'Post-Launch Check-In', session_status: 'pending', required: false, order_index: 1 },
    { stage_id: s1la, type: 'handoff', handoff_name: 'CSM Handoff',                                      required: false, order_index: 2 },
  ])

  // ── Account 2: Ironclad Materials ──────────────────────────────────────────
  // Full Suite, $52k ARR — early, Kickoff done, Discovery active
  const a2 = randomUUID()
  await admin.from('accounts').insert({
    id: a2, org_id: orgId, name: 'Ironclad Materials',
    sku: 'full_suite', addons: [], arr: 52000, owner_id: user.id,
    sales_context: 'Regional scrap metal recycler, 4 yards across the Midwest. Fleet of 22 pickup trucks + 6 roll-off trucks doing industrial scrap collection. Dispatch is all whiteboard and phone right now — no visibility into routes or load weights. Owner-operated, Tom handles ops and IT himself. Goal: get live in 6 weeks, impress the owner, then upsell brokerage module once they see load tracking value.',
  })

  await Promise.all([
    admin.from('contacts').insert([
      { account_id: a2, name: 'Tom Kowalski', role: 'Operations Manager', email: 'tom@ironcladmaterials.com', primary_contact: true },
      { account_id: a2, name: 'Dana Ruiz', role: 'Office Manager', email: 'dana@ironcladmaterials.com', primary_contact: false },
    ]),
    admin.from('interactions').insert([
      { account_id: a2, type: 'meeting', summary: 'Kickoff call', detail: 'Tom and Dana both on. Very energetic — Tom already has drivers lined up to test. Walked through the milestone plan and what data we need. Sent the data template during the call. Tom said he can have it back by end of week. Set discovery for next Tuesday.', created_at: daysAgo(6), user_id: user.id },
      { account_id: a2, type: 'email', summary: 'Data template follow-up', detail: "Checked in on the data template — Tom said they're still pulling driver IDs from their old spreadsheets. Should have it by Thursday. Confirmed discovery meeting is still on for next week.", created_at: daysAgo(2), user_id: user.id },
    ]),
  ])

  const [m2cfg, m2tr, m2val, m2gl] = Array.from({ length: 4 }, randomUUID)
  const [s2ac, s2ki, s2di, s2es, s2tr, s2uts, s2rr, s2la] = Array.from({ length: 8 }, randomUUID)

  await admin.from('milestones').insert([
    { id: m2cfg, account_id: a2, name: 'Configuration', order_index: 0 },
    { id: m2tr,  account_id: a2, name: 'Training',      order_index: 1 },
    { id: m2val, account_id: a2, name: 'Validation',    order_index: 2 },
    { id: m2gl,  account_id: a2, name: 'Go-Live',       order_index: 3 },
  ])

  await admin.from('stages').insert([
    { id: s2ac,  milestone_id: m2cfg, name: 'Account Creation',  status: 'complete', order_index: 0 },
    { id: s2ki,  milestone_id: m2cfg, name: 'Kickoff',           status: 'complete', order_index: 1 },
    { id: s2di,  milestone_id: m2cfg, name: 'Discovery',         status: 'active',   order_index: 2 },
    { id: s2es,  milestone_id: m2cfg, name: 'Environment Setup', status: 'locked',   order_index: 3 },
    { id: s2tr,  milestone_id: m2tr,  name: 'Training',          status: 'locked',   order_index: 0 },
    { id: s2uts, milestone_id: m2val, name: 'User Testing',      status: 'locked',   order_index: 0 },
    { id: s2rr,  milestone_id: m2val, name: 'Readiness Review',  status: 'locked',   order_index: 1 },
    { id: s2la,  milestone_id: m2gl,  name: 'Launch',            status: 'locked',   order_index: 0 },
  ])

  await admin.from('items').insert([
    // Account Creation — all done
    { stage_id: s2ac, type: 'task', task_name: 'Add primary contacts',  task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 0 },
    { stage_id: s2ac, type: 'task', task_name: 'Select products / SKUs',task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s2ac, type: 'task', task_name: 'Set ARR',               task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s2ac, type: 'task', task_name: 'Add sales context',     task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    // Kickoff — session done, data template sent but NOT returned yet
    { stage_id: s2ki, type: 'session', session_name: 'Kickoff Meeting', session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s2ki, type: 'task', task_name: 'Send Data Template',    task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s2ki, type: 'task', task_name: 'Return Data Template',  task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    // Discovery — active, nothing done yet
    { stage_id: s2di, type: 'session', session_name: 'Discovery Meeting', session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s2di, type: 'task', task_name: 'Send Hardware Doc',      task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    { stage_id: s2di, type: 'task', task_name: 'Return Hardware Doc',    task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    { stage_id: s2di, type: 'task', task_name: 'Send Compliance Doc',   task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 3 },
    { stage_id: s2di, type: 'task', task_name: 'Return Compliance Doc', task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 4 },
    { stage_id: s2di, type: 'task', task_name: 'Send Reporting Doc',    task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 5 },
    { stage_id: s2di, type: 'task', task_name: 'Return Reporting Doc',  task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 6 },
    { stage_id: s2di, type: 'task', task_name: 'Send Accounting Doc',   task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 7 },
    { stage_id: s2di, type: 'task', task_name: 'Return Accounting Doc', task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 8 },
    // Environment Setup — locked
    { stage_id: s2es, type: 'task', task_name: 'Upload Data',             task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    { stage_id: s2es, type: 'task', task_name: 'Integrate Hardware',      task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    { stage_id: s2es, type: 'task', task_name: 'Set Up Compliance Flows', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    { stage_id: s2es, type: 'task', task_name: 'Integrate Accounting',    task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 3 },
    { stage_id: s2es, type: 'task', task_name: 'Custom Workflow Setup',   task_assignee: 'personal', task_source: 'plan', task_done: false, required: false, order_index: 4 },
    // Training — locked (no templates in demo)
    { stage_id: s2tr, type: 'session', session_name: 'Training Session', session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s2tr, type: 'task', task_name: 'Confirm training complete', task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    // User Testing — locked
    { stage_id: s2uts, type: 'log', task_name: 'Log Daily Job/Ticket Usage', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    // Readiness Review — locked
    { stage_id: s2rr, type: 'session', session_name: 'Q&A',                                session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s2rr, type: 'task', task_name: 'Send Pre-Launch Checklist',  task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    { stage_id: s2rr, type: 'task', task_name: 'Return Pre-Launch Checklist',task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    { stage_id: s2rr, type: 'task', task_name: 'Review Pre-Launch Checklist',task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 3 },
    // Launch — locked
    { stage_id: s2la, type: 'task',    task_name: 'Usage Review',       task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    { stage_id: s2la, type: 'session', session_name: 'Post-Launch Check-In', session_status: 'pending', required: false, order_index: 1 },
    { stage_id: s2la, type: 'handoff', handoff_name: 'CSM Handoff',                                      required: false, order_index: 2 },
  ])

  return NextResponse.json({ ok: true })
}
