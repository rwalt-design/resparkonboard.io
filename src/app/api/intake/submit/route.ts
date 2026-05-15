import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const HARDWARE_TYPE_MAP: Record<string, string> = {
  floor_scales: 'floor_scale',
  truck_scales: 'truck_scale',
  cameras: 'camera',
  tablets: 'tablet',
}

interface OtherHardware {
  name: string
  count: number
}

interface ReportRow {
  legacy_name: string
  date_range?: string
  purpose?: string
  key_columns?: string
}

interface SubmitBody {
  token: string
  hardware: {
    floor_scales?: number
    truck_scales?: number
    cameras?: number
    tablets?: number
    other?: OtherHardware[]
  }
  reports?: ReportRow[]
  compliance?: string[]
}

export async function POST(req: NextRequest) {
  // Verify shared secret
  const secret = req.headers.get('x-respark-secret')
  if (!secret || secret !== process.env.INTAKE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: SubmitBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, hardware = {}, reports = [], compliance = [] } = body

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Look up the token
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('intake_tokens')
    .select('id, account_id, rep_id, submitted_at, expires_at')
    .eq('token', token)
    .single()

  if (tokenErr || !tokenRow) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  if (tokenRow.submitted_at) {
    return NextResponse.json({ error: 'Token already used' }, { status: 409 })
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token expired' }, { status: 410 })
  }

  const { account_id, rep_id } = tokenRow

  // Mark token as submitted
  await supabase
    .from('intake_tokens')
    .update({ submitted_at: new Date().toISOString() })
    .eq('id', tokenRow.id)

  // ─── Hardware expansion ───────────────────────────────────────────────────
  const hardwareRows: { account_id: string; rep_id: string; name: string; type: string; sort_order: number }[] = []
  let sortOrder = 0

  for (const [key, type] of Object.entries(HARDWARE_TYPE_MAP)) {
    const count = (hardware as Record<string, number>)[key] ?? 0
    for (let i = 1; i <= count; i++) {
      const label = type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
      hardwareRows.push({ account_id, rep_id, name: `${label} ${i}`, type, sort_order: sortOrder++ })
    }
  }

  for (const item of hardware.other ?? []) {
    const count = Math.max(1, item.count ?? 1)
    for (let i = 1; i <= count; i++) {
      const name = count > 1 ? `${item.name} ${i}` : item.name
      hardwareRows.push({ account_id, rep_id, name, type: 'other', sort_order: sortOrder++ })
    }
  }

  if (hardwareRows.length > 0) {
    await supabase.from('hardware_tasks').insert(hardwareRows)
  }

  // ─── Reports ─────────────────────────────────────────────────────────────
  if (reports.length > 0) {
    const reportRows = reports.map((r, i) => ({
      account_id,
      rep_id,
      legacy_name: r.legacy_name,
      date_range: r.date_range ?? null,
      purpose: r.purpose ?? null,
      key_columns: r.key_columns ?? null,
      sort_order: i,
    }))
    await supabase.from('report_tasks').insert(reportRows)
  }

  // ─── Compliance ──────────────────────────────────────────────────────────
  if (compliance.length > 0) {
    const complianceRows = compliance.map((name, i) => ({
      account_id,
      rep_id,
      name,
      sort_order: i,
    }))
    await supabase.from('compliance_tasks').insert(complianceRows)
  }

  return NextResponse.json({ ok: true })
}
