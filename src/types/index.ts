export type Sku = 'dispatch' | 'facility_management' | 'full_suite'
export type Addon = 'brokerage' | 'export' | 'api'
export type StageStatus = 'locked' | 'active' | 'unlocked' | 'complete'
export type ItemType = 'task' | 'session' | 'record' | 'handoff' | 'log' | 'dependency' | 'golive'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
  created_at: string
}

export interface LogEntry {
  id: string
  date: string        // YYYY-MM-DD
  usage_type: string  // e.g. "Jobs", "Drivers"
  count: number
  created_at: string
  text?: string       // legacy free-text entries
}
export type AssigneeKey = 'personal' | 'customer' | 'internal' | string
export type TaskSource = 'plan' | 'email' | 'session' | 'manual'

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  name: string
  role: string
  assignee_key: string
  avatar_url?: string | null
  created_at: string
}

export type HealthStatus = 'active' | 'stalled' | 'on_hold' | 'unresponsive' | 'blocked'

export interface Account {
  id: string
  org_id: string
  name: string
  sku: Sku
  addons: Addon[]
  arr: number
  sales_context?: string
  owner_id?: string
  health_status: HealthStatus
  go_live_date?: string | null
  kickoff_date?: string | null
  current_software?: string | null
  core_system_requirements?: string | null
  notes?: string | null
  paused_days?: number | null
  plan_template_id?: string | null
  created_at: string
  updated_at: string
  // joined / computed
  contacts?: Contact[]
  milestones?: Milestone[]
  interactions?: Interaction[]
  requests?: Request[]
  open_tasks?: OpenTask[]
}

export interface Contact {
  id: string
  account_id: string
  name: string
  role?: string
  email?: string
  phone?: string
  primary_contact: boolean
  created_at: string
}

export interface Milestone {
  id: string
  account_id: string
  name: string
  order_index: number
  stages: Stage[]
}

export interface Stage {
  id: string
  milestone_id: string
  name: string
  status: StageStatus
  order_index: number
  items: Item[]
  checklist?: ChecklistItem[]
}

export interface Item {
  id: string
  stage_id: string
  type: ItemType
  required: boolean
  order_index: number
  training_template_id?: string | null
  // task
  task_name?: string
  task_assignee?: AssigneeKey
  task_source?: TaskSource
  task_done?: boolean
  task_notes?: string
  // session
  session_name?: string
  session_goals?: string[]
  session_agenda?: string[]
  session_notes?: string
  session_status?: 'pending' | 'complete'
  session_action_items?: SessionActionItem[]
  // record
  record_name?: string
  record_fields?: RecordField[]
  // handoff
  handoff_name?: string
  handoff_incoming_rep?: string
  handoff_report?: string
  // sub-checklist
  checklist?: ChecklistItem[]
  // log
  log_entries?: LogEntry[]
  // joined
  action_items?: ActionItem[]
  created_at?: string
  updated_at?: string
}

export interface SessionActionItem {
  id: string
  text: string
  done: boolean
  assignee?: string
  created_at: string
  open_task_id?: string
}

export interface RecordField {
  label: string
  value: string
  type: 'text' | 'number' | 'textarea'
}

export interface ActionItem {
  id: string
  item_id: string
  name: string
  assignee: AssigneeKey
  source: TaskSource
  done: boolean
  created_at: string
}

export interface Interaction {
  id: string
  account_id: string
  type: string
  summary: string
  detail?: string
  user_id?: string
  event_at?: string | null
  created_at: string
}

export interface Request {
  id: string
  account_id: string
  type: string
  label: string
  status: 'pending' | 'sent' | 'received' | 'complete'
  sent_at?: string
  received_at?: string
  notes?: string
  created_at: string
}

export interface OpenTask {
  id: string
  account_id: string
  name: string
  assignee: AssigneeKey
  source: TaskSource
  done: boolean
  notes?: string
  created_at: string
  // New unified work-item model
  item_type:   'task' | 'dependency'
  item_owner:  'respark' | 'customer'
  item_status: 'open' | 'waiting' | 'done' | 'cancelled'
  why_important?: string
}

export type AiSuggestionCategory = 'extracted' | 'completion' | 'sync' | 'next_action'

export interface AiSuggestionMeta {
  // For category = 'extracted'
  suggestion_category?: AiSuggestionCategory
  item_type?:   'task' | 'dependency'
  item_owner?:  'respark' | 'customer'
  item_status?: 'open' | 'waiting' | 'done'
  source?:      string
  source_label?: string
  why_important?: string
  // For category = 'completion'
  plan_item_id?:   string
  plan_item_type?: 'task' | 'session' | 'stage'
  plan_item_name?: string
  milestone_name?: string
  stage_name?:     string
  stage_id?:       string
  // For category = 'next_action'
  priority?: 'high' | 'medium' | 'low'
  // For type = 'meeting_review'
  gcal_event_id?: string
  event_at?: string
  event_title?: string
}

export interface AiSuggestion {
  id: string
  account_id: string
  account_name?: string   // joined from accounts table
  type: string
  title: string
  body?: string
  meta?: AiSuggestionMeta
  status: 'pending' | 'confirmed' | 'snoozed' | 'dismissed'
  created_at: string
}

export interface TrainingTemplate {
  id: string
  org_id: string
  name: string
  triggers: string[]
  duration_minutes?: number
  description?: string
}

export interface SessionTemplate {
  id: string
  org_id: string
  name: string
  description?: string
  duration_minutes?: number
  agenda: string[]
  tasks: { name: string; assignee: string }[]
}

export interface PlanTemplateItem {
  type: 'task' | 'session' | 'handoff' | 'log' | 'exchange'
  name: string
  assignee?: string
  required: boolean
  session_template_id?: string
  training_template_id?: string
}

export interface PlanTemplateStage {
  name: string
  items: PlanTemplateItem[]
}

export interface PlanTemplateMilestone {
  name: string
  stages: PlanTemplateStage[]
}

export interface PlanTemplateStructure {
  milestones: PlanTemplateMilestone[]
}

export interface PlanTemplate {
  id: string
  org_id: string
  name: string
  description?: string
  sku?: string
  is_default: boolean
  structure: PlanTemplateStructure
  created_at: string
  archived_at?: string | null
}

export interface Resource {
  id: string
  org_id: string
  title: string
  url: string
  description?: string | null
  created_at: string
}

export interface Connector {
  id: string
  org_id: string
  name: string
  provider: string
  status: 'connected' | 'disconnected'
  connected_at?: string
}

// Computed for dashboard display
export interface AccountSummary extends Account {
  currentStage?: string
  completionPct: number
  daysSinceContact: number
  lastContactDate?: string
  daysSinceOutreach: number
  lastOutreachDate?: string
  openTaskCount: number
}

export type QuickLogType = 'called' | 'texted' | 'bumped_email' | 'sent_follow_up' | 'internal_note' | 'custom'
export type QuickLogOutcome = 'reached' | 'left_voicemail' | 'no_answer'
