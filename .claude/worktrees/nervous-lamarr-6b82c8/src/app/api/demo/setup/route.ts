import { createAdminClient } from '@/lib/supabase/admin'
import { seedSampleAccountsIfNeeded } from '@/lib/seedSampleAccounts'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  const admin = createAdminClient()

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Idempotent — backfill any missing seed data for existing demo orgs
  const { data: existingMember } = await admin
    .from('org_members').select('id, org_id').eq('user_id', user.id).single()
  if (existingMember) {
    await seedSampleAccountsIfNeeded(admin, existingMember.org_id, user.id)
    return NextResponse.json({ ok: true, already: true, user_id: user.id })
  }

  // ── Create org + member ──
  const orgId = randomUUID()
  await admin.from('organizations').insert({ id: orgId, name: 'Demo Org' })
  await admin.from('org_members').insert({
    org_id: orgId, user_id: user.id,
    name: 'Demo User', role: 'manager',
  })

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
                { type: 'task',    name: 'Handoff to CSM',       assignee: 'personal', required: true },
              ],
            },
          ],
        },
      ],
    },
  })

  // ── Sample accounts ───────────────────────────────────────────────────────
  await seedSampleAccountsIfNeeded(admin, orgId, user.id)

  return NextResponse.json({ ok: true, user_id: user.id })
}
