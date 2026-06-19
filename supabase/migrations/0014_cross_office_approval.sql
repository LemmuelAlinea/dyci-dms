-- 0014_cross_office_approval.sql — safe to re-run.

-- 1) target office on the request (null = internal)
alter table public.approval_requests
  add column if not exists target_org_id uuid references public.organizations(id);

-- 2) list every OTHER office + whether it has an active approver (bypasses org-visibility RLS)
create or replace function public.list_approver_offices(p_exclude_org uuid)
returns table (id uuid, code text, name text, has_approver boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.code, o.name,
    exists (select 1 from public.organization_members m
            where m.org_id = o.id and m.role = 'approver' and m.status = 'active') as has_approver
  from public.organizations o
  where o.id <> p_exclude_org
  order by o.name;
$$;
grant execute on function public.list_approver_offices(uuid) to authenticated;

-- 3) cross-office request: one pending step-1 row per target approver + notify them
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
      values (v_app.user_id, 'approval', 'New cross-office approval request', v_file.name, '/app/approvals');
  end loop;

  update public.files set status = 'pending' where id = p_file;
  return v_req;
end $$;
grant execute on function public.request_cross_office_approval(uuid, text, uuid) to authenticated;

-- 4) decide_approval: act on the CALLER's own pending step row; close sibling approvers (shared queue)
create or replace function public.decide_approval(p_request uuid, p_decision text, p_comment text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_req record; v_step record; v_next record; v_publishable boolean;
begin
  select * into v_req from public.approval_requests where id = p_request;
  if v_req is null then raise exception 'Request not found'; end if;
  if v_req.status <> 'pending' then raise exception 'This request has already been decided'; end if;

  select * into v_step from public.approval_step_assignments
    where request_id = p_request and step_no = v_req.current_step and status = 'pending' and assignee_id = auth.uid()
    limit 1;
  if v_step is null and public.is_org_admin(coalesce(v_req.target_org_id, v_req.org_id)) then
    select * into v_step from public.approval_step_assignments
      where request_id = p_request and step_no = v_req.current_step and status = 'pending' limit 1;
  end if;
  if v_step is null then raise exception 'You are not the approver for this step'; end if;

  if p_decision = 'rejected' then
    update public.approval_step_assignments set status='rejected', decided_at=now() where id = v_step.id;
    update public.approval_step_assignments set status='skipped'
      where request_id=p_request and step_no=v_req.current_step and status='pending' and id <> v_step.id;
    update public.approval_requests set status='rejected' where id = p_request;
    update public.files set status='rejected' where id = v_req.file_id;

  elsif p_decision = 'approved' then
    update public.approval_step_assignments set status='approved', decided_at=now() where id = v_step.id;
    update public.approval_step_assignments set status='skipped'
      where request_id=p_request and step_no=v_req.current_step and status='pending' and id <> v_step.id;

    select * into v_next from public.approval_step_assignments
      where request_id=p_request and step_no=v_req.current_step + 1 limit 1;
    if v_next.id is not null then
      update public.approval_requests set current_step = v_req.current_step + 1 where id = p_request;
      update public.approval_step_assignments set status='pending'
        where request_id=p_request and step_no=v_req.current_step + 1;
    else
      update public.approval_requests set status='approved' where id = p_request;
      select coalesce(dt.publishable, true) into v_publishable
        from public.files f left join public.document_types dt on dt.id = f.document_type_id
        where f.id = v_req.file_id;
      if v_publishable then
        update public.files set status='released', released_at=now(), approved_by=auth.uid() where id = v_req.file_id;
      else
        update public.files set status='approved', approved_by=auth.uid() where id = v_req.file_id;
      end if;
    end if;
  else
    raise exception 'Invalid decision';
  end if;

  if p_comment is not null and length(trim(p_comment)) > 0 then
    insert into public.approval_comments (request_id, author_id, body) values (p_request, auth.uid(), p_comment);
  end if;
  return (select status from public.approval_requests where id = p_request);
end $$;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;

-- 5) file read: a cross-org approval assignee can read the file (participant check outside the org gate)
drop policy if exists files_select on public.files;
create policy files_select on public.files for select using (
  (
    public.is_org_member(org_id) and (
      owner_id = auth.uid()
      or status = 'released'
      or public.is_org_admin(org_id)
      or exists (select 1 from public.shares s where s.target_type='file' and s.target_id = files.id and s.shared_with_user_id = auth.uid())
    )
  )
  or public.is_file_approval_participant(id)
);

-- 6) approval_requests / step select: cross-org assignee + requester + admin of either org
drop policy if exists approval_requests_select on public.approval_requests;
create policy approval_requests_select on public.approval_requests for select using (
  requester_id = auth.uid()
  or public.is_org_admin(org_id)
  or (target_org_id is not null and public.is_org_admin(target_org_id))
  or exists (select 1 from public.approval_step_assignments a where a.request_id = approval_requests.id and a.assignee_id = auth.uid())
);

drop policy if exists approval_steps_select on public.approval_step_assignments;
create policy approval_steps_select on public.approval_step_assignments for select using (
  assignee_id = auth.uid()
  or public.is_org_admin(org_id)
  or exists (select 1 from public.approval_requests r where r.id = approval_step_assignments.request_id and r.requester_id = auth.uid())
);

-- 7) file_comments insert: also allow a current approval-step assignee (external approver)
drop policy if exists file_comments_insert on public.file_comments;
create policy file_comments_insert on public.file_comments for insert with check (
  author_id = auth.uid() and exists (
    select 1 from public.files f where f.id = file_comments.file_id and (
      f.owner_id = auth.uid()
      or public.is_org_admin(f.org_id)
      or exists (select 1 from public.shares s where s.target_type='file' and s.target_id=f.id and s.shared_with_user_id=auth.uid() and s.permission in ('comment','edit'))
      or public.is_file_approval_participant(f.id)
    )
  )
);
