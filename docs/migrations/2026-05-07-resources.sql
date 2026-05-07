-- Resources library: org-wide bookmark manager
create table if not exists resources (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  title       text not null,
  url         text not null,
  description text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

alter table resources enable row level security;

create policy "org members can select resources" on resources
  for select using (
    exists (select 1 from org_members om where om.org_id = resources.org_id and om.user_id = auth.uid())
  );
create policy "org members can insert resources" on resources
  for insert with check (
    exists (select 1 from org_members om where om.org_id = resources.org_id and om.user_id = auth.uid())
  );
create policy "org members can update resources" on resources
  for update using (
    exists (select 1 from org_members om where om.org_id = resources.org_id and om.user_id = auth.uid())
  );
create policy "org members can delete resources" on resources
  for delete using (
    exists (select 1 from org_members om where om.org_id = resources.org_id and om.user_id = auth.uid())
  );

-- Account ↔ resource junction
create table if not exists account_resources (
  account_id  uuid not null references accounts(id)  on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  primary key (account_id, resource_id)
);

alter table account_resources enable row level security;

create policy "org members can manage account_resources" on account_resources
  for all using (
    exists (
      select 1 from accounts a
      join org_members om on om.org_id = a.org_id
      where a.id = account_resources.account_id and om.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from accounts a
      join org_members om on om.org_id = a.org_id
      where a.id = account_resources.account_id and om.user_id = auth.uid()
    )
  );

-- Item ↔ resource junction (sessions, exchanges, etc.)
create table if not exists item_resources (
  item_id     uuid not null references items(id)     on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  primary key (item_id, resource_id)
);

alter table item_resources enable row level security;

create policy "org members can manage item_resources" on item_resources
  for all using (
    exists (
      select 1 from items i
      join stages s    on s.id = i.stage_id
      join milestones m on m.id = s.milestone_id
      join accounts a  on a.id = m.account_id
      join org_members om on om.org_id = a.org_id
      where i.id = item_resources.item_id and om.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from items i
      join stages s    on s.id = i.stage_id
      join milestones m on m.id = s.milestone_id
      join accounts a  on a.id = m.account_id
      join org_members om on om.org_id = a.org_id
      where i.id = item_resources.item_id and om.user_id = auth.uid()
    )
  );
