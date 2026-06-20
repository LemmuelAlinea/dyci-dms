-- 0015_multifile.sql — multi-file document types + attachments. Safe to re-run.

-- 1) allow multiple files per document on a document type
alter table public.document_types
  add column if not exists allow_multiple boolean not null default false;

-- 2) flat attachments belonging to a document (the files row stays the primary + versions)
create table if not exists public.file_attachments (
  id           uuid primary key default uuid_generate_v4(),
  file_id      uuid not null references public.files(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null,
  storage_path text not null,
  size_bytes   bigint not null default 0,
  mime         text,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_file_attachments_file on public.file_attachments(file_id);
alter table public.file_attachments enable row level security;

drop policy if exists file_attachments_select on public.file_attachments;
create policy file_attachments_select on public.file_attachments for select using (
  exists (select 1 from public.files f where f.id = file_attachments.file_id)
);
drop policy if exists file_attachments_write on public.file_attachments;
create policy file_attachments_write on public.file_attachments for insert with check (
  exists (
    select 1
    from public.files f
    join public.document_types dt on dt.id = f.document_type_id
    where f.id = file_attachments.file_id
      and dt.allow_multiple = true
      and (f.owner_id = (select auth.uid()) or public.is_org_admin(f.org_id))
  )
);
drop policy if exists file_attachments_delete on public.file_attachments;
create policy file_attachments_delete on public.file_attachments for delete using (
  exists (select 1 from public.files f where f.id = file_attachments.file_id and (f.owner_id = (select auth.uid()) or public.is_org_admin(f.org_id)))
);

-- 3) cross-office approval notification deep-link → the specific request
create or replace function public.request_cross_office_approval(p_file uuid, p_message text, p_target_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_file record; v_req uuid; v_app record; v_has boolean;
begin
  select * into v_file from public.files where id = p_file;
  if v_file is null then raise exception 'File not found'; end if;
  if not (v_file.owner_id = auth.uid() or public.is_org_admin(v_file.org_id) or public.is_org_member(v_file.org_id)) then
    raise exception 'You are not allowed to request approval for this file';
  end if;
  if p_target_org = v_file.org_id then raise exception 'Target office must be a different office'; end if;
  select exists (select 1 from public.organization_members m
                 where m.org_id = p_target_org and m.role = 'approver' and m.status = 'active') into v_has;
  if not v_has then raise exception 'That office has no approver'; end if;

  insert into public.approval_requests
    (org_id, file_id, document_type_id, version_no, requester_id, status, current_step, message, target_org_id)
  values
    (v_file.org_id, p_file, v_file.document_type_id, v_file.current_version, auth.uid(), 'pending', 1, p_message, p_target_org)
  returning id into v_req;

  for v_app in
    select m.user_id from public.organization_members m
    where m.org_id = p_target_org and m.role = 'approver' and m.status = 'active'
  loop
    insert into public.approval_step_assignments (org_id, request_id, step_no, position_id, assignee_id, status)
      values (p_target_org, v_req, 1, null, v_app.user_id, 'pending');
    insert into public.notifications (user_id, type, title, body, link)
      values (v_app.user_id, 'approval', 'New cross-office approval request', v_file.name, '/app/approvals?request=' || v_req);
  end loop;

  update public.files set status = 'pending' where id = p_file;
  return v_req;
end $$;
grant execute on function public.request_cross_office_approval(uuid, text, uuid) to authenticated;
