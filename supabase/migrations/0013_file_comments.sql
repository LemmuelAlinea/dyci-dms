-- 0013_file_comments.sql
-- Adds a 'comment' sharing tier (view + comment, no download) and a
-- file_comments table so recipients with comment/edit permission can annotate.
-- Safe to re-run.

-- ─── 1. Widen shares.permission CHECK to include 'comment' ────────────────────
do $$ begin
  if exists (
    select 1 from pg_constraint
    where conname = 'shares_permission_check' and conrelid = 'public.shares'::regclass
  ) then
    alter table public.shares drop constraint shares_permission_check;
  end if;
end $$;

alter table public.shares
  add constraint shares_permission_check
  check (permission in ('view', 'comment', 'download', 'edit'));

-- ─── 2. Create file_comments table ────────────────────────────────────────────
create table if not exists public.file_comments (
  id         uuid primary key default uuid_generate_v4(),
  file_id    uuid not null references public.files(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_file_comments_file on public.file_comments(file_id);

alter table public.file_comments enable row level security;

-- ─── 3. RLS policies ──────────────────────────────────────────────────────────

-- select: visible if the parent file is visible to the caller (relies on files
-- RLS already being evaluated before this sub-select is reached).
drop policy if exists file_comments_select on public.file_comments;
create policy file_comments_select on public.file_comments
  for select using (
    exists (select 1 from public.files f where f.id = file_comments.file_id)
  );

-- insert: caller is the author AND (owner OR has comment/edit share OR org admin)
drop policy if exists file_comments_insert on public.file_comments;
create policy file_comments_insert on public.file_comments
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.files f
      where f.id = file_comments.file_id
        and (
          f.owner_id = auth.uid()
          or public.is_org_admin(f.org_id)
          or exists (
            select 1 from public.shares s
            where s.target_type = 'file'
              and s.target_id = f.id
              and s.shared_with_user_id = auth.uid()
              and s.permission in ('comment', 'edit')
          )
        )
    )
  );

-- delete: author or org admin
drop policy if exists file_comments_delete on public.file_comments;
create policy file_comments_delete on public.file_comments
  for delete using (
    author_id = auth.uid()
    or exists (
      select 1 from public.files f
      where f.id = file_comments.file_id
        and public.is_org_admin(f.org_id)
    )
  );
