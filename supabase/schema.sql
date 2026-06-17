-- ============================================================================
-- DYCI Document Management System — DATABASE SCHEMA
-- Paste this whole file into the Supabase SQL Editor and run it.
-- (Then run seed.sql to register the System Admin email.)
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------
do $$ begin
  create type org_role     as enum ('admin', 'co_admin', 'staff', 'approver');
exception when duplicate_object then null; end $$;

do $$ begin
  create type doc_status   as enum ('draft', 'pending', 'approved', 'released', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_status as enum ('invited', 'active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type node_state   as enum ('active', 'archived', 'trashed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. SYSTEM ADMIN ALLOWLIST  (which emails become System Admins on signup)
-- ----------------------------------------------------------------------------
create table if not exists public.system_admin_allowlist (
  email text primary key
);

-- ----------------------------------------------------------------------------
-- 3. PROFILES  (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text unique not null,
  full_name       text,
  avatar_url      text,
  is_system_admin boolean not null default false,
  theme           text not null default 'light',          -- 'light' | 'dark' | 'system'
  notif_prefs     jsonb not null default '{"approvals":true,"shares":true,"releases":true,"messages":true}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. ORGANIZATIONS  (offices)
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  code                text not null unique,                -- e.g. SOA, CCS, CBEA
  admin_id            uuid references public.profiles(id) on delete set null,
  created_by          uuid references public.profiles(id) on delete set null,
  storage_used_bytes  bigint not null default 0,
  storage_quota_bytes bigint not null default 5368709120,  -- 5 GB default
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. ORGANIZATION MEMBERS
-- ----------------------------------------------------------------------------
create table if not exists public.organization_members (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        org_role not null default 'staff',
  status      member_status not null default 'active',
  invited_by  uuid references public.profiles(id) on delete set null,
  joined_at   timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists idx_members_user on public.organization_members(user_id);
create index if not exists idx_members_org  on public.organization_members(org_id);

-- ----------------------------------------------------------------------------
-- 6. INVITATIONS
-- ----------------------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  role        org_role not null default 'staff',
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  status      text not null default 'pending',             -- pending | accepted | revoked | expired
  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '14 days')
);
create index if not exists idx_invitations_email on public.invitations(email);

-- ----------------------------------------------------------------------------
-- 7. FOLDERS
-- ----------------------------------------------------------------------------
create table if not exists public.folders (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.folders(id) on delete cascade,
  name        text not null,
  state       node_state not null default 'active',
  archived_at timestamptz,
  trashed_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_folders_parent on public.folders(parent_id);
create index if not exists idx_folders_owner  on public.folders(owner_id);

-- ----------------------------------------------------------------------------
-- 8. FILES
-- ----------------------------------------------------------------------------
create table if not exists public.files (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  folder_id       uuid references public.folders(id) on delete set null,
  name            text not null,
  mime            text,
  kind            text not null default 'other',           -- pdf | docx | xlsx | gdoc | gsheet | other
  size_bytes      bigint not null default 0,
  current_version int not null default 1,
  status          doc_status not null default 'draft',
  state           node_state not null default 'active',
  released_at     timestamptz,
  approved_by     uuid references public.profiles(id) on delete set null,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_files_folder on public.files(folder_id);
create index if not exists idx_files_owner  on public.files(owner_id);
create index if not exists idx_files_org    on public.files(org_id);
create index if not exists idx_files_status on public.files(status);

-- ----------------------------------------------------------------------------
-- 9. FILE VERSIONS
-- ----------------------------------------------------------------------------
create table if not exists public.file_versions (
  id            uuid primary key default uuid_generate_v4(),
  file_id       uuid not null references public.files(id) on delete cascade,
  version_no    int not null,
  storage_path  text not null,
  size_bytes    bigint not null default 0,
  mime          text,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  unique (file_id, version_no)
);
create index if not exists idx_versions_file on public.file_versions(file_id);

-- ----------------------------------------------------------------------------
-- 10. APPROVALS
-- ----------------------------------------------------------------------------
create table if not exists public.approvals (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  file_id      uuid not null references public.files(id) on delete cascade,
  version_no   int not null default 1,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  approver_id  uuid not null references public.profiles(id) on delete cascade,
  status       approval_status not null default 'pending',
  message      text,
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_approvals_file     on public.approvals(file_id);
create index if not exists idx_approvals_approver on public.approvals(approver_id);
create index if not exists idx_approvals_requester on public.approvals(requester_id);

-- ----------------------------------------------------------------------------
-- 11. APPROVAL COMMENTS  (Drive-style threaded review)
-- ----------------------------------------------------------------------------
create table if not exists public.approval_comments (
  id           uuid primary key default uuid_generate_v4(),
  approval_id  uuid not null references public.approvals(id) on delete cascade,
  author_id    uuid not null references public.profiles(id) on delete cascade,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_comments_approval on public.approval_comments(approval_id);

-- ----------------------------------------------------------------------------
-- 12. SHARES  (access grants to org members)
-- ----------------------------------------------------------------------------
create table if not exists public.shares (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  target_type         text not null check (target_type in ('file','folder')),
  target_id           uuid not null,
  shared_by           uuid not null references public.profiles(id) on delete cascade,
  shared_with_user_id uuid references public.profiles(id) on delete cascade,
  permission          text not null default 'view' check (permission in ('view','download')),
  created_at          timestamptz not null default now()
);
create index if not exists idx_shares_target on public.shares(target_type, target_id);
create index if not exists idx_shares_with   on public.shares(shared_with_user_id);

-- ----------------------------------------------------------------------------
-- 13. EMAIL LOG  (external sends via Brevo)
-- ----------------------------------------------------------------------------
create table if not exists public.email_log (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid references public.organizations(id) on delete set null,
  sender_id        uuid references public.profiles(id) on delete set null,
  to_email         text not null,
  subject          text,
  body             text,
  attachment_meta  jsonb,
  status           text not null default 'sent',
  brevo_message_id text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_email_sender on public.email_log(sender_id);

-- ----------------------------------------------------------------------------
-- 14. NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications(user_id, read);

-- ----------------------------------------------------------------------------
-- 15. ACTIVITY LOG  (powers org/admin reports + feeds)
-- ----------------------------------------------------------------------------
create table if not exists public.activity_log (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid references public.organizations(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  uuid,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_org on public.activity_log(org_id, created_at desc);

-- ============================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER — break RLS recursion)
-- ============================================================================
create or replace function public.is_system_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_system_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.org_role_of(p_org uuid)
returns org_role language sql stable security definer set search_path = public as $$
  select role from public.organization_members
  where org_id = p_org and user_id = auth.uid() and status = 'active';
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org and user_id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.can_invite(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org and user_id = auth.uid()
      and role in ('admin','co_admin') and status = 'active'
  );
$$;

-- Breadcrumb path for a folder (root → leaf)
create or replace function public.folder_breadcrumb(p_folder uuid)
returns table (id uuid, name text, depth int)
language sql stable security definer set search_path = public as $$
  with recursive trail as (
    select f.id, f.name, f.parent_id, 0 as depth
    from public.folders f where f.id = p_folder
    union all
    select f.id, f.name, f.parent_id, t.depth + 1
    from public.folders f join trail t on f.id = t.parent_id
  )
  select id, name, depth from trail order by depth desc;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- 1) Auto-create profile on signup; promote System Admin if allowlisted.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, is_system_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url',
    exists (select 1 from public.system_admin_allowlist a where lower(a.email) = lower(new.email))
  )
  on conflict (id) do update set email = excluded.email;

  -- Auto-accept any pending invitations addressed to this email.
  insert into public.organization_members (org_id, user_id, role, status, invited_by)
  select i.org_id, new.id, i.role, 'active', i.invited_by
  from public.invitations i
  where lower(i.email) = lower(new.email) and i.status = 'pending'
  on conflict (org_id, user_id) do nothing;

  -- If an accepted invitation made this user an org admin, record it on the org.
  update public.organizations o
  set admin_id = new.id
  from public.invitations i
  where i.org_id = o.id and lower(i.email) = lower(new.email) and i.role = 'admin';

  update public.invitations
  set status = 'accepted'
  where lower(email) = lower(new.email) and status = 'pending';

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Maintain organizations.storage_used_bytes from file_versions.
create or replace function public.sync_org_storage()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_delta bigint;
begin
  if (tg_op = 'INSERT') then
    select org_id into v_org from public.files where id = new.file_id;
    v_delta := new.size_bytes;
  elsif (tg_op = 'DELETE') then
    select org_id into v_org from public.files where id = old.file_id;
    v_delta := -old.size_bytes;
  end if;
  if v_org is not null then
    update public.organizations set storage_used_bytes = greatest(0, storage_used_bytes + v_delta) where id = v_org;
  end if;
  return null;
end $$;

drop trigger if exists trg_sync_storage on public.file_versions;
create trigger trg_sync_storage
  after insert or delete on public.file_versions
  for each row execute function public.sync_org_storage();

-- 3) Released files cannot be binned directly — they must be archived first.
--    (active+released  -> trashed = blocked;  archived+released -> trashed = allowed)
create or replace function public.guard_released_trash()
returns trigger language plpgsql as $$
begin
  if new.state = 'trashed' and old.status = 'released' and old.state <> 'archived' then
    raise exception 'Released papers cannot be moved to Bin directly. Archive it first, then delete from the Archive.';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_release on public.files;
create trigger trg_guard_release
  before update on public.files
  for each row execute function public.guard_released_trash();

-- 4) updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','organizations','folders','files','approvals'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s;', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles              enable row level security;
alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;
alter table public.invitations           enable row level security;
alter table public.folders               enable row level security;
alter table public.files                 enable row level security;
alter table public.file_versions         enable row level security;
alter table public.approvals             enable row level security;
alter table public.approval_comments     enable row level security;
alter table public.shares                enable row level security;
alter table public.email_log             enable row level security;
alter table public.notifications         enable row level security;
alter table public.activity_log          enable row level security;
alter table public.system_admin_allowlist enable row level security;

-- ---- PROFILES ----
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or is_system_admin()
  or exists (                                    -- co-members can see each other
    select 1 from public.organization_members m1
    join public.organization_members m2 on m1.org_id = m2.org_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  )
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- ORGANIZATIONS ----
drop policy if exists orgs_select on public.organizations;
create policy orgs_select on public.organizations for select using (
  is_system_admin() or is_org_member(id)
);
drop policy if exists orgs_insert on public.organizations;
create policy orgs_insert on public.organizations for insert with check (is_system_admin());
drop policy if exists orgs_update on public.organizations;
create policy orgs_update on public.organizations for update using (is_system_admin() or is_org_admin(id));
drop policy if exists orgs_delete on public.organizations;
create policy orgs_delete on public.organizations for delete using (is_system_admin());

-- ---- ORGANIZATION MEMBERS ----
drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members for select using (
  is_system_admin() or user_id = auth.uid() or is_org_member(org_id)
);
drop policy if exists members_insert on public.organization_members;
create policy members_insert on public.organization_members for insert with check (
  is_system_admin() or can_invite(org_id)
);
drop policy if exists members_update on public.organization_members;
create policy members_update on public.organization_members for update using (
  is_system_admin() or is_org_admin(org_id)
);
drop policy if exists members_delete on public.organization_members;
create policy members_delete on public.organization_members for delete using (
  is_system_admin() or is_org_admin(org_id)
);

-- ---- INVITATIONS ----
drop policy if exists invites_select on public.invitations;
create policy invites_select on public.invitations for select using (
  is_system_admin() or can_invite(org_id) or lower(email) = lower(coalesce(auth.jwt()->>'email',''))
);
drop policy if exists invites_insert on public.invitations;
create policy invites_insert on public.invitations for insert with check (can_invite(org_id) or is_system_admin());
drop policy if exists invites_update on public.invitations;
create policy invites_update on public.invitations for update using (can_invite(org_id) or lower(email) = lower(coalesce(auth.jwt()->>'email','')));

-- ---- FOLDERS ----
drop policy if exists folders_select on public.folders;
create policy folders_select on public.folders for select using (
  is_org_member(org_id) and (
    owner_id = auth.uid()
    or is_org_admin(org_id)
    or exists (select 1 from public.shares s where s.target_type='folder' and s.target_id = folders.id and s.shared_with_user_id = auth.uid())
  )
);
drop policy if exists folders_insert on public.folders;
create policy folders_insert on public.folders for insert with check (is_org_member(org_id) and owner_id = auth.uid());
drop policy if exists folders_update on public.folders;
create policy folders_update on public.folders for update using (is_org_member(org_id) and (owner_id = auth.uid() or is_org_admin(org_id)));
drop policy if exists folders_delete on public.folders;
create policy folders_delete on public.folders for delete using (owner_id = auth.uid() or is_org_admin(org_id));

-- ---- FILES ----
drop policy if exists files_select on public.files;
create policy files_select on public.files for select using (
  is_org_member(org_id) and (
    owner_id = auth.uid()
    or status = 'released'
    or is_org_admin(org_id)
    or exists (select 1 from public.shares s where s.target_type='file' and s.target_id = files.id and s.shared_with_user_id = auth.uid())
  )
);
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert with check (is_org_member(org_id) and owner_id = auth.uid());
drop policy if exists files_update on public.files;
create policy files_update on public.files for update using (
  is_org_member(org_id) and (owner_id = auth.uid() or is_org_admin(org_id) or approved_by = auth.uid())
);
drop policy if exists files_delete on public.files;
create policy files_delete on public.files for delete using (owner_id = auth.uid() or is_org_admin(org_id));

-- ---- FILE VERSIONS (visible iff parent file is visible) ----
drop policy if exists versions_select on public.file_versions;
create policy versions_select on public.file_versions for select using (
  exists (select 1 from public.files f where f.id = file_versions.file_id)
);
drop policy if exists versions_insert on public.file_versions;
create policy versions_insert on public.file_versions for insert with check (
  exists (select 1 from public.files f where f.id = file_versions.file_id and (f.owner_id = auth.uid() or is_org_admin(f.org_id)))
);
drop policy if exists versions_delete on public.file_versions;
create policy versions_delete on public.file_versions for delete using (
  exists (select 1 from public.files f where f.id = file_versions.file_id and (f.owner_id = auth.uid() or is_org_admin(f.org_id)))
);

-- ---- APPROVALS ----
drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals for select using (
  requester_id = auth.uid() or approver_id = auth.uid() or is_org_admin(org_id)
);
drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals for insert with check (
  is_org_member(org_id) and requester_id = auth.uid()
);
drop policy if exists approvals_update on public.approvals;
create policy approvals_update on public.approvals for update using (
  approver_id = auth.uid() or is_org_admin(org_id)
);

-- ---- APPROVAL COMMENTS (participants only) ----
drop policy if exists comments_select on public.approval_comments;
create policy comments_select on public.approval_comments for select using (
  exists (select 1 from public.approvals a where a.id = approval_comments.approval_id)
);
drop policy if exists comments_insert on public.approval_comments;
create policy comments_insert on public.approval_comments for insert with check (
  author_id = auth.uid()
  and exists (select 1 from public.approvals a
              where a.id = approval_comments.approval_id
                and (a.requester_id = auth.uid() or a.approver_id = auth.uid() or is_org_admin(a.org_id)))
);

-- ---- SHARES ----
drop policy if exists shares_select on public.shares;
create policy shares_select on public.shares for select using (
  shared_by = auth.uid() or shared_with_user_id = auth.uid() or is_org_admin(org_id)
);
drop policy if exists shares_insert on public.shares;
create policy shares_insert on public.shares for insert with check (is_org_member(org_id) and shared_by = auth.uid());
drop policy if exists shares_delete on public.shares;
create policy shares_delete on public.shares for delete using (shared_by = auth.uid() or is_org_admin(org_id));

-- ---- EMAIL LOG ----
drop policy if exists email_select on public.email_log;
create policy email_select on public.email_log for select using (sender_id = auth.uid() or is_system_admin());
drop policy if exists email_insert on public.email_log;
create policy email_insert on public.email_log for insert with check (sender_id = auth.uid());

-- ---- NOTIFICATIONS ----
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update using (user_id = auth.uid());
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert with check (true); -- written by triggers / service role

-- ---- ACTIVITY LOG ----
drop policy if exists activity_select on public.activity_log;
create policy activity_select on public.activity_log for select using (is_system_admin() or is_org_admin(org_id));
drop policy if exists activity_insert on public.activity_log;
create policy activity_insert on public.activity_log for insert with check (is_org_member(org_id) or is_system_admin());

-- ---- SYSTEM ADMIN ALLOWLIST (read-only to clients; managed via SQL / service role) ----
drop policy if exists allowlist_select on public.system_admin_allowlist;
create policy allowlist_select on public.system_admin_allowlist for select using (is_system_admin());

-- ============================================================================
-- STORAGE BUCKETS + POLICIES
-- (Buckets are also created in the UI per docs; this is idempotent.)
-- ============================================================================
insert into storage.buckets (id, name, public) values ('documents','documents', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
  on conflict (id) do nothing;

-- documents: path = {org_id}/{owner_id}/{file_id}/v{n}.{ext}
drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects for select to authenticated using (
  bucket_id = 'documents' and public.is_org_member((split_part(name,'/',1))::uuid)
);
drop policy if exists documents_write on storage.objects;
create policy documents_write on storage.objects for insert to authenticated with check (
  bucket_id = 'documents'
  and public.is_org_member((split_part(name,'/',1))::uuid)
  and (split_part(name,'/',2))::uuid = auth.uid()
);
drop policy if exists documents_modify on storage.objects;
create policy documents_modify on storage.objects for update to authenticated using (
  bucket_id = 'documents' and (split_part(name,'/',2))::uuid = auth.uid()
);
drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects for delete to authenticated using (
  bucket_id = 'documents'
  and ( (split_part(name,'/',2))::uuid = auth.uid() or public.is_org_admin((split_part(name,'/',1))::uuid) )
);

-- avatars: path = {user_id}/avatar.ext  (public read)
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (split_part(name,'/',1))::uuid = auth.uid()
);
drop policy if exists avatars_modify on storage.objects;
create policy avatars_modify on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and (split_part(name,'/',1))::uuid = auth.uid()
);

-- ============================================================================
-- REALTIME  (so the notifications bell updates live)
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

alter table public.notifications replica identity full;

-- ============================================================================
-- DONE.  Next: run seed.sql to register your System Admin email.
-- ============================================================================
