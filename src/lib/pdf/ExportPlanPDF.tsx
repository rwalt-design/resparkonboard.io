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
const EXCLUDED_ITEM_TYPES = new Set(['record', 'handoff', 'log', 'dependency', 'golive', 'report'])
const EXCLUDED_TASK_NAMES = new Set([
  'build handoff doc', 'handoff to csm', 'sub topics',
  'set up sandbox environment', 'add users',
  'log daily job/ticket usage', 'usage review',
  'update ob plan', 'update onboarding plan',
  'review pre-launch checklist', 'outstanding item cleanup',
  'outstanding items cleanup',
])

const CUSTOMER_STAGES        = new Set(['user testing', 'uat', 'readiness review', 'sign-off', 'post launch', 'post launch check-in'])
const CUSTOMER_TASK_PREFIXES = ['return ', 'submit ']
const NOTE_STAGES            = new Set(['user testing', 'uat', 'post launch'])
const GO_LIVE_BEFORE_STAGES  = new Set(['post launch', 'post launch check-in'])

function isVisible(item: Item): boolean {
  if (EXCLUDED_ITEM_TYPES.has(item.type)) return false
  if (item.type === 'task' || item.type === 'exchange') {
    const name = (item.task_name || '').toLowerCase()
    if (name.startsWith('send ')) return false
    if (EXCLUDED_TASK_NAMES.has(name)) return false
  }
  return true
}

function isCustomerOwned(item: Item, stageLower: string): boolean {
  if (CUSTOMER_STAGES.has(stageLower)) return true
  if (item.type === 'task' || item.type === 'exchange') {
    const name = (item.task_name || '').toLowerCase()
    if (CUSTOMER_TASK_PREFIXES.some(p => name.startsWith(p))) return true
  }
  return false
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

const TEAL   = '#1BB3BB'
const DARK   = '#1e293b'
const GRAY   = '#64748b'
const LIGHT  = '#94a3b8'
const BGALT  = '#f8fafc'
const BORDER = '#e2e8f0'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
  },
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

  coverLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: TEAL, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, marginTop: 48 },
  coverTitle: { fontSize: 34, fontFamily: 'Helvetica-Bold', color: DARK, letterSpacing: -0.5, marginBottom: 8 },
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

  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: TEAL, borderBottomStyle: 'solid' },
  headerLogo: { width: 70, height: 20, objectFit: 'contain', objectPositionX: 0, marginBottom: 8 },
  headerAccountName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 3 },
  headerSku: { fontSize: 8, color: GRAY },
  headerSection: { fontSize: 8, color: LIGHT, textAlign: 'right', fontFamily: 'Helvetica-Oblique' },

  footer: { borderTopWidth: 1, borderTopColor: BORDER, borderTopStyle: 'solid', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  footerText: { fontSize: 8, color: LIGHT },

  milestoneBlock: { marginBottom: 14, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', borderRadius: 5, overflow: 'hidden' },
  milestoneHeader: { padding: 8, backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid' },
  milestoneTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK },

  stageHeader: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: BGALT, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderBottomStyle: 'solid', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stageName: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase' },
  customerStageBadge: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#1d4ed8', backgroundColor: '#dbeafe', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 10, paddingLeft: 18, borderBottomWidth: 1, borderBottomColor: '#f8fafc', borderBottomStyle: 'solid' },
  checkboxUnchecked: { width: 9, height: 9, borderRadius: 2, borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'solid', flexShrink: 0, marginRight: 7 },
  checkboxChecked: { width: 9, height: 9, borderRadius: 2, backgroundColor: '#10b981', flexShrink: 0, marginRight: 7, alignItems: 'center', justifyContent: 'center' },
  checkmark: { fontSize: 5, color: 'white', fontFamily: 'Helvetica-Bold' },
  itemLabel: { fontSize: 9, color: DARK, flex: 1 },
  itemLabelDone: { fontSize: 9, color: LIGHT, flex: 1 },
  sessionBadge:  { fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#007580', backgroundColor: '#E0F7F8', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, marginLeft: 4 },
  customerBadge: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#1d4ed8', backgroundColor: '#dbeafe', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, marginLeft: 4 },
  resparkBadge:  { fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#007580', backgroundColor: '#E0F7F8', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, marginLeft: 4 },

  noteRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 10, paddingLeft: 18, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#f1f5f9', borderTopStyle: 'solid' },
  noteText: { fontSize: 8, color: LIGHT, fontFamily: 'Helvetica-Oblique', flex: 1 },

  goLiveMarker: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#E0F7F8', borderTopWidth: 2, borderTopColor: TEAL, borderTopStyle: 'solid', borderBottomWidth: 2, borderBottomColor: TEAL, borderBottomStyle: 'solid' },
  goLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: TEAL, marginRight: 12, flexShrink: 0 },
  goLiveLabel: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#007580', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  goLiveDate: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK },

  tableHeader: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: BGALT, borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid' },
  tableColHeader: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderBottomStyle: 'solid', alignItems: 'center' },
  tableCell: { fontSize: 8, color: GRAY },
  tableCellDark: { fontSize: 8, color: DARK },
  tableWrapper: { borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', borderRadius: 5, overflow: 'hidden' },
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
      <View>
        <Image src={logoSrc} style={s.headerLogo} />
        <Text style={s.headerAccountName}>{account.name}</Text>
        <Text style={s.headerSku}>{skuLabel}{addonLabels ? ` + ${addonLabels}` : ''}</Text>
      </View>
      <Text style={s.headerSection}>{section}</Text>
    </View>
  )
}

function Footer({ accountName, today }: { accountName: string; today: string }) {
  return (
    <View style={s.footer}>
      <Text style={s.footerText}>Generated by ReSpark</Text>
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
    : 'Target Go-Live'

  let goLiveInserted = false

  return (
    <Document>
      {/* ── COVER PAGE ─────────────────────────────────────────────────── */}
      <Page size="LETTER" style={s.coverPage}>
        <Image src={logoSrc} style={s.logo} />

        <Text style={s.coverLabel}>Onboarding Transition Plan</Text>
        <Text style={s.coverTitle}>{account.name}</Text>
        <Text style={s.coverSubtitle}>ReSpark Transition</Text>

        {account.go_live_date && (
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
            const showNote = NOTE_STAGES.has(stageLower)
            const stageIsCustomer = CUSTOMER_STAGES.has(stageLower)

            // Inject Go-Live marker before post-launch stage
            if (GO_LIVE_BEFORE_STAGES.has(stageLower) && !goLiveInserted) {
              goLiveInserted = true
              stageBlocks.push(
                <View key={`golive-${stage.id}`} style={s.goLiveMarker}>
                  <View style={s.goLiveDot} />
                  <View>
                    <Text style={s.goLiveLabel}>Go Live</Text>
                    <Text style={s.goLiveDate}>{goLiveLabel}</Text>
                  </View>
                </View>
              )
            }

            if (items.length === 0 && !showNote) return

            stageBlocks.push(
              <View key={stage.id}>
                <View style={s.stageHeader}>
                  <Text style={s.stageName}>{stage.name.toUpperCase()}</Text>
                  {stageIsCustomer && <Text style={s.customerStageBadge}>CUSTOMER</Text>}
                </View>

                {items.map(item => {
                  const done = item.type === 'task' ? !!item.task_done : item.session_status === 'complete'
                  const label = item.type === 'session' ? item.session_name : item.task_name
                  const customer = isCustomerOwned(item, stageLower)
                  return (
                    <View key={item.id} style={s.itemRow}>
                      <Checkbox done={done} />
                      <Text style={done ? s.itemLabelDone : s.itemLabel}>{label}</Text>
                      {item.type === 'session' && <Text style={s.sessionBadge}>session · ReSpark</Text>}
                      {customer && item.type !== 'session' && <Text style={s.customerBadge}>customer</Text>}
                      {!customer && item.type !== 'session' && <Text style={s.resparkBadge}>ReSpark</Text>}
                    </View>
                  )
                })}

                {showNote && (
                  <View style={s.noteRow}>
                    <Text style={s.noteText}>Write down your questions to bring to the upcoming session.</Text>
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
          <View style={{ borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 5, padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: LIGHT }}>No hardware items on record.</Text>
          </View>
        ) : (
          <View style={s.tableWrapper}>
            <View style={s.tableHeader}>
              <View style={{ width: 20, marginRight: 6 }} />
              <Text style={[s.tableColHeader, { flex: 2 }]}>Name</Text>
              <Text style={[s.tableColHeader, { flex: 1.2 }]}>Type</Text>
              <Text style={[s.tableColHeader, { flex: 1.5 }]}>Make / Model</Text>
              <Text style={[s.tableColHeader, { flex: 1.5 }]}>Location</Text>
            </View>
            {hardwareTasks.map((task, idx) => (
              <View key={task.id} style={[s.tableRow, idx === hardwareTasks.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                <View style={{ width: 20, marginRight: 6 }}>
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

        <View style={{ marginBottom: 22 }}>
          <Text style={s.sectionLabel}>Reports</Text>
          {reportTasks.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 5, padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 9, color: LIGHT }}>No reports on record.</Text>
            </View>
          ) : (
            <View style={s.tableWrapper}>
              <View style={s.tableHeader}>
                <View style={{ width: 20, marginRight: 6 }} />
                <Text style={[s.tableColHeader, { flex: 2 }]}>Legacy Report Name</Text>
                <Text style={[s.tableColHeader, { flex: 1 }]}>Date Range</Text>
                <Text style={[s.tableColHeader, { flex: 1.5 }]}>Purpose</Text>
              </View>
              {reportTasks.map((task, idx) => (
                <View key={task.id} style={[s.tableRow, idx === reportTasks.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <View style={{ width: 20, marginRight: 6 }}>
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

        <View>
          <Text style={s.sectionLabel}>Compliance</Text>
          {complianceTasks.length === 0 ? (
            <View style={{ borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 5, padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 9, color: LIGHT }}>No compliance items on record.</Text>
            </View>
          ) : (
            <View style={s.tableWrapper}>
              <View style={s.tableHeader}>
                <View style={{ width: 20, marginRight: 6 }} />
                <Text style={[s.tableColHeader, { flex: 2 }]}>Item</Text>
                <Text style={[s.tableColHeader, { flex: 1 }]}>Category</Text>
              </View>
              {complianceTasks.map((task, idx) => (
                <View key={task.id} style={[s.tableRow, idx === complianceTasks.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <View style={{ width: 20, marginRight: 6 }}>
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
