// Supabase DB types — loosely typed until auto-generation is set up
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export type Database = {
  public: {
    Tables: {
      organizations: { Row: Row; Insert: Row; Update: Row }
      org_members: { Row: Row; Insert: Row; Update: Row }
      accounts: { Row: Row; Insert: Row; Update: Row }
      contacts: { Row: Row; Insert: Row; Update: Row }
      milestones: { Row: Row; Insert: Row; Update: Row }
      stages: { Row: Row; Insert: Row; Update: Row }
      items: { Row: Row; Insert: Row; Update: Row }
      action_items: { Row: Row; Insert: Row; Update: Row }
      interactions: { Row: Row; Insert: Row; Update: Row }
      requests: { Row: Row; Insert: Row; Update: Row }
      open_tasks: { Row: Row; Insert: Row; Update: Row }
      ai_suggestions: { Row: Row; Insert: Row; Update: Row }
      training_templates: { Row: Row; Insert: Row; Update: Row }
      connectors: { Row: Row; Insert: Row; Update: Row }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
