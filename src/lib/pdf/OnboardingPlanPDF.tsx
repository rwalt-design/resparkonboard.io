import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Item {
  id: string; type: string; required: boolean
  task_name?: string; task_assignee?: string; task_done?: boolean
  session_name?: string; session_status?: string
}
interface Stage { id: string; name: string; status: string; items: Item[] }
interface Milestone { id: string; name: string; order_index: number; stages: Stage[] }
interface Contact { id: string; name: string; role?: string }
interface Request { id: string; label: string; status: string }
interface Account {
  name: string; sku: string; addons: string[]
  contacts: Contact[]; requests: Request[]; milestones: Milestone[]
}

interface Props { account: Account; repName: string; companyName: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCustomerItem(item: Item) {
  if (item.type === 'task') return item.task_assignee === 'customer'
  if (item.type === 'session') return true
  return false
}

const MILESTONE_DESC: Record<string, string> = {
  'Configuration': 'Getting your account configured and your team ready to start',
  'Setup':         'Getting your account configured and your team ready to start',
  'Training':      'Live sessions tailored to your products and workflows',
  'Validation':    'Testing, review, and final checks before launch',
  'Go-Live':       'Launch day and post-launch support',
}

function generatedDate() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Styles ────────────────────────────────────────────────────────────────────

const c = {
  navy: '#1e293b',
  blue: '#1BB3BB',
  blueLight: '#E0F7F8',
  muted: '#64748b',
  dim: '#94a3b8',
  border: '#e2e8f0',
  bg: '#f8fafc',
  white: '#ffffff',
  green: '#10b981',
  greenLight: '#d1fae5',
  amber: '#f59e0b',
  amberLight: '#fef3c7',
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: c.white, paddingBottom: 48 },
  coverPage: { backgroundColor: c.navy, padding: 0 },

  // Cover
  coverTop: { backgroundColor: '#0f172a', padding: '60 48 40 48' },
  coverLogoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 80 },
  coverLogoMark: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: c.blue,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  coverLogoText: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: c.white },
  coverLogoAccent: { color: c.blue },
  coverTitle: { fontSize: 32, fontFamily: 'Helvetica-Bold', color: c.white, marginBottom: 8, letterSpacing: -0.5 },
  coverSubtitle: { fontSize: 14, color: c.dim, marginBottom: 48 },
  coverBottom: { backgroundColor: c.blue, padding: '32 48 40 48' },
  coverField: { marginBottom: 12 },
  coverLabel: { fontSize: 9, color: 'rgba(255,255,255,0.6)', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  coverValue: { fontSize: 14, color: c.white, fontFamily: 'Helvetica-Bold' },
  coverValueSmall: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },

  // Content pages
  pageHeader: {
    backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: c.border,
    padding: '16 40 14 40', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  pageHeaderTitle: { fontSize: 10, color: c.muted, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
  pageHeaderAccount: { fontSize: 10, color: c.muted },
  content: { padding: '28 40 0 40' },

  // Page numbers / footer
  footer: {
    position: 'absolute', bottom: 20, left: 40, right: 40,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  footerText: { fontSize: 8, color: c.dim },

  // Section headings
  sectionTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: c.navy, marginBottom: 4 },
  sectionSubtitle: { fontSize: 11, color: c.muted, marginBottom: 20 },

  // Journey page
  milestoneRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  milestoneArrow: { fontSize: 16, color: c.blue, marginTop: 2, marginHorizontal: 8 },
  milestoneBox: {
    flex: 1, backgroundColor: c.blueLight,
    borderRadius: 6, padding: '10 12',
    alignItems: 'center',
  },
  milestoneBoxName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: c.blue, marginBottom: 4, textAlign: 'center' },
  milestoneBoxDesc: { fontSize: 9, color: '#007580', textAlign: 'center', lineHeight: 1.4 },

  // Plan pages
  milestoneHeader: {
    backgroundColor: '#f1f5f9', borderRadius: 6, padding: '10 14',
    marginBottom: 2, marginTop: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  milestoneNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: c.blue, alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  milestoneNumText: { fontSize: 10, color: c.white, fontFamily: 'Helvetica-Bold' },
  milestoneName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: c.navy },

  stageBlock: { marginLeft: 12, marginBottom: 4 },
  stageHeader: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: c.border,
    paddingBottom: 5, marginBottom: 4, marginTop: 10,
  },
  stageLine: { width: 3, height: 14, backgroundColor: c.blue, borderRadius: 2, marginRight: 8 },
  stageName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: c.navy },

  itemRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 5, paddingHorizontal: 8,
    marginLeft: 11,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  itemBullet: {
    width: 14, height: 14, borderRadius: 3,
    borderWidth: 1.5, borderColor: c.dim,
    marginRight: 8, marginTop: 1, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  itemBulletDone: { backgroundColor: c.green, borderColor: c.green },
  itemBulletCheck: { fontSize: 7, color: c.white, fontFamily: 'Helvetica-Bold' },
  itemBulletSession: { backgroundColor: '#ede9fe', borderColor: '#7757F5' },
  itemName: { fontSize: 10, color: c.navy, flex: 1, lineHeight: 1.4 },
  itemNameDone: { color: c.dim },
  itemDue: { fontSize: 9, color: c.muted, marginLeft: 8, flexShrink: 0 },
  itemTypeBadge: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 3, marginLeft: 6, flexShrink: 0,
  },
  badgeSession: { backgroundColor: '#ede9fe', color: '#5b21b6' },
  badgeRequest: { backgroundColor: c.amberLight, color: '#92400e' },

  // Requests block
  requestsHeader: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: c.navy, marginTop: 20, marginBottom: 8 },
  requestRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: '6 10', marginBottom: 3,
    borderRadius: 4, borderWidth: 1, borderColor: c.border,
  },
  requestDot: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  requestLabel: { fontSize: 10, color: c.navy, flex: 1 },
  requestStatus: { fontSize: 8, fontFamily: 'Helvetica-Bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
})

// ── Components ────────────────────────────────────────────────────────────────

function PageFooter({ repName, company, date }: { repName: string; company: string; date: string; pageNum?: number }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Prepared by {repName} · {company}</Text>
      <Text style={s.footerText}>{date}</Text>
      <Text style={s.footerText} render={({ pageNumber }) => `${pageNumber}`} />
    </View>
  )
}

function ContentPageHeader({ account }: { account: Account }) {
  return (
    <View style={s.pageHeader} fixed>
      <Text style={s.pageHeaderTitle}>Customer Onboarding Plan</Text>
      <Text style={s.pageHeaderAccount}>{account.name}</Text>
    </View>
  )
}

// ── Main Document ─────────────────────────────────────────────────────────────

export function OnboardingPlanPDF({ account, repName, companyName }: Props) {
  const date = generatedDate()
  const primaryContacts = account.contacts.slice(0, 3)

  // Build customer-visible plan items
  const planMilestones = account.milestones.map(m => ({
    ...m,
    stages: m.stages.map(s => ({
      ...s,
      customerItems: s.items.filter(isCustomerItem),
    })).filter(s => s.customerItems.length > 0),
  })).filter(m => m.stages.length > 0)

  // Customer-facing requests only (not 'complete' hidden)
  const visibleRequests = account.requests.filter(r => r.status !== 'complete')

  return (
    <Document>
      {/* ── Page 1: Cover ── */}
      <Page size="A4" style={s.coverPage}>
        <View style={s.coverTop}>
          {/* Logo */}
          <View style={s.coverLogoRow}>
            <Text style={s.coverLogoText}>
              onboard<Text style={s.coverLogoAccent}>.io</Text>
            </Text>
          </View>

          <Text style={s.coverTitle}>Customer{'\n'}Onboarding Plan</Text>
          <Text style={s.coverSubtitle}>Your complete onboarding roadmap</Text>
        </View>

        <View style={s.coverBottom}>
          <View style={s.coverField}>
            <Text style={s.coverLabel}>Prepared for</Text>
            <Text style={s.coverValue}>{account.name}</Text>
          </View>

          {primaryContacts.length > 0 && (
            <View style={s.coverField}>
              <Text style={s.coverLabel}>Contacts</Text>
              {primaryContacts.map(c => (
                <Text key={c.id} style={s.coverValueSmall}>
                  {c.name}{c.role ? ` · ${c.role}` : ''}
                </Text>
              ))}
            </View>
          )}

          <View style={s.coverField}>
            <Text style={s.coverLabel}>Prepared by</Text>
            <Text style={s.coverValueSmall}>{repName} · {companyName}</Text>
          </View>

          <View style={s.coverField}>
            <Text style={s.coverLabel}>Date</Text>
            <Text style={s.coverValueSmall}>{date}</Text>
          </View>
        </View>
      </Page>

      {/* ── Page 2: Journey Overview ── */}
      <Page size="A4" style={s.page}>
        <ContentPageHeader account={account} />

        <View style={s.content}>
          <Text style={s.sectionTitle}>Your Onboarding Journey</Text>
          <Text style={s.sectionSubtitle}>
            {"Here's an overview of the four phases of your onboarding. Each phase builds on the last."}
          </Text>

          {/* Milestone timeline — milestone boxes in a flat row, arrows as fixed-width siblings */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 32 }}>
            {account.milestones.map((m, i) => [
              <View key={m.id} style={{ flex: 1 }}>
                <View style={[s.milestoneBox, { paddingVertical: 10 }]}>
                  <Text style={s.milestoneBoxName}>{m.name}</Text>
                </View>
              </View>,
              i < account.milestones.length - 1
                ? <View key={`arrow-${i}`} style={{ width: 18, alignItems: 'center', paddingTop: 10 }}>
                    <Text style={{ fontSize: 13, color: c.blue }}>›</Text>
                  </View>
                : null,
            ])}
          </View>

          {/* Milestone details table */}
          {account.milestones.map((m, i) => (
            <View key={m.id} style={{
              flexDirection: 'row', alignItems: 'flex-start',
              padding: '10 14', marginBottom: 4,
              backgroundColor: i % 2 === 0 ? '#f8fafc' : c.white,
              borderRadius: 4,
            }}>
              <View style={{
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: c.blue,
                alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0,
              }}>
                <Text style={{ fontSize: 9, color: '#fff', fontFamily: 'Helvetica-Bold' }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: c.navy, marginBottom: 2 }}>{m.name}</Text>
                <Text style={{ fontSize: 10, color: c.muted, lineHeight: 1.4 }}>
                  {MILESTONE_DESC[m.name] || ''}
                </Text>
              </View>
            </View>
          ))}

          {/* Requests preview */}
          {visibleRequests.length > 0 && (
            <View style={{ marginTop: 24 }}>
              <Text style={s.requestsHeader}>{"Documents & Requests"}</Text>
              <Text style={{ fontSize: 10, color: c.muted, marginBottom: 10 }}>
                {"We'll send you the following documents throughout the process. Please return them by the dates agreed on during Kickoff."}
              </Text>
              {visibleRequests.map(r => {
                const dotColor = r.status === 'received' ? c.green : r.status === 'sent' ? c.blue : c.dim
                const bgColor = r.status === 'received' ? c.greenLight : r.status === 'sent' ? c.blueLight : '#f1f5f9'
                const textColor = r.status === 'received' ? '#065f46' : r.status === 'sent' ? '#007580' : c.muted
                return (
                  <View key={r.id} style={s.requestRow}>
                    <View style={[s.requestDot, { backgroundColor: dotColor }]} />
                    <Text style={s.requestLabel}>{r.label}</Text>
                    <Text style={[s.requestStatus, { backgroundColor: bgColor, color: textColor }]}>
                      {r.status}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        <PageFooter repName={repName} company={companyName} date={date} pageNum={2} />
      </Page>

      {/* ── Page 3+: What We Need From You ── */}
      <Page size="A4" style={s.page}>
        <ContentPageHeader account={account} />

        <View style={s.content}>
          <Text style={s.sectionTitle}>What We Need From You</Text>
          <Text style={s.sectionSubtitle}>
            The items below are your responsibilities across the onboarding. Sessions are included so you can plan ahead.
          </Text>

          {planMilestones.map((milestone, mi) => (
            <View key={milestone.id}>
              {/* Milestone header — kept with first stage so it never strands alone */}
              <View style={s.milestoneHeader}>
                <View style={s.milestoneNum}>
                  <Text style={s.milestoneNumText}>{mi + 1}</Text>
                </View>
                <Text style={s.milestoneName}>{milestone.name}</Text>
              </View>

              {/* Stages — wrap=false keeps each stage intact on a page */}
              {milestone.stages.map(stage => (
                <View key={stage.id} style={s.stageBlock} wrap={false}>
                  <View style={s.stageHeader}>
                    <View style={s.stageLine} />
                    <Text style={s.stageName}>{stage.name}</Text>
                  </View>

                  {stage.customerItems.map((item, idx) => {
                    const isLast = idx === stage.customerItems.length - 1
                    const isDone = item.task_done || item.session_status === 'complete'
                    const isSession = item.type === 'session'

                    return (
                      <View key={item.id} style={[s.itemRow, isLast ? { borderBottomWidth: 0 } : {}]}>
                        {/* Bullet / checkbox */}
                        <View style={[
                          s.itemBullet,
                          isDone ? s.itemBulletDone : isSession ? s.itemBulletSession : {},
                        ]}>
                          {isDone && <Text style={s.itemBulletCheck}>✓</Text>}
                        </View>

                        {/* Name */}
                        <Text style={[s.itemName, isDone ? s.itemNameDone : {}]}>
                          {item.type === 'task' ? item.task_name : item.session_name}
                        </Text>

                        {/* Type badge */}
                        {isSession && (
                          <Text style={[s.itemTypeBadge, s.badgeSession]}>session</Text>
                        )}

                        {/* Due */}
                        <Text style={s.itemDue}>
                          {isDone ? 'Done' : 'Due: TBD'}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          ))}

          {planMilestones.length === 0 && (
            <Text style={{ fontSize: 12, color: c.muted, marginTop: 20 }}>
              No customer-facing items in this plan yet.
            </Text>
          )}
        </View>

        <PageFooter repName={repName} company={companyName} date={date} pageNum={3} />
      </Page>
    </Document>
  )
}
