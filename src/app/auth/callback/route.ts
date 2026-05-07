import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    console.error('Auth exchange error:', error?.message)
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  // Restrict to @respark.com
  const email = data.user.email ?? ''
  if (!email.endsWith('@respark.com')) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=domain`)
  }

  // Ensure org + membership via SECURITY DEFINER function (bypasses RLS for new users).
  // The updated function auto-assigns role='manager' to the first member, 'member' to all after.
  const name =
    (data.user.user_metadata?.full_name as string) ||
    (data.user.user_metadata?.name as string) ||
    email.split('@')[0]

  const { error: rpcError } = await supabase.rpc('ensure_org_member', {
    p_user_id: data.user.id,
    p_name: name,
  })

  if (rpcError) {
    console.error('ensure_org_member error:', rpcError.message)
  }

  // Keep avatar_url fresh on every login so headshots stay current.
  const avatarUrl = (data.user.user_metadata?.avatar_url as string) || null
  if (avatarUrl) {
    const admin = createAdminClient()
    await admin
      .from('org_members')
      .update({ avatar_url: avatarUrl })
      .eq('user_id', data.user.id)
  }

  // Seed default templates if this org has never had any.
  // Uses the service-role client so RLS doesn't block the check or inserts.
  try {
    const admin = createAdminClient()
    const { data: member } = await admin
      .from('org_members').select('org_id').eq('user_id', data.user.id).single()

    if (member) {
      const { count } = await admin
        .from('training_templates')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', member.org_id)

      if (count === 0) {
        await seedDefaultTemplates(admin, member.org_id)
      }
    }
  } catch (seedErr) {
    console.error('Seed error (non-blocking):', seedErr)
  }

  return NextResponse.redirect(`${origin}${next}`)
}

// ── Default templates ─────────────────────────────────────────────────────────
// Inserted once when the org is brand new. Mirrors the demo setup but without
// the sample accounts — real teams start with templates, not fake data.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedDefaultTemplates(admin: any, orgId: string) {
  await admin.from('training_templates').insert([
    {
      org_id: orgId,
      name: 'Pre Transaction',
      triggers: ['facility_management'],
      duration_minutes: 60,
      description: 'Setting commodity prices, creating vendor profiles, managing user permissions, and running the daily open/close yard checklist.',
    },
    {
      org_id: orgId,
      name: 'Transacting',
      triggers: ['facility_management'],
      duration_minutes: 90,
      description: 'End-to-end transaction flow: scale ticket creation, multi-line tickets, mobile app for drivers, and the ticket-to-invoice workflow.',
    },
    {
      org_id: orgId,
      name: 'Post Transaction',
      triggers: ['facility_management'],
      duration_minutes: 60,
      description: 'Reporting, end-of-day reconciliation, payment processing, QuickBooks sync verification, and compliance manifest generation.',
    },
  ])

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
                { type: 'session',  name: 'Kickoff',                        required: true },
                { type: 'exchange', name: 'Data Template',                  required: true },
                { type: 'exchange', name: 'Pre-Work Form',                  required: true },
                { type: 'task',     name: 'Update Plan w Pre-Work Results', assignee: 'personal', required: true },
                { type: 'task',     name: 'Set Up Sandbox Environment',     assignee: 'personal', required: true },
                { type: 'task',     name: 'Add Users',                      assignee: 'personal', required: true },
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
          name: 'Training',
          stages: [], // replaced at apply-time by training templates matching the SKU
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
}
