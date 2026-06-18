-- Saved report filter/column presets, per user. Paste into Supabase SQL Editor and run.
-- Safe to re-run.

create table if not exists public.report_presets (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  org_id     uuid references public.organizations(id) on delete cascade,
  report_key text not null,
  name       text not null,
  params     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_report_presets_user on public.report_presets(user_id, report_key);

alter table public.report_presets enable row level security;
drop policy if exists presets_all on public.report_presets;
create policy presets_all on public.report_presets for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
