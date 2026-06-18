-- ============================================================================
-- Org Types — Plan 1 schema additions. Paste into Supabase SQL Editor and run.
-- Safe to re-run.
-- ============================================================================

-- 1) Org type on organizations
alter table public.organizations add column if not exists type text not null default 'general';

-- 2) Categories
create table if not exists public.categories (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_org on public.categories(org_id);

-- 3) Positions
create table if not exists public.positions (
  id     uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name   text not null,
  sort   int not null default 0
);
create index if not exists idx_positions_org on public.positions(org_id);

-- 4) Member ↔ position
create table if not exists public.member_positions (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  unique (position_id, user_id)
);
create index if not exists idx_member_positions_user on public.member_positions(user_id);
create index if not exists idx_member_positions_pos  on public.member_positions(position_id);

-- 5) Document types (each carries its own fields/chain config — the org's copy)
create table if not exists public.document_types (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  category_id      uuid references public.categories(id) on delete set null,
  name             text not null,
  icon             text not null default 'file',
  color            text not null default 'slate',
  reference_format text not null default 'DOC-{YYYY}-{seq}',
  publishable      boolean not null default true,
  fields           jsonb not null default '[]'::jsonb,
  active           boolean not null default true,
  sort             int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists idx_doctypes_org on public.document_types(org_id);

-- 6) Ordered approval chain steps per document type
create table if not exists public.document_type_steps (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  document_type_id uuid not null references public.document_types(id) on delete cascade,
  step_no          int not null,
  position_id      uuid not null references public.positions(id) on delete cascade,
  unique (document_type_id, step_no)
);
create index if not exists idx_doctype_steps_dt on public.document_type_steps(document_type_id);

-- 7) Per-(org, document_type, year) reference counter
create table if not exists public.reference_counters (
  org_id           uuid not null references public.organizations(id) on delete cascade,
  document_type_id uuid not null references public.document_types(id) on delete cascade,
  year             int not null,
  last_seq         int not null default 0,
  primary key (org_id, document_type_id, year)
);

-- 8) File tagging columns
alter table public.files add column if not exists document_type_id uuid references public.document_types(id) on delete set null;
alter table public.files add column if not exists category_id      uuid references public.categories(id) on delete set null;
alter table public.files add column if not exists reference_no     text;
alter table public.files add column if not exists metadata         jsonb not null default '{}'::jsonb;

-- 9) Multi-step approval requests
create table if not exists public.approval_requests (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  file_id          uuid not null references public.files(id) on delete cascade,
  document_type_id uuid references public.document_types(id) on delete set null,
  version_no       int not null default 1,
  requester_id     uuid not null references public.profiles(id) on delete cascade,
  status           approval_status not null default 'pending',
  current_step     int not null default 1,
  message          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_areq_file on public.approval_requests(file_id);
create index if not exists idx_areq_requester on public.approval_requests(requester_id);

-- 10) Ordered step assignments (who approves each step)
create table if not exists public.approval_step_assignments (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  request_id  uuid not null references public.approval_requests(id) on delete cascade,
  step_no     int not null,
  position_id uuid references public.positions(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete set null,
  status      text not null default 'waiting',  -- waiting | pending | approved | rejected
  decided_at  timestamptz,
  unique (request_id, step_no)
);
create index if not exists idx_asa_request on public.approval_step_assignments(request_id);
create index if not exists idx_asa_assignee on public.approval_step_assignments(assignee_id);

-- 11) Point approval comments at the new request (keep old column for back-compat)
alter table public.approval_comments add column if not exists request_id uuid references public.approval_requests(id) on delete cascade;
create index if not exists idx_comments_request on public.approval_comments(request_id);

-- updated_at trigger for approval_requests
drop trigger if exists trg_touch_areq on public.approval_requests;
create trigger trg_touch_areq before update on public.approval_requests
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.categories                enable row level security;
alter table public.positions                 enable row level security;
alter table public.member_positions          enable row level security;
alter table public.document_types            enable row level security;
alter table public.document_type_steps       enable row level security;
alter table public.reference_counters        enable row level security;
alter table public.approval_requests         enable row level security;
alter table public.approval_step_assignments enable row level security;

-- Config tables: readable by org members, writable by org admin or system admin
do $$
declare t text;
begin
  foreach t in array array['categories','positions','document_types','document_type_steps','member_positions'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format('create policy %1$s_select on public.%1$s for select using (is_system_admin() or is_org_member(org_id));', t);
    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format('create policy %1$s_write on public.%1$s for all using (is_system_admin() or is_org_admin(org_id)) with check (is_system_admin() or is_org_admin(org_id));', t);
  end loop;
end $$;

-- reference_counters: only service role / triggers touch this; allow select to members
drop policy if exists refcounters_select on public.reference_counters;
create policy refcounters_select on public.reference_counters for select using (is_org_member(org_id));

-- approval_requests
drop policy if exists areq_select on public.approval_requests;
create policy areq_select on public.approval_requests for select using (
  requester_id = auth.uid() or is_org_admin(org_id)
  or exists (select 1 from public.approval_step_assignments a where a.request_id = approval_requests.id and a.assignee_id = auth.uid())
);
drop policy if exists areq_insert on public.approval_requests;
create policy areq_insert on public.approval_requests for insert with check (is_org_member(org_id) and requester_id = auth.uid());
drop policy if exists areq_update on public.approval_requests;
create policy areq_update on public.approval_requests for update using (
  is_org_admin(org_id)
  or exists (select 1 from public.approval_step_assignments a where a.request_id = approval_requests.id and a.assignee_id = auth.uid())
);

-- approval_step_assignments (visible iff parent request visible)
drop policy if exists asa_select on public.approval_step_assignments;
create policy asa_select on public.approval_step_assignments for select using (
  exists (select 1 from public.approval_requests r where r.id = approval_step_assignments.request_id)
);
drop policy if exists asa_update on public.approval_step_assignments;
create policy asa_update on public.approval_step_assignments for update using (
  assignee_id = auth.uid() or is_org_admin(org_id)
);
drop policy if exists asa_insert on public.approval_step_assignments;
create policy asa_insert on public.approval_step_assignments for insert with check (is_org_member(org_id));

-- approval_comments via request (participants)
drop policy if exists comments_select_req on public.approval_comments;
create policy comments_select_req on public.approval_comments for select using (
  approval_id is not null and exists (select 1 from public.approvals a where a.id = approval_comments.approval_id)
  or request_id is not null and exists (select 1 from public.approval_requests r where r.id = approval_comments.request_id)
);
