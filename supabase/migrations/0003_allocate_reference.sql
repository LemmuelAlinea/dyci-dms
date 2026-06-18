-- Atomic reference-number allocation. Paste into Supabase SQL Editor and run.
-- Safe to re-run (CREATE OR REPLACE).

create or replace function public.allocate_reference(p_org uuid, p_document_type uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_format text;
  v_year int := extract(year from now())::int;
  v_seq int;
begin
  -- Caller must be an active member of the org.
  if not exists (
    select 1 from public.organization_members
    where org_id = p_org and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Not a member of this organization';
  end if;

  select reference_format into v_format from public.document_types where id = p_document_type and org_id = p_org;
  if v_format is null then v_format := 'DOC-{YYYY}-{seq}'; end if;

  insert into public.reference_counters (org_id, document_type_id, year, last_seq)
  values (p_org, p_document_type, v_year, 1)
  on conflict (org_id, document_type_id, year)
  do update set last_seq = public.reference_counters.last_seq + 1
  returning last_seq into v_seq;

  return replace(replace(v_format, '{YYYY}', v_year::text), '{seq}', lpad(v_seq::text, 4, '0'));
end $$;

grant execute on function public.allocate_reference(uuid, uuid) to authenticated;
