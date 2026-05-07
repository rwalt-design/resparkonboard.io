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

  // Idempotent — but backfill missing seed data for existing demo orgs
  const { data: existingMember } = await admin
    .from('org_members').select('id, org_id').eq('user_id', user.id).single()
  if (existingMember) {
    const now = Date.now()
    const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString()

    const { data: abc } = await admin
      .from('accounts').select('id').eq('org_id', existingMember.org_id).eq('name', 'ABC Iron & Metal').single()

    if (abc) {
      // Backfill interactions if missing
      const { count: intCount } = await admin
        .from('interactions').select('*', { count: 'exact', head: true }).eq('account_id', abc.id)
      if (!intCount || intCount < 4) {
        await admin.from('interactions').insert([
          { account_id: abc.id, type: 'meeting', user_id: user.id,
            summary: 'Kickoff session',
            detail: 'Dave, Linda, and Marcus all joined. Dave came prepared with a printed list of questions. Walked through the full onboarding plan milestone by milestone. Sent the Data Template and Pre-Work Form during the call. Dave mentioned he wants drivers using the mobile app before the 4th of July weekend — that\'s our hard target.',
            created_at: daysAgo(36), event_at: daysAgo(36) },
          { account_id: abc.id, type: 'email', user_id: user.id,
            summary: 'Data Template and Pre-Work Form received',
            detail: 'Linda returned the data template — 14 trucks, 3 yards, 22 commodity grades, 6 regular vendors. Marcus returned the pre-work form. One note: they run a "provisional payment" hold for copper loads over 500 lbs. Flagged for custom workflow.',
            created_at: daysAgo(29), event_at: daysAgo(29) },
          { account_id: abc.id, type: 'meeting', user_id: user.id,
            summary: 'Discovery session',
            detail: 'Two hours with Linda and Marcus. Key findings: split loads (multi-line tickets), QuickBooks Desktop connector, Gary scale API integration. Sent exported onboarding plan to Dave after the call.',
            created_at: daysAgo(28), event_at: daysAgo(28) },
          { account_id: abc.id, type: 'email', user_id: user.id,
            summary: 'Environment setup complete',
            detail: 'Confirmed with Linda: all 3 yards loaded, 14 trucks configured, 22 commodity grades live, QB Desktop connector running. Custom workflow for copper provisional holds in review.',
            created_at: daysAgo(18), event_at: daysAgo(18) },
          { account_id: abc.id, type: 'meeting', user_id: user.id,
            summary: 'Pre-Transaction training complete',
            detail: 'Covered commodity prices, vendor profiles, user permissions, yard open/close checklist. Linda is sharp. Marcus asked about walk-in customers. Moved to Transacting training next.',
            created_at: daysAgo(12), event_at: daysAgo(12) },
          { account_id: abc.id, type: 'call', user_id: user.id,
            summary: 'Transacting training check-in',
            detail: 'Quick call with Linda. All 9 driver accounts active, mobile app installed. Marcus did a dry run — drivers got through a full ticket in under 3 minutes. Ready for today\'s session.',
            created_at: daysAgo(3), event_at: daysAgo(3) },
        ])
      }

      // Backfill open_tasks if missing
      const { count: taskCount } = await admin
        .from('open_tasks').select('*', { count: 'exact', head: true }).eq('account_id', abc.id)
      if (!taskCount || taskCount < 3) {
        await admin.from('open_tasks').insert([
          { account_id: abc.id, name: 'Schedule Transacting training session with Linda and Marcus',
            assignee: 'personal', source: 'email', done: false,
            notes: 'Linda replied confirming both she and Marcus are available Tuesday or Thursday afternoon.',
            item_type: 'task', item_owner: 'respark', item_status: 'open', created_at: daysAgo(2) },
          { account_id: abc.id, name: 'Send multi-line ticket walkthrough guide to Marcus before training',
            assignee: 'personal', source: 'email', done: false,
            notes: 'Marcus flagged this as their most complex transaction type — he wants reference material ahead of the session.',
            item_type: 'task', item_owner: 'respark', item_status: 'open', created_at: daysAgo(3) },
          { account_id: abc.id, name: 'Confirm July 4th go-live target with Dave — assess if timeline is still realistic',
            assignee: 'personal', source: 'email', done: false,
            notes: 'Dave set this as a hard target on the kickoff call. With Transacting training still pending, need to validate the date holds.',
            item_type: 'task', item_owner: 'respark', item_status: 'open', created_at: daysAgo(3) },
          { account_id: abc.id, name: 'Copper provisional hold workflow — get Marcus sign-off on final logic',
            assignee: 'customer', source: 'email', done: false,
            notes: 'Custom workflow for copper loads over 500 lbs is built. Marcus approved verbally but hasn\'t confirmed in writing.',
            item_type: 'dependency', item_owner: 'customer', item_status: 'waiting', created_at: daysAgo(5) },
        ])
      }

      // Backfill Lakeshore Auto Parts if missing
      const { data: ls } = await admin
        .from('accounts').select('id').eq('org_id', existingMember.org_id).eq('name', 'Lakeshore Auto Parts').single()
      if (!ls) {
        await seedLakeshoreAccount(admin, existingMember.org_id, user.id, now)
      }
    }

    return NextResponse.json({ ok: true, already: true, user_id: user.id })
  }

  // ── Create org + member ──
  const orgId = randomUUID()
  await admin.from('organizations').insert({ id: orgId, name: 'Demo Org' })
  await admin.from('org_members').insert({
    org_id: orgId, user_id: user.id,
    name: 'Demo User', role: 'manager',
  })

  const now = Date.now()
  const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString()
  const daysFromNow = (d: number) => new Date(now + d * 86400000).toISOString().split('T')[0]
  const dateAgo = (d: number) => new Date(now - d * 86400000).toISOString().split('T')[0]

  // ── Training templates ────────────────────────────────────────────────────
  await admin.from('training_templates').insert([
    { org_id: orgId, name: 'Pre Transaction',  triggers: ['facility_management'], duration_minutes: 60,
      description: 'Setting commodity prices, creating vendor profiles, managing user permissions, and running the daily open/close yard checklist.' },
    { org_id: orgId, name: 'Transacting',      triggers: ['facility_management'], duration_minutes: 90,
      description: 'End-to-end transaction flow: scale ticket creation, multi-line tickets, mobile app for drivers, and the ticket-to-invoice workflow.' },
    { org_id: orgId, name: 'Post Transaction', triggers: ['facility_management'], duration_minutes: 60,
      description: 'Reporting, end-of-day reconciliation, payment processing, QuickBooks sync verification, and compliance manifest generation.' },
  ])

  // ── Plan template: Facility Management Standard ───────────────────────────
  await admin.from('plan_templates').insert({
    org_id: orgId,
    name: 'Facility Management Standard',
    description: 'Full onboarding plan for Facility Management accounts — Configuration → Training → Validation → Go-Live.',
    sku: 'facility_management',
    is_default: true,
    structure: {
      milestones: [
        {
          name: 'Configuration',
          stages: [
            {
              name: 'Account Creation',
              items: [
                { type: 'task', name: 'Add primary contacts',   assignee: 'personal', required: true },
                { type: 'task', name: 'Select products / SKUs', assignee: 'personal', required: true },
                { type: 'task', name: 'Set ARR',                assignee: 'personal', required: true },
                { type: 'task', name: 'Add sales context',      assignee: 'personal', required: true },
              ],
            },
            {
              name: 'Kickoff',
              items: [
                { type: 'session',  name: 'Kickoff',                         required: true },
                { type: 'exchange', name: 'Data Template',                   required: true },
                { type: 'exchange', name: 'Pre-Work Form',                   required: true },
                { type: 'task',     name: 'Update Plan w Pre-Work Results',  assignee: 'personal', required: true },
                { type: 'task',     name: 'Set Up Sandbox Environment',      assignee: 'personal', required: true },
                { type: 'task',     name: 'Add Users',                       assignee: 'personal', required: true },
              ],
            },
            {
              name: 'Discovery',
              items: [
                { type: 'session', name: 'Discovery',                     required: true },
                { type: 'task',    name: 'Send Exported Onboarding Plan', assignee: 'personal', required: true },
              ],
            },
            {
              name: 'Environment Setup',
              items: [
                { type: 'task', name: 'Upload Data',             assignee: 'personal', required: true },
                { type: 'task', name: 'Integrate Hardware',      assignee: 'personal', required: true },
                { type: 'task', name: 'Set Up Compliance Flows', assignee: 'personal', required: true },
                { type: 'task', name: 'Integrate Accounting',    assignee: 'personal', required: true },
                { type: 'task', name: 'Custom Workflow Setup',   assignee: 'personal', required: false },
              ],
            },
          ],
        },
        {
          // Stages are replaced at apply-time by training templates matching the SKU
          name: 'Training',
          stages: [],
        },
        {
          name: 'Validation',
          stages: [
            {
              name: 'User Testing',
              items: [
                { type: 'log', name: 'Daily Ticket Usage', required: true },
              ],
            },
            {
              name: 'Readiness Review',
              items: [
                { type: 'session',  name: 'Q&A Session',                required: true },
                { type: 'exchange', name: 'Pre-Launch Checklist',        required: true },
                { type: 'task',     name: 'Review Pre-Launch Checklist', assignee: 'personal', required: true },
                { type: 'task',     name: 'Outstanding Item Clean Up',   assignee: 'personal', required: true },
              ],
            },
          ],
        },
        {
          name: 'Go-Live',
          stages: [
            {
              name: 'Launch',
              items: [
                { type: 'task', name: 'Usage Review', assignee: 'personal', required: true },
              ],
            },
            {
              name: 'Post Launch',
              items: [
                { type: 'session', name: 'Post-Launch Check-In', required: true },
                { type: 'task',    name: 'Build Handoff Doc',    assignee: 'personal', required: true },
                { type: 'task',    name: 'Handoff to CSM',        assignee: 'personal', required: true },
              ],
            },
          ],
        },
      ],
    },
  })

  // ── ABC Iron & Metal ───────────────────────────────────────────────────────
  // Facility Management SKU, $54k ARR
  // State: Configuration complete · Training in progress (Transacting stage active)
  const a1 = randomUUID()
  await admin.from('accounts').insert({
    id: a1, org_id: orgId, name: 'ABC Iron & Metal',
    sku: 'facility_management', addons: [], arr: 54000, owner_id: user.id,
    health_status: 'active',
    kickoff_date: dateAgo(36),
    go_live_date: daysFromNow(22),
    sales_context: 'Full-service scrap metal recycler operating 3 yards — main yard in Gary, IN plus two feeder yards in Hammond and East Chicago. Processing ferrous and non-ferrous: steel, aluminum, copper, brass. Fleet of 14 roll-off trucks and 6 flatbeds for industrial pickups. Currently running dispatch and ticketing out of a whiteboard and paper tickets — weights are recorded by hand and entered into QuickBooks at end of day, causing constant billing lag and disputes. Dave (Owner/GM) closed after seeing a demo at the ISRi conference. Linda handles all office operations and will be the primary user. Key pain points: no driver accountability, no real-time weight capture, billing errors on multi-load days. Competitor was ScrapWare; we won on mobile app usability and the ticket-to-invoice flow.',
  })

  await Promise.all([
    admin.from('contacts').insert([
      { account_id: a1, name: 'Dave Kowalski', role: 'Owner / General Manager', email: 'dave@abcironmetal.com', primary_contact: true },
      { account_id: a1, name: 'Linda Reyes', role: 'Office Manager', email: 'linda@abcironmetal.com', primary_contact: false },
      { account_id: a1, name: 'Marcus Thompson', role: 'Yard Supervisor', email: 'marcus.t@abcironmetal.com', primary_contact: false },
    ]),
    admin.from('interactions').insert([
      {
        account_id: a1, type: 'meeting',
        summary: 'Kickoff session',
        detail: 'Dave, Linda, and Marcus all joined. Dave came in with a printed list of questions — very prepared. Walked through the full onboarding plan milestone by milestone. Sent the Data Template and Pre-Work Form during the call. Linda is going to pull their commodity price sheet and truck list for the data template; Marcus will fill out the pre-work form covering yard layout and workflow specifics. Set discovery for next Wednesday. Dave mentioned he wants drivers using the mobile app before the 4th of July weekend — that\'s our hard target.',
        created_at: daysAgo(36), event_at: daysAgo(36), user_id: user.id,
      },
      {
        account_id: a1, type: 'email',
        summary: 'Data Template and Pre-Work Form received',
        detail: 'Linda returned the data template — 14 trucks, 3 yards, 22 commodity grades, 6 regular vendors. Clean. Marcus returned the pre-work form covering their 3-step intake flow (scale ticket → grading → payment). One note: they run a "provisional payment" hold for copper loads over 500 lbs until assay confirms grade. Flagged for custom workflow.',
        created_at: daysAgo(29), event_at: daysAgo(29), user_id: user.id,
      },
      {
        account_id: a1, type: 'meeting',
        summary: 'Discovery session',
        detail: 'Two hours with Linda and Marcus. Walked through their full transaction flow end to end. Key findings: they run split loads (one truck, multiple commodity types per ticket), which needs the multi-line ticket feature. Compliance: quarterly EPA waste manifests + ISRI grading standards. Hardware: existing scale at Gary yard needs API integration; Hammond and East Chicago are manual entry for now. Accounting: QuickBooks Desktop (not Online) — confirmed the QB Desktop connector is compatible. Sent the exported onboarding plan to Dave after the call.',
        created_at: daysAgo(28), event_at: daysAgo(28), user_id: user.id,
      },
      {
        account_id: a1, type: 'email',
        summary: 'Environment setup complete',
        detail: 'Confirmed with Linda: all 3 yards loaded, 14 trucks configured, 22 commodity grades live with their pricing tiers, 6 vendor profiles set up, QB Desktop connector running and syncing. The Gary scale integration tested clean — weight pulls directly into the ticket. Custom workflow for copper provisional holds is in review; Marcus approved the logic yesterday. User accounts created for Linda, Marcus, and 9 drivers.',
        created_at: daysAgo(18), event_at: daysAgo(18), user_id: user.id,
      },
      {
        account_id: a1, type: 'meeting',
        summary: 'Pre-Transaction training complete',
        detail: 'Covered everything before a transaction starts: setting commodity prices, creating vendor profiles, managing user permissions, running the daily open/close yard checklist. Linda is sharp — she had the price update workflow down after one walkthrough. Marcus asked good questions about how to handle walk-in customers who aren\'t in the system yet (quick-add flow). Moved to Transacting training next.',
        created_at: daysAgo(12), event_at: daysAgo(12), user_id: user.id,
      },
      {
        account_id: a1, type: 'call',
        summary: 'Transacting training check-in',
        detail: "Quick call with Linda before today's training session. All 9 driver accounts confirmed active and drivers have the mobile app installed. Marcus did a dry run with two drivers this morning — they got through a full ticket in under 3 minutes. Linda wants to make sure the multi-line ticket flow is covered in detail today since that's their most common transaction type. Good momentum going into the session.",
        created_at: daysAgo(3), event_at: daysAgo(3), user_id: user.id,
      },
    ]),
  ])

  // ── IDs ───────────────────────────────────────────────────────────────────
  const [mCfg, mTr, mVal, mGl] = Array.from({ length: 4 }, randomUUID)
  // Configuration stages
  const [sAc, sKi, sDi, sEs] = Array.from({ length: 4 }, randomUUID)
  // Training stages (Pre Transaction, Transacting, Post Transaction)
  const [sPre, sTx, sPost] = Array.from({ length: 3 }, randomUUID)
  // Validation stages
  const [sUt, sRr] = Array.from({ length: 2 }, randomUUID)
  // Go-Live stages
  const [sLaunch, sPostLaunch] = Array.from({ length: 2 }, randomUUID)

  await admin.from('milestones').insert([
    { id: mCfg, account_id: a1, name: 'Configuration', order_index: 0 },
    { id: mTr,  account_id: a1, name: 'Training',      order_index: 1 },
    { id: mVal, account_id: a1, name: 'Validation',    order_index: 2 },
    { id: mGl,  account_id: a1, name: 'Go-Live',       order_index: 3 },
  ])

  await admin.from('stages').insert([
    // Configuration — all complete
    { id: sAc,       milestone_id: mCfg, name: 'Account Creation',  status: 'complete', order_index: 0 },
    { id: sKi,       milestone_id: mCfg, name: 'Kickoff',           status: 'complete', order_index: 1 },
    { id: sDi,       milestone_id: mCfg, name: 'Discovery',         status: 'complete', order_index: 2 },
    { id: sEs,       milestone_id: mCfg, name: 'Environment Setup', status: 'complete', order_index: 3 },
    // Training — Pre Transaction done, Transacting active, Post Transaction locked
    { id: sPre,      milestone_id: mTr,  name: 'Pre Transaction',   status: 'complete', order_index: 0 },
    { id: sTx,       milestone_id: mTr,  name: 'Transacting',       status: 'active',   order_index: 1 },
    { id: sPost,     milestone_id: mTr,  name: 'Post Transaction',  status: 'locked',   order_index: 2 },
    // Validation — locked
    { id: sUt,       milestone_id: mVal, name: 'User Testing',      status: 'locked',   order_index: 0 },
    { id: sRr,       milestone_id: mVal, name: 'Readiness Review',  status: 'locked',   order_index: 1 },
    // Go-Live — locked
    { id: sLaunch,     milestone_id: mGl, name: 'Launch',      status: 'locked', order_index: 0 },
    { id: sPostLaunch, milestone_id: mGl, name: 'Post Launch', status: 'locked', order_index: 1 },
  ])

  await admin.from('items').insert([
    // ── Account Creation (complete) ──────────────────────────────────────────
    { stage_id: sAc, type: 'task', task_name: 'Add primary contacts',   task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 0 },
    { stage_id: sAc, type: 'task', task_name: 'Select products / SKUs', task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 1 },
    { stage_id: sAc, type: 'task', task_name: 'Set ARR',                task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 2 },
    { stage_id: sAc, type: 'task', task_name: 'Add sales context',      task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 3 },

    // ── Kickoff (complete) ───────────────────────────────────────────────────
    { stage_id: sKi, type: 'session', session_name: 'Kickoff',                  session_status: 'complete', required: true, order_index: 0 },
    // EXCHANGE: Data Template → Send + Return
    { stage_id: sKi, type: 'task', task_name: 'Send Data Template',             task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 1 },
    { stage_id: sKi, type: 'task', task_name: 'Return Data Template',           task_assignee: 'customer', task_source: 'plan', task_done: true, required: true, order_index: 2 },
    // EXCHANGE: Pre-Work Form → Send + Return
    { stage_id: sKi, type: 'task', task_name: 'Send Pre-Work Form',             task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 3 },
    { stage_id: sKi, type: 'task', task_name: 'Return Pre-Work Form',           task_assignee: 'customer', task_source: 'plan', task_done: true, required: true, order_index: 4 },
    { stage_id: sKi, type: 'task', task_name: 'Update Plan w Pre-Work Results', task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 5 },
    { stage_id: sKi, type: 'task', task_name: 'Set Up Sandbox Environment',     task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 6 },
    { stage_id: sKi, type: 'task', task_name: 'Add Users',                      task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 7 },

    // ── Discovery (complete) ─────────────────────────────────────────────────
    { stage_id: sDi, type: 'session', session_name: 'Discovery',                session_status: 'complete', required: true, order_index: 0 },
    { stage_id: sDi, type: 'task', task_name: 'Send Exported Onboarding Plan',  task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 1 },

    // ── Environment Setup (complete) ─────────────────────────────────────────
    { stage_id: sEs, type: 'task', task_name: 'Upload Data',             task_assignee: 'personal', task_source: 'plan', task_done: true, required: true,  order_index: 0 },
    { stage_id: sEs, type: 'task', task_name: 'Integrate Hardware',      task_assignee: 'personal', task_source: 'plan', task_done: true, required: true,  order_index: 1 },
    { stage_id: sEs, type: 'task', task_name: 'Set Up Compliance Flows', task_assignee: 'personal', task_source: 'plan', task_done: true, required: true,  order_index: 2 },
    { stage_id: sEs, type: 'task', task_name: 'Integrate Accounting',    task_assignee: 'personal', task_source: 'plan', task_done: true, required: true,  order_index: 3 },
    { stage_id: sEs, type: 'task', task_name: 'Custom Workflow Setup',   task_assignee: 'personal', task_source: 'plan', task_done: true, required: false, order_index: 4 },

    // ── Pre Transaction training (complete) ──────────────────────────────────
    { stage_id: sPre, type: 'session', session_name: 'Pre Transaction', session_status: 'complete', required: true, order_index: 0 },

    // ── Transacting training (active) ────────────────────────────────────────
    { stage_id: sTx, type: 'session', session_name: 'Transacting', session_status: 'pending', required: true, order_index: 0 },

    // ── Post Transaction training (locked) ───────────────────────────────────
    { stage_id: sPost, type: 'session', session_name: 'Post Transaction', session_status: 'pending', required: true, order_index: 0 },

    // ── User Testing (locked) ────────────────────────────────────────────────
    { stage_id: sUt, type: 'log', task_name: 'Daily Ticket Usage', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 0 },

    // ── Readiness Review (locked) ────────────────────────────────────────────
    { stage_id: sRr, type: 'session', session_name: 'Q&A Session',                  session_status: 'pending', required: true, order_index: 0 },
    // EXCHANGE: Pre-Launch Checklist → Send + Return
    { stage_id: sRr, type: 'task', task_name: 'Send Pre-Launch Checklist',          task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 1 },
    { stage_id: sRr, type: 'task', task_name: 'Return Pre-Launch Checklist',        task_assignee: 'customer', task_source: 'plan', task_done: false, required: true, order_index: 2 },
    { stage_id: sRr, type: 'task', task_name: 'Review Pre-Launch Checklist',        task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 3 },
    { stage_id: sRr, type: 'task', task_name: 'Outstanding Item Clean Up',          task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 4 },

    // ── Launch (locked) ──────────────────────────────────────────────────────
    { stage_id: sLaunch, type: 'task', task_name: 'Usage Review', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 0 },

    // ── Post Launch (locked) ─────────────────────────────────────────────────
    { stage_id: sPostLaunch, type: 'session', session_name: 'Post-Launch Check-In', session_status: 'pending', required: true, order_index: 0 },
    { stage_id: sPostLaunch, type: 'task', task_name: 'Build Handoff Doc',          task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 1 },
    { stage_id: sPostLaunch, type: 'task', task_name: 'Handoff to CSM',              task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 2 },
  ])

  // ── Action Items (accepted AI suggestions) ────────────────────────────────
  await admin.from('open_tasks').insert([
    {
      account_id: a1,
      name: 'Schedule Transacting training session with Linda and Marcus',
      assignee: 'personal', source: 'email', done: false,
      notes: 'Linda replied confirming both she and Marcus are available Tuesday or Thursday afternoon this week.',
      item_type: 'task', item_owner: 'respark', item_status: 'open',
      created_at: daysAgo(2),
    },
    {
      account_id: a1,
      name: 'Send multi-line ticket walkthrough guide to Marcus before training',
      assignee: 'personal', source: 'email', done: false,
      notes: 'Marcus flagged this as their most complex transaction type — he wants reference material ahead of the session.',
      item_type: 'task', item_owner: 'respark', item_status: 'open',
      created_at: daysAgo(3),
    },
    {
      account_id: a1,
      name: 'Confirm July 4th go-live target with Dave — assess if timeline is still realistic',
      assignee: 'personal', source: 'email', done: false,
      notes: 'Dave set this as a hard target on the kickoff call. With Transacting training still pending, need to validate the date holds.',
      item_type: 'task', item_owner: 'respark', item_status: 'open',
      created_at: daysAgo(3),
    },
    {
      account_id: a1,
      name: 'Copper provisional hold workflow — get Marcus sign-off on final logic',
      assignee: 'customer', source: 'email', done: false,
      notes: 'Custom workflow for copper loads over 500 lbs is built. Marcus approved the logic verbally but hasn\'t confirmed in writing.',
      item_type: 'dependency', item_owner: 'customer', item_status: 'waiting',
      created_at: daysAgo(5),
    },
  ])

  // ── Lakeshore Auto Parts ──────────────────────────────────────────────────
  await seedLakeshoreAccount(admin, orgId, user.id, now)

  return NextResponse.json({ ok: true, user_id: user.id })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedLakeshoreAccount(admin: any, orgId: string, userId: string, now: number) {
  const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString()
  const daysFromNow = (d: number) => new Date(now + d * 86400000).toISOString().split('T')[0]
  const dateAgo = (d: number) => new Date(now - d * 86400000).toISOString().split('T')[0]

  const a2 = randomUUID()
  await admin.from('accounts').insert({
    id: a2, org_id: orgId, name: 'Lakeshore Auto Parts',
    sku: 'dispatch', addons: [], arr: 28000, owner_id: userId,
    health_status: 'active',
    kickoff_date: dateAgo(14),
    go_live_date: daysFromNow(46),
    sales_context: 'Regional auto parts distributor running 4 delivery routes out of a single warehouse in Kenosha, WI. Currently scheduling all pickups and deliveries via phone calls and a whiteboard — dispatcher writes everything by hand, drivers get verbal instructions. Fleet of 9 vans and 3 box trucks. Michael (Operations Director) closed after seeing a case study from a similar parts distributor. Pain points: no real-time driver tracking, constant dispatch confusion on multi-stop routes, and no proof-of-delivery for warranty claims. Rachel handles billing and will be secondary user on the office side.',
  })

  await Promise.all([
    admin.from('contacts').insert([
      { account_id: a2, name: 'Michael Chen',  role: 'Operations Director', email: 'michael@lakeshoreparts.com', primary_contact: true },
      { account_id: a2, name: 'Rachel Kim',    role: 'Office Manager',      email: 'rachel@lakeshoreparts.com',  primary_contact: false },
    ]),
    admin.from('interactions').insert([
      {
        account_id: a2, type: 'meeting', user_id: userId,
        summary: 'Kickoff session',
        detail: 'Michael and Rachel both joined. Walked through the onboarding plan — Michael is very engaged, asked smart questions about route optimization and the driver mobile app. Sent the Data Template and Pre-Work Form during the call. Rachel will handle the data template (vehicle list, customer addresses); Michael will fill out the pre-work form. Discovery call scheduled for next week. Michael wants to be live before their summer peak season ramps up in mid-June.',
        created_at: daysAgo(14), event_at: daysAgo(14),
      },
      {
        account_id: a2, type: 'email', user_id: userId,
        summary: 'Pre-Work Form question from Michael',
        detail: 'Michael asked for clarification on the route structure section of the pre-work form — specifically whether "route" means a daily schedule or a recurring zone. Replied explaining both options and recommended zone-based routes given their 4 regular service areas. Michael confirmed zone-based is correct and said he\'ll have the form back by end of week.',
        created_at: daysAgo(7), event_at: daysAgo(7),
      },
    ]),
  ])

  // Milestones and stages
  const [mCfg, mTr, mVal, mGl] = Array.from({ length: 4 }, randomUUID)
  const [sAc, sKi, sDi, sEs] = Array.from({ length: 4 }, randomUUID)
  const [sTrain] = Array.from({ length: 1 }, randomUUID)
  const [sUt, sRr] = Array.from({ length: 2 }, randomUUID)
  const [sLaunch, sPostLaunch] = Array.from({ length: 2 }, randomUUID)

  await admin.from('milestones').insert([
    { id: mCfg, account_id: a2, name: 'Configuration', order_index: 0 },
    { id: mTr,  account_id: a2, name: 'Training',      order_index: 1 },
    { id: mVal, account_id: a2, name: 'Validation',    order_index: 2 },
    { id: mGl,  account_id: a2, name: 'Go-Live',       order_index: 3 },
  ])

  await admin.from('stages').insert([
    { id: sAc,       milestone_id: mCfg, name: 'Account Creation', status: 'complete', order_index: 0 },
    { id: sKi,       milestone_id: mCfg, name: 'Kickoff',          status: 'complete', order_index: 1 },
    { id: sDi,       milestone_id: mCfg, name: 'Discovery',        status: 'active',   order_index: 2 },
    { id: sEs,       milestone_id: mCfg, name: 'Environment Setup',status: 'locked',   order_index: 3 },
    { id: sTrain,    milestone_id: mTr,  name: 'Dispatch Training', status: 'locked',   order_index: 0 },
    { id: sUt,       milestone_id: mVal, name: 'User Testing',     status: 'locked',   order_index: 0 },
    { id: sRr,       milestone_id: mVal, name: 'Readiness Review', status: 'locked',   order_index: 1 },
    { id: sLaunch,     milestone_id: mGl, name: 'Launch',      status: 'locked', order_index: 0 },
    { id: sPostLaunch, milestone_id: mGl, name: 'Post Launch', status: 'locked', order_index: 1 },
  ])

  await admin.from('items').insert([
    { stage_id: sAc, type: 'task', task_name: 'Add primary contacts',   task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 0 },
    { stage_id: sAc, type: 'task', task_name: 'Select products / SKUs', task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 1 },
    { stage_id: sAc, type: 'task', task_name: 'Set ARR',                task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 2 },
    { stage_id: sAc, type: 'task', task_name: 'Add sales context',      task_assignee: 'personal', task_source: 'plan', task_done: true, required: true, order_index: 3 },
    { stage_id: sKi, type: 'session', session_name: 'Kickoff', session_status: 'complete', required: true, order_index: 0 },
    { stage_id: sKi, type: 'task', task_name: 'Send Data Template',             task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true, order_index: 1 },
    { stage_id: sKi, type: 'task', task_name: 'Return Data Template',           task_assignee: 'customer', task_source: 'plan', task_done: false, required: true, order_index: 2 },
    { stage_id: sKi, type: 'task', task_name: 'Send Pre-Work Form',             task_assignee: 'personal', task_source: 'plan', task_done: true,  required: true, order_index: 3 },
    { stage_id: sKi, type: 'task', task_name: 'Return Pre-Work Form',           task_assignee: 'customer', task_source: 'plan', task_done: false, required: true, order_index: 4 },
    { stage_id: sKi, type: 'task', task_name: 'Update Plan w Pre-Work Results', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 5 },
    { stage_id: sKi, type: 'task', task_name: 'Set Up Sandbox Environment',     task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 6 },
    { stage_id: sKi, type: 'task', task_name: 'Add Users',                      task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 7 },
    { stage_id: sDi, type: 'session', session_name: 'Discovery', session_status: 'pending', required: true, order_index: 0 },
    { stage_id: sDi, type: 'task', task_name: 'Send Exported Onboarding Plan', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 1 },
    { stage_id: sEs, type: 'task', task_name: 'Upload Data',             task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 0 },
    { stage_id: sEs, type: 'task', task_name: 'Set Up Compliance Flows', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 1 },
    { stage_id: sEs, type: 'task', task_name: 'Integrate Accounting',    task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 2 },
    { stage_id: sTrain, type: 'session', session_name: 'Dispatch Training', session_status: 'pending', required: true, order_index: 0 },
    { stage_id: sUt, type: 'log', task_name: 'Daily Route Usage', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 0 },
    { stage_id: sRr, type: 'session', session_name: 'Q&A Session', session_status: 'pending', required: true, order_index: 0 },
    { stage_id: sRr, type: 'task', task_name: 'Review Pre-Launch Checklist', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 1 },
    { stage_id: sLaunch,     type: 'task', task_name: 'Usage Review',       task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 0 },
    { stage_id: sPostLaunch, type: 'session', session_name: 'Post-Launch Check-In', session_status: 'pending', required: true, order_index: 0 },
    { stage_id: sPostLaunch, type: 'task', task_name: 'Build Handoff Doc', task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 1 },
    { stage_id: sPostLaunch, type: 'task', task_name: 'Handoff to CSM',    task_assignee: 'personal', task_source: 'plan', task_done: false, required: true, order_index: 2 },
  ])

  await admin.from('open_tasks').insert([
    {
      account_id: a2,
      name: 'Follow up with Michael on Pre-Work Form — due end of week',
      assignee: 'personal', source: 'email', done: false,
      notes: 'Michael confirmed zone-based routing and said he\'d have the form back by end of week. No response yet.',
      item_type: 'task', item_owner: 'respark', item_status: 'open',
      created_at: daysAgo(7),
    },
    {
      account_id: a2,
      name: 'Pre-Work Form — Michael to complete and return',
      assignee: 'customer', source: 'email', done: false,
      notes: 'Confirmed zone-based routing structure. Michael said he would return by end of week.',
      item_type: 'dependency', item_owner: 'customer', item_status: 'waiting',
      created_at: daysAgo(7),
    },
  ])
}
