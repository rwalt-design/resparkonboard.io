import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Shape of the prework form answers stored in form-fills ──────────────────

interface PreworkAnswers {
  hardware_yes?: boolean
  hardware_items?: string[]
  scale_types?: string[]
  floor_count?: string | number
  truck_count?: string | number
  camera_brand?: string
  camera_count?: string | number
  printer_types?: string[]
  thermal_count?: string | number
  tag_count?: string | number
  standard_count?: string | number
  reports_rows?: {
    id?: string | number
    legacy_name?: string
    date_range?: string
    purpose?: string
    columns?: string  // form-fills uses "columns", we map to key_columns
  }[]
  compliance_yes?: boolean
  compliance_programs?: string[]
  leads_mre?: string
  leads_store_id?: string
  tx_mre?: string
  tx_store_id?: string
  compliance_other?: string
}

// ─── Supabase database webhook envelope ──────────────────────────────────────

interface SupabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: {
    id: string
    account: string
    slug: string
    submitted_at: string
    answers: PreworkAnswers
  } | null
  old_record: Record<string, unknown> | null
}

// ─── Compliance program labels & categories ──────────────────────────────────

const COMPLIANCE_PROGRAMS: Record<string, { name: string; category: string }> = {
  leads_online:     { name: 'Leads Online',         category: 'government_upload' },
  tx_online_metals: { name: 'Texas Online Metals',   category: 'government_upload' },
  hi5:              { name: 'Hi-5',                  category: 'government_upload' },
  crv:              { name: 'CRV',                   category: 'government_upload' },
  other:            { name: 'Other Compliance',       category: 'other' },
}

function toInt(v: string | number | undefined): number {
  const n = parseInt(String(v ?? '0'), 10)
  return isNaN(n) ? 0 : n
}

export async function POST(req: NextRequest) {
  // Verify shared secret — set this header in the Supabase webhook config
  const secret = req.headers.get('x-respark-secret')
  if (!secret || secret !== process.env.INTAKE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: SupabaseWebhookPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only process INSERT events on the prework submissions table
  if (payload.type !== 'INSERT' || !payload.record) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { id: submissionId, slug, answers } = payload.record

  if (!slug || !answers) {
    return NextResponse.json({ error: 'Missing slug or answers' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Look up account by form_slug
  const { data: account, error: acctErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('form_slug', slug)
    .single()

  if (acctErr || !account) {
    // Unrecognized slug — log and return 200 so Supabase doesn't retry forever
    console.warn(`[intake/submit] No account found for slug "${slug}"`)
    return NextResponse.json({ ok: true, skipped: true, reason: 'unknown_slug' })
  }

  const accountId = account.id

  // Idempotency — skip if we've already processed this submission
  const { data: existing } = await supabase
    .from('hardware_tasks')
    .select('id')
    .eq('source_submission_id', submissionId)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already_processed' })
  }

  // ─── Hardware ────────────────────────────────────────────────────────────────
  const hardwareRows: object[] = []
  let hwOrder = 0

  if (answers.hardware_yes && (answers.hardware_items ?? []).length > 0) {
    const items = answers.hardware_items ?? []

    if (items.includes('scales')) {
      const scaleTypes = answers.scale_types ?? []
      if (scaleTypes.includes('floor')) {
        const count = toInt(answers.floor_count)
        for (let i = 1; i <= count; i++) {
          hardwareRows.push({
            account_id: accountId, source_submission_id: submissionId,
            name: `Floor Scale ${i}`, type: 'floor_scale', sort_order: hwOrder++,
          })
        }
      }
      if (scaleTypes.includes('truck')) {
        const count = toInt(answers.truck_count)
        for (let i = 1; i <= count; i++) {
          hardwareRows.push({
            account_id: accountId, source_submission_id: submissionId,
            name: `Truck Scale ${i}`, type: 'truck_scale', sort_order: hwOrder++,
          })
        }
      }
    }

    if (items.includes('cameras')) {
      const count = toInt(answers.camera_count)
      const brand = answers.camera_brand?.trim() || ''
      for (let i = 1; i <= count; i++) {
        hardwareRows.push({
          account_id: accountId, source_submission_id: submissionId,
          name: count > 1 ? `Camera ${i}` : 'Camera',
          type: 'camera',
          location_label: brand || null,
          sort_order: hwOrder++,
        })
      }
    }

    if (items.includes('printers')) {
      const printerTypes = answers.printer_types ?? []
      const printerDefs = [
        { key: 'thermal', count: toInt(answers.thermal_count),   label: 'Thermal Printer' },
        { key: 'tag',     count: toInt(answers.tag_count),       label: 'Tag Printer' },
        { key: 'standard',count: toInt(answers.standard_count),  label: 'Standard Printer' },
      ]
      for (const { key, count, label } of printerDefs) {
        if (!printerTypes.includes(key)) continue
        for (let i = 1; i <= count; i++) {
          hardwareRows.push({
            account_id: accountId, source_submission_id: submissionId,
            name: count > 1 ? `${label} ${i}` : label,
            type: 'other', sort_order: hwOrder++,
          })
        }
      }
    }

    // Single-unit hardware items
    const singles: Record<string, string> = {
      id_scanner:  'ID Scanner',
      signature:   'Signature Pad',
      fingerprint: 'Fingerprint Scanner',
    }
    for (const [key, label] of Object.entries(singles)) {
      if (items.includes(key)) {
        hardwareRows.push({
          account_id: accountId, source_submission_id: submissionId,
          name: label, type: 'other', sort_order: hwOrder++,
        })
      }
    }
  }

  if (hardwareRows.length > 0) {
    await supabase.from('hardware_tasks').insert(hardwareRows)
  }

  // ─── Reports ──────────────────────────────────────────────────────────────
  const reportRows = (answers.reports_rows ?? [])
    .filter(r => r.legacy_name?.trim())
    .map((r, i) => ({
      account_id: accountId,
      source_submission_id: submissionId,
      legacy_name:  r.legacy_name?.trim() ?? '',
      date_range:   r.date_range?.trim()  || null,
      purpose:      r.purpose?.trim()     || null,
      key_columns:  r.columns?.trim()     || null,  // form uses "columns"
      sort_order: i,
    }))

  if (reportRows.length > 0) {
    await supabase.from('report_tasks').insert(reportRows)
  }

  // ─── Compliance ───────────────────────────────────────────────────────────
  const complianceRows: object[] = []

  if (answers.compliance_yes && (answers.compliance_programs ?? []).length > 0) {
    answers.compliance_programs!.forEach((key, i) => {
      const def = COMPLIANCE_PROGRAMS[key]
      if (!def) return

      let name = def.name
      let notes: string | null = null

      if (key === 'leads_online') {
        const parts = []
        if (answers.leads_mre?.trim())      parts.push(`MRE: ${answers.leads_mre.trim()}`)
        if (answers.leads_store_id?.trim()) parts.push(`Store/Cert ID: ${answers.leads_store_id.trim()}`)
        if (parts.length) notes = parts.join(' · ')
      } else if (key === 'tx_online_metals') {
        const parts = []
        if (answers.tx_mre?.trim())      parts.push(`MRE: ${answers.tx_mre.trim()}`)
        if (answers.tx_store_id?.trim()) parts.push(`Store ID: ${answers.tx_store_id.trim()}`)
        if (parts.length) notes = parts.join(' · ')
      } else if (key === 'other' && answers.compliance_other?.trim()) {
        name = answers.compliance_other.trim()
      }

      complianceRows.push({
        account_id: accountId,
        source_submission_id: submissionId,
        name,
        category: def.category,
        notes,
        sort_order: i,
      })
    })
  }

  if (complianceRows.length > 0) {
    await supabase.from('compliance_tasks').insert(complianceRows)
  }

  return NextResponse.json({ ok: true, accountId, hwCount: hardwareRows.length, reportCount: reportRows.length, complianceCount: complianceRows.length })
}
