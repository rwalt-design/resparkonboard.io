-- Add form_slug to accounts so the webhook can map a slug → account_id.
-- Add source_submission_id to task tables for idempotency (skip duplicate webhooks).

alter table accounts
  add column if not exists form_slug text unique;

alter table hardware_tasks
  add column if not exists source_submission_id text;

alter table report_tasks
  add column if not exists source_submission_id text;

alter table compliance_tasks
  add column if not exists source_submission_id text;

create index if not exists hardware_tasks_submission_id_idx  on hardware_tasks(source_submission_id);
create index if not exists report_tasks_submission_id_idx    on report_tasks(source_submission_id);
create index if not exists compliance_tasks_submission_id_idx on compliance_tasks(source_submission_id);
