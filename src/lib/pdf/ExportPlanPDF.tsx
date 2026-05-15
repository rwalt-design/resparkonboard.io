import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Item = {
  id: string
  type: string
  required: boolean
  task_name?: string
  task_done?: boolean
  session_name?: string
  session_status?: string
}

type Stage = { id: string; name: string; items: Item[] }
type Milestone = { id: string; name: string; stages: Stage[] }

type Account = {
  id: string
  name: string
  sku: string
  addons: string[]
  go_live_date?: string | null
  milestones: Milestone[]
}

type HardwareTask = {
  id: string
  name: string
  type: string
  make_model?: string
  location_label?: string
  completed: boolean
}

type ReportTask = {
  id: string
  legacy_name: string
  date_range?: string
  purpose?: string
}

type ComplianceTask = {
  id: string
  name: string
  category: string
  completed: boolean
}

type Rep = { name: string; role: string; email: string }

// ─── Filters (mirrors PlanExportClient) ────────────────────────────────────────

const EXCLUDED_MILESTONES = new Set(['account creation', 'account setup'])
const EXCLUDED_STAGES     = new Set(['account creation'])
const EXCLUDED_ITEM_TYPES = new Set(['record', 'handoff', 'log', 'dependency', 'golive', 'report', 'exchange'])
const EXCLUDED_TASK_NAMES = new Set([
  'build handoff doc', 'handoff to csm', 'sub topics',
  'set up sandbox environment', 'add users',
  'log daily job/ticket usage', 'usage review',
])
const TEXTAREA_STAGES = new Set(['user testing', 'uat', 'launch', 'post launch'])
const PREPEND_QNA_STAGES = new Set(['readiness review', 'sign-off'])

function isVisible(item: Item): boolean {
  if (EXCLUDED_ITEM_TYPES.has(item.type)) return false
  if (item.type === 'task') {
    const name = (item.task_name || '').toLowerCase()
    if (EXCLUDED_TASK_NAMES.has(name)) return false
    if (name.startsWith('send ')) return false
  }
  return true
}

// ─── Labels ────────────────────────────────────────────────────────────────────

const SKU_LABELS: Record<string, string> = {
  essentials:          'Essentials',
  pro:                 'Pro',
  dispatch:            'Dispatch',
  rail:                'Rail',
  exports:             'Exports',
  uptimepm_core:       'UptimePM Core',
  uptimepm_pro:        'UptimePM Pro',
  uptimepm_enterprise: 'UptimePM Enterprise',
}
const ADDON_LABELS: Record<string, string> = {
  ai_commercial:   'Commercial Agent',
  ai_operations:   'Operations Agent',
  ai_finance:      'Finance Agent',
  ai_dispatch:     'Dispatch Agent',
  supplier_portal: 'Supplier Portal',
  integrated_gl:   'Integrated GL',
  brokerage:       'Brokerage',
  crv_processing:  'CRV Processing',
  dispatch:        'Dispatch',
  rail:            'Rail',
  exports:         'Exports',
}
const HARDWARE_TYPE_LABELS: Record<string, string> = {
  floor_scale: 'Floor Scale',
  truck_scale: 'Truck Scale',
  camera:      'Camera',
  tablet:      'Tablet',
  other:       'Other',
}
const CATEGORY_LABELS: Record<string, string> = {
  government_upload: 'Gov Upload',
  regulatory_config: 'Regulatory',
  document_template: 'Doc Template',
  other:             'Other',
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const TEAL  = '#1BB3BB'
const DARK  = '#1e293b'
const GRAY  = '#64748b'
const LIGHT = '#94a3b8'
const BGALT = '#f8fafc'
const BORDER = '#e2e8f0'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
  },

  // Cover page
  coverPage: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    paddingTop: 48,
    paddingBottom: 40,
    paddingHorizontal: 56,
    display: 'flex',
    flexDirection: 'column',
  },
  logo: { width: 100, height: 28, objectFit: 'contain', objectPositionX: 0 },
  coverTitle: { fontSize: 34, fontFamily: 'Helvetica-Bold', color: DARK, letterSpacing: -0.5, marginBottom: 8 },
  coverLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: TEAL, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, marginTop: 48 },
  coverSubtitle: { fontSize: 14, color: GRAY, marginBottom: 32 },
  coverGoLiveBox: { backgroundColor: '#E0F7F8', borderRadius: 8, padding: 12, alignSelf: 'flex-start', marginBottom: 24, flexDirection: 'row', alignItems: 'center' },
  coverGoLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: TEAL, marginRight: 10 },
  coverGoLiveLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#007580', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  coverGoLiveDate: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: DARK },
  coverDesc: { fontSize: 10, color: '#475569', lineHeight: 1.6, marginBottom: 10, maxWidth: 380 },
  coverDisclaimer: { fontSize: 8, color: LIGHT, lineHeight: 1.6, maxWidth: 380 },
  coverFooter: { borderTopWidth: 1, borderTopColor: BORDER, borderTopStyle: 'solid', paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' },
  coverRepName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 },
  coverRepRole: { fontSize: 9, color: GRAY, marginBottom: 2 },
  coverRepEmail: { fontSize: 9, color: TEAL },
  coverGenDate: { fontSize: 8, color: LIGHT },

  // Page header
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: TEAL, borderBottomStyle: 'solid' },
  headerLeft: { flexDirection: 'column' },
  headerLogo: { width: 70, height: 20, objectFit: 'contain', objectPositionX: 0, marginBottom: 8 },
  headerAccountName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 3 },
  headerSku: { fontSize: 8, color: GRAY },
  headerSection: { fontSize: 8, color: LIGHT, textAlign: 'right', fontFamily: 'Helvetica-Oblique' },

  // Footer
  footer: { borderTopWidth: 1, borderTopColor: BORDER, borderTopStyle: 'solid', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  footerText: { fontSize: 8, color: LIGHT },

  // Milestone block
  milestoneBlock: { marginBottom: 16, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', borderRadius: 6, overflow: 'hidden' },
  milestoneHeader: { padding: 8, backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid' },
  milestoneTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK },

  // Stage block
  stageHeader: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: BGALT, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderBottomStyle: 'solid' },
  stageName: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase' },

  // Item row
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, paddingLeft: 20, borderBottomWidth: 1, borderBottomColor: '#f8fafc', borderBottomStyle: 'solid', gap: 8 },
  checkboxUnchecked: { width: 10, height: 10, borderRadius: 2, borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'solid', flexShrink: 0 },
  checkboxChecked: { width: 10, height: 10, borderRadius: 2, backgroundColor: '#10b981', flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  checkmark: { fontSize: 6, color: 'white', fontFamily: 'Helvetica-Bold' },
  itemLabel: { fontSize: 9, color: DARK, flex: 1 },
  itemLabelDone: { fontSize: 9, color: LIGHT, flex: 1 },
  sessionBadge: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#007580', backgroundColor: '#E0F7F8', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  optionalLabel: { fontSize: 7, color: LIGHT },

  // Textarea placeholder (PDF can't have interactive textareas)
  textareaBlock: { margin: 10, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', borderRadius: 5, padding: 10, backgroundColor: '#fafafa', minHeight: 56 },
  textareaLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  textareaHint: { fontSize: 8, color: '#cbd5e1' },

  // Table
  tableHeader: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: BGALT, borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid' },
  tableColHeader: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderBottomStyle: 'solid', alignItems: 'center' },
  tableCell: { fontSize: 8, color: GRAY },
  tableCellDark: { fontSize: 8, color: DARK },
  tableWrapper: { borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', borderRadius: 6, overflow: 'hidden' },

  // Section label
  sectionLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid' },
})

// ─── Sub-components ────────────────────────────────────────────────────────────

function Checkbox({ done }: { done: boolean }) {
  return done ? (
    <View style={s.checkboxChecked}>
      <Text style={s.checkmark}>✓</Text>
    </View>
  ) : (
    <View style={s.checkboxUnchecked} />
  )
}

function PageHeader({ account, section, logoSrc }: { account: Account; section: string; logoSrc: string }) {
  const skuLabel = SKU_LABELS[account.sku] || account.sku
  const addonLabels = (account.addons || []).map(a => ADDON_LABELS[a] || a).join(', ')
  return (
    <View style={s.pageHeader}>
      <View style={s.headerLeft}>
        <Image src={logoSrc} style={s.headerLogo} />
        <Text style={s.headerAccountName}>{account.name}</Text>
        <Text style={s.headerSku}>
          {skuLabel}{addonLabels ? ` + ${addonLabels}` : ''}
        </Text>
      </View>
      <Text style={s.headerSection}>{section}</Text>
    </View>
  )
}

function Footer({ accountName, today }: { accountName: string; today: string }) {
  return (
    <View style={s.footer}>
      <Text style={s.footerText}>Generated by ReSpark Onboard</Text>
      <Text style={s.footerText}>{accountName} · {today}</Text>
    </View>
  )
}

// ─── Main PDF document ────────────────────────────────────────────────────────

export function ExportPlanPDF({
  account,
  hardwareTasks,
  reportTasks,
  complianceTasks,
  rep,
  logoSrc,
  today,
}: {
  account: Account
  hardwareTasks: HardwareTask[]
  reportTasks: ReportTask[]
  complianceTasks: ComplianceTask[]
  rep: Rep
  logoSrc: string
  today: string
}) {
  const visibleMilestones = (account.milestones || []).filter(
    m => !EXCLUDED_MILESTONES.has(m.name.toLowerCase().trim())
  )

  const goLiveLabel = account.go_live_date
    ? new Date(account.go_live_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <Document>
      {/* ── COVER PAGE ─────────────────────────────────────────────────── */}
      <Page size="LETTER" style={s.coverPage}>
        <Image src={logoSrc} style={s.logo} />

        <Text style={s.coverLabel}>Onboarding Transition Plan</Text>
        <Text style={s.coverTitle}>{account.name}</Text>
        <Text style={s.coverSubtitle}>ReSpark Transition</Text>

        {goLiveLabel && (
          <View style={s.coverGoLiveBox}>
            <View style={s.coverGoLiveDot} />
            <View>
              <Text style={s.coverGoLiveLabel}>Target Go-Live</Text>
              <Text style={s.coverGoLiveDate}>{goLiveLabel}</Text>
            </View>
          </View>
        )}

        <Text style={s.coverDesc}>
          This document outlines your onboarding plan with ReSpark, including the key milestones, training sessions, hardware setup, and reporting requirements for your transition. Use it to track progress and stay aligned with your implementation team throughout the process.
        </Text>
        <Text style={s.coverDisclaimer}>
          All timelines, sessions, and deliverables outlined in this plan are subject to change based on project scope, client readiness, and scheduling. Your ReSpark team will keep you informed of any updates.
        </Text>

        <View style={s.coverFooter}>
          <View>
            <Text style={s.coverRepName}>{rep.name}</Text>
            <Text style={s.coverRepRole}>{rep.role} · ReSpark</Text>
            <Text style={s.coverRepEmail}>{rep.email}</Text>
          </View>
          <Text style={s.coverGenDate}>Generated {today}</Text>
        </View>
      </Page>

      {/* ── PLAN PAGE ──────────────────────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <PageHeader account={account} section="Onboarding Plan" logoSrc={logoSrc} />

        {visibleMilestones.map((milestone, mi) => {
          const stageBlocks: React.ReactNode[] = []

          milestone.stages.forEach(stage => {
            const stageLower = stage.name.toLowerCase().trim()
            if (EXCLUDED_STAGES.has(stageLower)) return
            const items = stage.items.filter(isVisible)
            const showTextarea = TEXTAREA_STAGES.has(stageLower)
            const showQnA = PREPEND_QNA_STAGES.has(stageLower)
            if (items.length === 0 && !showTextarea && !showQnA) return

            stageBlocks.push(
              <View key={stage.id}>
                <View style={s.stageHeader}>
                  <Text style={s.stageName}>{stage.name}</Text>
                </View>

                {showQnA && (
                  <View style={s.itemRow}>
                    <Checkbox done={false} />
                    <Text style={s.itemLabel}>Pre-Launch Checklist Q&A</Text>
                    <Text style={s.sessionBadge}>session</Text>
                  </View>
                )}

                {items.map(item => {
                  const done = item.type === 'task' ? !!item.task_done : item.session_status === 'complete'
                  const label = item.type === 'session' ? item.session_name : item.task_name
                  return (
                    <View key={item.id} style={s.itemRow}>
                      <Checkbox done={done} />
                      <Text style={done ? s.itemLabelDone : s.itemLabel}>{label}</Text>
                      {item.type === 'session' && <Text style={s.sessionBadge}>session</Text>}
                      {!item.required && item.type !== 'session' && <Text style={s.optionalLabel}>optional</Text>}
                    </View>
                  )
                })}

                {showTextarea && (
                  <View style={s.textareaBlock}>
                    <Text style={s.textareaLabel}>
                      {stageLower === 'user testing' || stageLower === 'uat'
                        ? 'Question Bank & Readiness Review'
                        : stageLower === 'launch'
                        ? 'Go-Live Notes'
                        : 'Post-Launch Check-In Notes'}
                    </Text>
                    <Text style={s.textareaHint}>Notes and questions go here…</Text>
                  </View>
                )}
              </View>
            )
          })

          if (stageBlocks.length === 0) return null

          return (
            <View key={milestone.id} style={s.milestoneBlock}>
              <View style={s.milestoneHeader}>
                <Text style={s.milestoneTitle}>{mi + 1}. {milestone.name}</Text>
              </View>
              {stageBlocks}
            </View>
          )
        })}

        <Footer accountName={account.name} today={today} />
      </Page>

      {/* ── HARDWARE PAGE ──────────────────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <PageHeader account={account} section="Hardware" logoSrc={logoSrc} />

        {hardwareTasks.length === 0 ? (
          <View style={{ borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 6, padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: LIGHT }}>No hardware items on record.</Text>
          </View>
        ) : (
          <View style={s.tableWrapper}>
            <View style={s.tableHeader}>
              <View style={{ width: 16, marginRight: 8 }} />
              <Text style={[s.tableColHeader, { flex: 2 }]}>Name</Text>
              <Text style={[s.tableColHeader, { flex: 1.2 }]}>Type</Text>
              <Text style={[s.tableColHeader, { flex: 1.5 }]}>Make / Model</Text>
              <Text style={[s.tableColHeader, { flex: 1.5 }]}>Location</Text>
            </View>
            {hardwareTasks.map((task, idx) => (
              <View key={task.id} style={[s.tableRow, idx === hardwareTasks.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                <View style={{ width: 16, marginRight: 8 }}>
                  <Checkbox done={task.completed} />
                </View>
                <Text style={[s.tableCellDark, { flex: 2 }]}>{task.name}</Text>
                <Text style={[s.tableCell, { flex: 1.2 }]}>{HARDWARE_TYPE_LABELS[task.type] || task.type}</Text>
                <Text style={[s.tableCell, { flex: 1.5 }]}>{task.make_model || '—'}</Text>
                <Text style={[s.tableCell, { flex: 1.5 }]}>{task.location_label || '—'}</Text>
              </View>
            ))}
          </View>
        )}

        <Footer accountName={account.name} today={today} />
      </Page>

      {/* ── REPORTING & COMPLIANCE PAGE ────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <PageHeader account={account} section="Reporting & Compliance" logoSrc={logoSrc} />

        {/* Reports */}
        <View style={{ marginBottom: 24 }}>
          <Text style={s.sectionLabel}>Reports</Text>
          {reportTasks.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 6, padding: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: LIGHT }}>No reports on record.</Text>
            </View>
          ) : (
            <View style={s.tableWrapper}>
              <View style={s.tableHeader}>
                <View style={{ width: 16, marginRight: 8 }} />
                <Text style={[s.tableColHeader, { flex: 2 }]}>Legacy Report Name</Text>
                <Text style={[s.tableColHeader, { flex: 1 }]}>Date Range</Text>
                <Text style={[s.tableColHeader, { flex: 1.5 }]}>Purpose</Text>
              </View>
              {reportTasks.map((task, idx) => (
                <View key={task.id} style={[s.tableRow, idx === reportTasks.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <View style={{ width: 16, marginRight: 8 }}>
                    <Checkbox done={false} />
                  </View>
                  <Text style={[s.tableCellDark, { flex: 2 }]}>{task.legacy_name}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{task.date_range || '—'}</Text>
                  <Text style={[s.tableCell, { flex: 1.5 }]}>{task.purpose || '—'}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Compliance */}
        <View>
          <Text style={s.sectionLabel}>Compliance</Text>
          {complianceTasks.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 6, padding: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: LIGHT }}>No compliance items on record.</Text>
            </View>
          ) : (
            <View style={s.tableWrapper}>
              <View style={s.tableHeader}>
                <View style={{ width: 16, marginRight: 8 }} />
                <Text style={[s.tableColHeader, { flex: 2 }]}>Item</Text>
                <Text style={[s.tableColHeader, { flex: 1 }]}>Category</Text>
              </View>
              {complianceTasks.map((task, idx) => (
                <View key={task.id} style={[s.tableRow, idx === complianceTasks.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <View style={{ width: 16, marginRight: 8 }}>
                    <Checkbox done={task.completed} />
                  </View>
                  <Text style={[s.tableCellDark, { flex: 2 }]}>{task.name}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{CATEGORY_LABELS[task.category] || task.category}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Footer accountName={account.name} today={today} />
      </Page>
    </Document>
  )
}
