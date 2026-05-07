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
  const daysFromNow = (d: number) => new Date(now + d * 86400000).toISOString().split('T')[0]
  const dateAgo = (d: number) => new Date(now - d * 86400000).toISOString().split('T')[0]

  // ── Account 1: Pinnacle Property Group ─────────────────────────────────────
  // Facility Management, $48k ARR — Configuration complete, Training in progress
  const a1 = randomUUID()
  await admin.from('accounts').insert({
    id: a1, org_id: orgId, name: 'Pinnacle Property Group',
    sku: 'facility_management', addons: [], arr: 48000, owner_id: user.id,
    health_status: 'active',
    kickoff_date: dateAgo(38),
    go_live_date: daysFromNow(18),
    sales_context: 'Multi-site property management company, 12 commercial buildings across Nashville and Memphis. 3 full-time maintenance techs + 2 contracted vendors. Previously using Excel + email to track work orders — zero visibility for the portfolio owners. Megan (Director of Facilities) drove the purchase after losing a major tenant over a HVAC response-time complaint. James handles IT and is technically capable but stretched thin. Budget was tight — this closed at a 10% discount on the FM SKU with a 12-month commit. Goal is live before their lease renewal cycle starts in 8 weeks.',
  })

  await Promise.all([
    admin.from('contacts').insert([
      { account_id: a1, name: 'Megan Torres', role: 'Director of Facilities', email: 'megan.torres@pinnaclepropertygroup.com', primary_contact: true },
      { account_id: a1, name: 'James Park', role: 'IT & Systems Admin', email: 'j.park@pinnaclepropertygroup.com', primary_contact: false },
    ]),
    admin.from('interactions').insert([
      { account_id: a1, type: 'meeting', summary: 'Kickoff call', detail: 'Megan and James both on. Megan is very motivated — mentioned the HVAC incident that drove the purchase. Walked through the onboarding plan and asset upload process. James is going to pull the building and asset list from their facilities binder and get it into the upload template. Sent the data template during the call. Set discovery for next Tuesday.', created_at: daysAgo(38), event_at: daysAgo(38), user_id: user.id },
      { account_id: a1, type: 'email', summary: 'Asset list template received', detail: 'James returned the completed building and asset template. 12 buildings, 340 tracked assets. A few asset categories were missing vendor info — followed up and he filled them in same day. Good sign for their data hygiene.', created_at: daysAgo(32), event_at: daysAgo(32), user_id: user.id },
      { account_id: a1, type: 'meeting', summary: 'Discovery meeting', detail: 'Deep dive on their operational setup. Buildings: 12 sites across 2 markets. Assets: HVAC, plumbing, electrical, elevators — they track ~340 assets. Compliance: state elevator inspection certs + fire suppression logs. Vendors: 4 preferred vendors with master service agreements. Reporting: monthly portfolio summary for the ownership group, weekly PM completion rate. Accounting: they use QuickBooks and want to eventually export work order costs — flagged the Export add-on for a future upsell.', created_at: daysAgo(31), event_at: daysAgo(31), user_id: user.id },
      { account_id: a1, type: 'email', summary: 'All discovery docs returned', detail: 'Received compliance schedule, vendor list, and reporting requirements doc from James. Accounting questionnaire came in the next morning — they want cost-code integration but that can wait until after go-live.', created_at: daysAgo(25), event_at: daysAgo(25), user_id: user.id },
      { account_id: a1, type: 'call', summary: 'Environment setup complete — admin training scheduled', detail: "Confirmed all 12 buildings loaded, 340 assets configured, vendor profiles live, PM schedules set up. Compliance inspection flows are running. Megan is thrilled with how the work order dashboard looks. Admin training scheduled for Thursday. She's going to have both Megan and James on for that session.", created_at: daysAgo(18), event_at: daysAgo(18), user_id: user.id },
      { account_id: a1, type: 'meeting', summary: 'Admin training complete', detail: 'Two-hour session with Megan and James. Covered work order creation, PM scheduling, vendor assignment, and the reporting dashboard. James had good questions about the asset filter — walked him through the saved views feature. Megan wants to do a technician training next week so her field team can start using the mobile app. Confirmed that for next Thursday.', created_at: daysAgo(11), event_at: daysAgo(11), user_id: user.id },
      { account_id: a1, type: 'call', summary: 'Pre-tech training check-in', detail: 'Quick call with Megan — she confirmed all 3 techs have mobile app installed and logged in. James set up their user accounts yesterday. Ready for technician training Thursday. Megan mentioned one of her contracted vendors is asking about portal access — told her that comes post-go-live.', created_at: daysAgo(3), event_at: daysAgo(3), user_id: user.id },
    ]),
  ])

  const [m1cfg, m1tr, m1val, m1gl] = Array.from({ length: 4 }, randomUUID)
  const [s1ac, s1ki, s1di, s1es, s1at, s1tt, s1ut, s1uts, s1rr, s1la] = Array.from({ length: 10 }, randomUUID)

  await admin.from('milestones').insert([
    { id: m1cfg, account_id: a1, name: 'Configuration', order_index: 0 },
    { id: m1tr,  account_id: a1, name: 'Training',      order_index: 1 },
    { id: m1val, account_id: a1, name: 'Validation',    order_index: 2 },
    { id: m1gl,  account_id: a1, name: 'Go-Live',       order_index: 3 },
  ])

  await admin.from('stages').insert([
    { id: s1ac,  milestone_id: m1cfg, name: 'Account Creation',     status: 'complete', order_index: 0 },
    { id: s1ki,  milestone_id: m1cfg, name: 'Kickoff',              status: 'complete', order_index: 1 },
    { id: s1di,  milestone_id: m1cfg, name: 'Discovery',            status: 'complete', order_index: 2 },
    { id: s1es,  milestone_id: m1cfg, name: 'Environment Setup',    status: 'complete', order_index: 3 },
    { id: s1at,  milestone_id: m1tr,  name: 'Admin Training',       status: 'complete', order_index: 0 },
    { id: s1tt,  milestone_id: m1tr,  name: 'Technician Training',  status: 'active',   order_index: 1 },
    { id: s1ut,  milestone_id: m1tr,  name: 'Manager Training',     status: 'locked',   order_index: 2 },
    { id: s1uts, milestone_id: m1val, name: 'Work Order Usage',     status: 'locked',   order_index: 0 },
    { id: s1rr,  milestone_id: m1val, name: 'Readiness Review',     status: 'locked',   order_index: 1 },
    { id: s1la,  milestone_id: m1gl,  name: 'Launch',               status: 'locked',   order_index: 0 },
  ])

  await admin.from('items').insert([
    // Account Creation — all done
    { stage_id: s1ac, type: 'task', task_name: 'Add primary contacts',   task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 0 },
    { stage_id: s1ac, type: 'task', task_name: 'Select products / SKUs', task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s1ac, type: 'task', task_name: 'Set ARR',                task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s1ac, type: 'task', task_name: 'Add sales context',      task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    // Kickoff — all done
    { stage_id: s1ki, type: 'session', session_name: 'Kickoff Meeting',  session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s1ki, type: 'task', task_name: 'Send Asset & Building Template', task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s1ki, type: 'task', task_name: 'Return Asset & Building Template',task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    // Discovery — all done
    { stage_id: s1di, type: 'session', session_name: 'Discovery Meeting', session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s1di, type: 'task', task_name: 'Send Compliance Schedule Doc', task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s1di, type: 'task', task_name: 'Return Compliance Schedule Doc',task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s1di, type: 'task', task_name: 'Send Vendor List Template',    task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    { stage_id: s1di, type: 'task', task_name: 'Return Vendor List Template',  task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 4 },
    { stage_id: s1di, type: 'task', task_name: 'Send Reporting Requirements Doc', task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 5 },
    { stage_id: s1di, type: 'task', task_name: 'Return Reporting Requirements Doc',task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 6 },
    // Environment Setup — all done
    { stage_id: s1es, type: 'task', task_name: 'Upload Buildings & Assets',   task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 0 },
    { stage_id: s1es, type: 'task', task_name: 'Configure PM Schedules',      task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s1es, type: 'task', task_name: 'Set Up Vendor Profiles',      task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s1es, type: 'task', task_name: 'Configure Compliance Flows',  task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    { stage_id: s1es, type: 'task', task_name: 'Set Up Reporting Dashboard',  task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 4 },
    { stage_id: s1es, type: 'task', task_name: 'Customer reviews environment', task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 5 },
    // Admin Training — complete
    { stage_id: s1at, type: 'session', session_name: 'Admin Training',        session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s1at, type: 'task', task_name: 'Admin completes setup checklist', task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    // Technician Training — active
    { stage_id: s1tt, type: 'session', session_name: 'Technician Training',   session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s1tt, type: 'task', task_name: 'Technicians install mobile app', task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s1tt, type: 'task', task_name: 'Techs complete first work order in app', task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    // Manager Training — locked
    { stage_id: s1ut, type: 'session', session_name: 'Manager & Reporting Training', session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s1ut, type: 'task', task_name: 'Managers review reporting dashboard', task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    // Work Order Usage — locked
    { stage_id: s1uts, type: 'log', task_name: 'Log daily work order submissions', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    // Readiness Review — locked
    { stage_id: s1rr, type: 'session', session_name: 'Readiness Review',          session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s1rr, type: 'task', task_name: 'Send Pre-Launch Checklist',        task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    { stage_id: s1rr, type: 'task', task_name: 'Return Pre-Launch Checklist',      task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    { stage_id: s1rr, type: 'task', task_name: 'Review Pre-Launch Checklist',      task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 3 },
    // Launch — locked
    { stage_id: s1la, type: 'task',    task_name: 'Final usage review',             task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    { stage_id: s1la, type: 'session', session_name: 'Go-Live Check-In',            session_status: 'pending', required: false, order_index: 1 },
    { stage_id: s1la, type: 'golive',  task_name: 'Go Live',                        task_done: false, required: true,  order_index: 2 },
  ])

  // ── Account 2: Verde Commercial Services ──────────────────────────────────────
  // Facility Management + Export, $36k ARR — Kickoff done, Discovery active
  const a2 = randomUUID()
  await admin.from('accounts').insert({
    id: a2, org_id: orgId, name: 'Verde Commercial Services',
    sku: 'facility_management', addons: ['export'], arr: 36000, owner_id: user.id,
    health_status: 'active',
    kickoff_date: dateAgo(9),
    go_live_date: daysFromNow(35),
    sales_context: 'Commercial janitorial and maintenance company. 48 client sites, field team of 55 technicians. Currently running everything out of a shared Google Sheet and WhatsApp group chats — no accountability or work history. Chris (Operations Director) is the champion, very tech-forward. They signed on the Export add-on because their clients want monthly service reports in Excel. Two prior software attempts failed due to poor adoption — they need a clean, simple onboarding experience. Competitor was Service Fusion; we won on reporting capabilities.',
  })

  await Promise.all([
    admin.from('contacts').insert([
      { account_id: a2, name: 'Chris Morales', role: 'Operations Director', email: 'chris.morales@verdecommercial.com', primary_contact: true },
      { account_id: a2, name: 'Sandra Nguyen', role: 'Office Manager', email: 'sandra@verdecommercial.com', primary_contact: false },
    ]),
    admin.from('interactions').insert([
      { account_id: a2, type: 'meeting', summary: 'Kickoff call', detail: "Chris and Sandra both joined. Chris is very focused on the reporting angle — wants to show clients weekly summaries automatically. Walked through the plan, explained what the discovery meeting will cover. Sent the site and client template during the call. Chris said he'll have it back in 3–4 days, Sandra manages the client list so she'll pull it. Set discovery for next Monday.", created_at: daysAgo(9), event_at: daysAgo(9), user_id: user.id },
      { account_id: a2, type: 'email', summary: 'Site data template follow-up', detail: "Checked in on the site and client template — Sandra said she's been building it out, about 70% done. Should have it by Thursday. Confirmed discovery is still on for Monday.", created_at: daysAgo(3), event_at: daysAgo(3), user_id: user.id },
    ]),
  ])

  const [m2cfg, m2tr, m2val, m2gl] = Array.from({ length: 4 }, randomUUID)
  const [s2ac, s2ki, s2di, s2es, s2tr2, s2uts, s2rr, s2la] = Array.from({ length: 8 }, randomUUID)

  await admin.from('milestones').insert([
    { id: m2cfg, account_id: a2, name: 'Configuration', order_index: 0 },
    { id: m2tr,  account_id: a2, name: 'Training',      order_index: 1 },
    { id: m2val, account_id: a2, name: 'Validation',    order_index: 2 },
    { id: m2gl,  account_id: a2, name: 'Go-Live',       order_index: 3 },
  ])

  await admin.from('stages').insert([
    { id: s2ac,  milestone_id: m2cfg, name: 'Account Creation',   status: 'complete', order_index: 0 },
    { id: s2ki,  milestone_id: m2cfg, name: 'Kickoff',            status: 'complete', order_index: 1 },
    { id: s2di,  milestone_id: m2cfg, name: 'Discovery',          status: 'active',   order_index: 2 },
    { id: s2es,  milestone_id: m2cfg, name: 'Environment Setup',  status: 'locked',   order_index: 3 },
    { id: s2tr2, milestone_id: m2tr,  name: 'Training',           status: 'locked',   order_index: 0 },
    { id: s2uts, milestone_id: m2val, name: 'Work Order Usage',   status: 'locked',   order_index: 0 },
    { id: s2rr,  milestone_id: m2val, name: 'Readiness Review',   status: 'locked',   order_index: 1 },
    { id: s2la,  milestone_id: m2gl,  name: 'Launch',             status: 'locked',   order_index: 0 },
  ])

  await admin.from('items').insert([
    // Account Creation — all done
    { stage_id: s2ac, type: 'task', task_name: 'Add primary contacts',   task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 0 },
    { stage_id: s2ac, type: 'task', task_name: 'Select products / SKUs', task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s2ac, type: 'task', task_name: 'Set ARR',                task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s2ac, type: 'task', task_name: 'Add sales context',      task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    // Kickoff — session done, site template sent but NOT returned
    { stage_id: s2ki, type: 'session', session_name: 'Kickoff Meeting',  session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s2ki, type: 'task', task_name: 'Send Site & Client Template', task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s2ki, type: 'task', task_name: 'Return Site & Client Template',task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    // Discovery — active, nothing completed yet
    { stage_id: s2di, type: 'session', session_name: 'Discovery Meeting', session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s2di, type: 'task', task_name: 'Send Compliance & Licensing Doc',  task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    { stage_id: s2di, type: 'task', task_name: 'Return Compliance & Licensing Doc',task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    { stage_id: s2di, type: 'task', task_name: 'Send Service Categories Template', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 3 },
    { stage_id: s2di, type: 'task', task_name: 'Return Service Categories Template',task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 4 },
    { stage_id: s2di, type: 'task', task_name: 'Send Reporting Requirements Doc',  task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 5 },
    { stage_id: s2di, type: 'task', task_name: 'Return Reporting Requirements Doc',task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 6 },
    // Environment Setup — locked
    { stage_id: s2es, type: 'task', task_name: 'Upload Sites & Clients',         task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    { stage_id: s2es, type: 'task', task_name: 'Configure Service Categories',   task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    { stage_id: s2es, type: 'task', task_name: 'Set Up Report Templates (Export)',task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    { stage_id: s2es, type: 'task', task_name: 'Assign Technicians to Sites',    task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 3 },
    { stage_id: s2es, type: 'task', task_name: 'Customer reviews environment',   task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 4 },
    // Training — locked
    { stage_id: s2tr2, type: 'session', session_name: 'Admin & Field Training',   session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s2tr2, type: 'task', task_name: 'Technicians install mobile app', task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    { stage_id: s2tr2, type: 'task', task_name: 'Complete first live work orders', task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    // Work Order Usage — locked
    { stage_id: s2uts, type: 'log', task_name: 'Log daily work order submissions', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    // Readiness Review — locked
    { stage_id: s2rr, type: 'session', session_name: 'Readiness Review',           session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s2rr, type: 'task', task_name: 'Send Pre-Launch Checklist',        task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    { stage_id: s2rr, type: 'task', task_name: 'Return Pre-Launch Checklist',      task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    { stage_id: s2rr, type: 'task', task_name: 'Review Pre-Launch Checklist',      task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 3 },
    // Launch — locked
    { stage_id: s2la, type: 'task',    task_name: 'Final usage review',             task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    { stage_id: s2la, type: 'session', session_name: 'Go-Live Check-In',            session_status: 'pending', required: false, order_index: 1 },
    { stage_id: s2la, type: 'golive',  task_name: 'Go Live',                        task_done: false, required: true,  order_index: 2 },
  ])

  // ── Account 3: Summit Facilities Corp ──────────────────────────────────────
  // Facility Management, $72k ARR — Validation active but stalled (no work orders logged)
  const a3 = randomUUID()
  await admin.from('accounts').insert({
    id: a3, org_id: orgId, name: 'Summit Facilities Corp',
    sku: 'facility_management', addons: [], arr: 72000, owner_id: user.id,
    health_status: 'stalled',
    kickoff_date: dateAgo(62),
    go_live_date: daysFromNow(-4),
    sales_context: 'In-house FM team for a Fortune 500 tech campus — 1.4M sq ft, 3 buildings, 180 assets under management. Daniel (VP of Operations) signed the deal and is highly engaged. Rachel (Facilities Manager) runs day-to-day and is the actual user. Training went great but now they\'re stuck in work order validation — the techs are still calling in tickets by phone instead of using the app. Daniel is aware and frustrated. Rachel says it\'s a change management problem, not a software problem. Go-live was supposed to be last week. Need to escalate and get Daniel to mandate app usage before this slips further.',
  })

  await Promise.all([
    admin.from('contacts').insert([
      { account_id: a3, name: 'Daniel Chen', role: 'VP of Operations', email: 'dchen@summitfacilities.com', primary_contact: true },
      { account_id: a3, name: 'Rachel Kim', role: 'Facilities Manager', email: 'rachel.kim@summitfacilities.com', primary_contact: false },
    ]),
    admin.from('interactions').insert([
      { account_id: a3, type: 'meeting', summary: 'Kickoff call', detail: "Strong kickoff with Daniel and Rachel. Campus is impressive — 3 buildings, 1.4M sqft. They have a sophisticated asset list already in a CMMS that's being retired. Rachel is getting us the export. Daniel wants a phased go-live by building. Agreed to start with Building A.", created_at: daysAgo(62), event_at: daysAgo(62), user_id: user.id },
      { account_id: a3, type: 'meeting', summary: 'Discovery meeting', detail: "Thorough 3-hour session with Rachel. Asset inventory: 180 tracked assets across HVAC, electrical, plumbing, elevators. Compliance: monthly fire suppression + quarterly elevator inspections. Vendors: 6 preferred vendors with SLAs. Work orders: ~40/week. Reporting: Daniel wants an executive dashboard with PM completion rate and work order aging.", created_at: daysAgo(55), event_at: daysAgo(55), user_id: user.id },
      { account_id: a3, type: 'email', summary: 'All discovery docs returned', detail: "Rachel sent all four questionnaires within two days of discovery. Clean data — this team knows their systems. Environment setup kicked off.", created_at: daysAgo(50), event_at: daysAgo(50), user_id: user.id },
      { account_id: a3, type: 'meeting', summary: 'Admin training', detail: "Two-hour session with Rachel. She picked it up fast — work order creation, PM schedules, vendor SLA tracking, the executive dashboard. Confident she can train her techs. Scheduled technician training for next week.", created_at: daysAgo(38), event_at: daysAgo(38), user_id: user.id },
      { account_id: a3, type: 'meeting', summary: 'Technician training', detail: "Rachel ran the session with 8 technicians. Demo went well — everyone got accounts and submitted a test work order. Rachel is confident they're ready. Kicked off the work order validation phase. Agreed to log WOs in the app for 2 weeks before the readiness review.", created_at: daysAgo(28), event_at: daysAgo(28), user_id: user.id },
      { account_id: a3, type: 'call', summary: 'Validation check-in — low adoption', detail: "Called Rachel to check on work order logging. Only 8 of the expected 40+ work orders have been created in the app this week. Techs are still calling in. Rachel says it's habit — they've done it by phone for 10 years. She's going to talk to Daniel about mandating it. I suggested a 'phone-free week' challenge to break the habit. Following up with Daniel directly.", created_at: daysAgo(18), event_at: daysAgo(18), user_id: user.id },
      { account_id: a3, type: 'email', summary: 'Email to Daniel re: adoption', detail: "Sent Daniel a summary of where we are — training done, system ready, but work order adoption is behind. Shared the 8 vs 40 WO stat. Suggested he mandate app-only for new tickets starting this Monday. He replied same day — he's on it and will send an all-hands message to the tech team.", created_at: daysAgo(15), event_at: daysAgo(15), user_id: user.id },
      { account_id: a3, type: 'call', summary: 'Follow-up — still behind on adoption', detail: "Called Rachel again. Daniel sent the mandate but only 3 techs are consistently using it. Two senior techs are pushing back hardest. Rachel is going to schedule a re-training lunch next week. I'm going to flag this internally — we may need to pause the go-live date.", created_at: daysAgo(7), event_at: daysAgo(7), user_id: user.id },
    ]),
  ])

  const [m3cfg, m3tr, m3val, m3gl] = Array.from({ length: 4 }, randomUUID)
  const [s3ac, s3ki, s3di, s3es, s3at, s3tt, s3uts, s3rr, s3la] = Array.from({ length: 9 }, randomUUID)

  await admin.from('milestones').insert([
    { id: m3cfg, account_id: a3, name: 'Configuration', order_index: 0 },
    { id: m3tr,  account_id: a3, name: 'Training',      order_index: 1 },
    { id: m3val, account_id: a3, name: 'Validation',    order_index: 2 },
    { id: m3gl,  account_id: a3, name: 'Go-Live',       order_index: 3 },
  ])

  await admin.from('stages').insert([
    { id: s3ac,  milestone_id: m3cfg, name: 'Account Creation',   status: 'complete', order_index: 0 },
    { id: s3ki,  milestone_id: m3cfg, name: 'Kickoff',            status: 'complete', order_index: 1 },
    { id: s3di,  milestone_id: m3cfg, name: 'Discovery',          status: 'complete', order_index: 2 },
    { id: s3es,  milestone_id: m3cfg, name: 'Environment Setup',  status: 'complete', order_index: 3 },
    { id: s3at,  milestone_id: m3tr,  name: 'Admin Training',     status: 'complete', order_index: 0 },
    { id: s3tt,  milestone_id: m3tr,  name: 'Technician Training',status: 'complete', order_index: 1 },
    { id: s3uts, milestone_id: m3val, name: 'Work Order Usage',   status: 'active',   order_index: 0 },
    { id: s3rr,  milestone_id: m3val, name: 'Readiness Review',   status: 'locked',   order_index: 1 },
    { id: s3la,  milestone_id: m3gl,  name: 'Launch',             status: 'locked',   order_index: 0 },
  ])

  await admin.from('items').insert([
    // Account Creation — all done
    { stage_id: s3ac, type: 'task', task_name: 'Add primary contacts',    task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 0 },
    { stage_id: s3ac, type: 'task', task_name: 'Select products / SKUs',  task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s3ac, type: 'task', task_name: 'Set ARR',                 task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s3ac, type: 'task', task_name: 'Add sales context',       task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    // Kickoff — all done
    { stage_id: s3ki, type: 'session', session_name: 'Kickoff Meeting',   session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s3ki, type: 'task', task_name: 'Send Asset & Building Template', task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s3ki, type: 'task', task_name: 'Return Asset & Building Template',task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    // Discovery — all done
    { stage_id: s3di, type: 'session', session_name: 'Discovery Meeting', session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s3di, type: 'task', task_name: 'Send Compliance Schedule Doc',  task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s3di, type: 'task', task_name: 'Return Compliance Schedule Doc',task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s3di, type: 'task', task_name: 'Send Vendor SLA Template',      task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    { stage_id: s3di, type: 'task', task_name: 'Return Vendor SLA Template',    task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 4 },
    { stage_id: s3di, type: 'task', task_name: 'Send Reporting Requirements Doc',   task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 5 },
    { stage_id: s3di, type: 'task', task_name: 'Return Reporting Requirements Doc', task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 6 },
    // Environment Setup — all done
    { stage_id: s3es, type: 'task', task_name: 'Upload Buildings & Assets',    task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 0 },
    { stage_id: s3es, type: 'task', task_name: 'Configure PM Schedules',       task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s3es, type: 'task', task_name: 'Set Up Vendor Profiles & SLAs',task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    { stage_id: s3es, type: 'task', task_name: 'Configure Compliance Flows',   task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 3 },
    { stage_id: s3es, type: 'task', task_name: 'Build Executive Dashboard',    task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true,  order_index: 4 },
    { stage_id: s3es, type: 'task', task_name: 'Customer reviews environment', task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 5 },
    // Admin Training — complete
    { stage_id: s3at, type: 'session', session_name: 'Admin Training',         session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s3at, type: 'task', task_name: 'Admin completes setup checklist', task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    // Technician Training — complete
    { stage_id: s3tt, type: 'session', session_name: 'Technician Training',    session_status: 'complete', required: true,  order_index: 0 },
    { stage_id: s3tt, type: 'task', task_name: 'Technicians install mobile app',task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 1 },
    { stage_id: s3tt, type: 'task', task_name: 'Techs submit test work orders', task_assignee: 'customer', task_source: 'plan', task_done: true,  required: true,  order_index: 2 },
    // Work Order Usage — active, STUCK
    { stage_id: s3uts, type: 'log', task_name: 'Log daily work order submissions (target: 40/week)', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    // Readiness Review — locked
    { stage_id: s3rr, type: 'session', session_name: 'Readiness Review',        session_status: 'pending', required: true,  order_index: 0 },
    { stage_id: s3rr, type: 'task', task_name: 'Send Pre-Launch Checklist',     task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 1 },
    { stage_id: s3rr, type: 'task', task_name: 'Return Pre-Launch Checklist',   task_assignee: 'customer', task_source: 'plan', task_done: false, required: true,  order_index: 2 },
    { stage_id: s3rr, type: 'task', task_name: 'Review Pre-Launch Checklist',   task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 3 },
    // Launch — locked
    { stage_id: s3la, type: 'task',    task_name: 'Final usage review',          task_assignee: 'personal', task_source: 'plan', task_done: false, required: true,  order_index: 0 },
    { stage_id: s3la, type: 'session', session_name: 'Go-Live Check-In',         session_status: 'pending', required: false, order_index: 1 },
    { stage_id: s3la, type: 'golive',  task_name: 'Go Live',                     task_done: false, required: true,  order_index: 2 },
  ])

  return NextResponse.json({ ok: true })
}
