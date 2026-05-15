-- Intake form integration tables
-- Adds intake_tokens, hardware_tasks, report_tasks, compliance_tasks
-- and per-tab notes columns on accounts.

-- ─── intake_tokens ───────────────────────────────────────────────────────────
create table if not exists intake_tokens (
  id           uuid primary key default gen_random_uuid(),
  token        uuid unique not null default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  rep_id       uuid not null references org_members(id) on delete cascade,
  submitted_at timestamptz,
  expires_at   timestamptz not null default (now() + interval '30 days'),
  created_at   timestamptz not null default now()
);

create index if not exists intake_tokens_account_id_idx on intake_tokens(account_id);
create index if not exists intake_tokens_token_idx on intake_tokens(token);

alter table intake_tokens enable row level security;

create policy "org members can read tokens for their org accounts"
  on intake_tokens for select
  using (
    account_id in (
      select id from accounts where org_id = (
        select org_id from org_members where user_id = auth.uid() limit 1
      )
    )
  );

create policy "org members can insert tokens"
  on intake_tokens for insert
  with check (
    account_id in (
      select id from accounts where org_id = (
        select org_id from org_members where user_id = auth.uid() limit 1
      )
    )
  );

-- ─── hardware_tasks ──────────────────────────────────────────────────────────
create table if not exists hardware_tasks (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references accounts(id) on delete cascade,
  rep_id         uuid references org_members(id) on delete set null,
  name           text not null,
  type           text not null check (type in ('floor_scale','truck_scale','camera','tablet','other')),
  location_label text,
  completed      boolean not null default false,
  completed_at   timestamptz,
  notes          text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists hardware_tasks_account_id_idx on hardware_tasks(account_id);

alter table hardware_tasks enable row level security;

create policy "org members can manage hardware tasks"
  on hardware_tasks for all
  using (
    account_id in (
      select id from accounts where org_id = (
        select org_id from org_members where user_id = auth.uid() limit 1
      )
    )
  );

-- ─── report_tasks ────────────────────────────────────────────────────────────
create table if not exists report_tasks (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references accounts(id) on delete cascade,
  rep_id         uuid references org_members(id) on delete set null,
  legacy_name    text not null,
  date_range     text,
  purpose        text,
  key_columns    text,
  converted_name text,
  status         text not null default 'not_started' check (status in ('not_started','in_progress','complete')),
  notes          text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists report_tasks_account_id_idx on report_tasks(account_id);

alter table report_tasks enable row level security;

create policy "org members can manage report tasks"
  on report_tasks for all
  using (
    account_id in (
      select id from accounts where org_id = (
        select org_id from org_members where user_id = auth.uid() limit 1
      )
    )
  );

-- ─── compliance_tasks ────────────────────────────────────────────────────────
create table if not exists compliance_tasks (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references accounts(id) on delete cascade,
  rep_id           uuid references org_members(id) on delete set null,
  name             text not null,
  category         text not null default 'other' check (category in ('government_upload','regulatory_config','document_template','other')),
  assigned_session text,
  completed        boolean not null default false,
  completed_at     timestamptz,
  notes            text,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists compliance_tasks_account_id_idx on compliance_tasks(account_id);

alter table compliance_tasks enable row level security;

create policy "org members can manage compliance tasks"
  on compliance_tasks for all
  using (
    account_id in (
      select id from accounts where org_id = (
        select org_id from org_members where user_id = auth.uid() limit 1
      )
    )
  );

-- ─── per-tab notes on accounts ───────────────────────────────────────────────
alter table accounts
  add column if not exists hardware_notes  text,
  add column if not exists reporting_notes text,
  add column if not exists compliance_notes text;
