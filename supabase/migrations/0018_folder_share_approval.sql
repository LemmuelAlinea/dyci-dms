-- 0018_folder_share_approval.sql — folder sharing & approval. Safe to re-run.
-- Brings tiered sharing (view/comment/download/edit) and approval (same-office +
-- cross-office) to FOLDERS, with recursive access (a shared folder grants access
-- to everything inside it). Reuses the existing shares + approval tables.

-- ============================================================================
-- 1) Schema
-- ============================================================================
alter table public.folders        add column if not exists status doc_status not null default 'draft';
alter table public.approval_requests add column if not exists folder_id uuid references public.folders(id) on delete cascade;
-- folder requests have no file; allow file_id to be null
alter table public.approval_requests alter column file_id drop not null;

-- ============================================================================
-- 2) Helper functions (SECURITY DEFINER — bypass RLS, avoid policy recursion)
-- ============================================================================

-- Best permission the caller holds on a folder OR any of its ancestors (else null).
create or replace function public.folder_share_perm(p_folder uuid)
returns text language sql stable security definer set search_path = public as $$
  with recursive anc as (
    select id, parent_id from public.folders where id = p_folder
    union all
    select f.id, f.parent_id from public.folders f join anc on f.id = anc.parent_id
  )
  select s.permission
  from public.shares s
  join anc on anc.id = s.target_id
  where s.target_type = 'folder' and s.shared_with_user_id = auth.uid()
  order by case s.permission
             when 'edit' then 4 when 'download' then 3 when 'comment' then 2 when 'view' then 1 else 0 end desc
  limit 1;
$$;
grant execute on function public.folder_share_perm(uuid) to authenticated;

-- Is the caller a participant (requester/assignee) on a folder approval request
-- for this folder OR any ancestor? (so an approver can browse the whole tree).
create or replace function public.in_folder_approval(p_folder uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive anc as (
    select id, parent_id from public.folders where id = p_folder
    union all
    select f.id, f.parent_id from public.folders f join anc on f.id = anc.parent_id
  )
  select exists (
    select 1 from public.approval_requests r
    join anc on anc.id = r.folder_id
    where r.requester_id = auth.uid()
       or exists (select 1 from public.approval_step_assignments a
                  where a.request_id = r.id and a.assignee_id = auth.uid())
  );
$$;
grant execute on function public.in_folder_approval(uuid) to authenticated;

-- Highest effective permission the caller has on a file: owner('edit') > direct
-- file share > folder-inherited share. Used by the backend to authorize
-- download / version upload / add-file, and by comment gating.
create or replace function public.effective_file_permission(p_file uuid)
returns text language sql stable security definer set search_path = public as $$
  with f as (select * from public.files where id = p_file),
  perms as (
    select 'edit'::text as p from f where f.owner_id = auth.uid()
    union all
    select s.permission from public.shares s join f on s.target_id = f.id
      where s.target_type = 'file' and s.shared_with_user_id = auth.uid()
    union all
    select public.folder_share_perm((select folder_id from f))
  )
  select p from perms where p is not null
  order by case p when 'edit' then 4 when 'download' then 3 when 'comment' then 2 when 'view' then 1 else 0 end desc
  limit 1;
$$;
grant execute on function public.effective_file_permission(uuid) to authenticated;

-- ============================================================================
-- 3) RLS — recursive folder/file visibility through folder shares + approvals
-- ============================================================================

drop policy if exists folders_select on public.folders;
create policy folders_select on public.folders for select using (
  (
    public.is_org_member(org_id) and (
      owner_id = auth.uid()
      or public.is_org_admin(org_id)
      or exists (select 1 from public.shares s
                 where s.target_type = 'folder' and s.target_id = folders.id and s.shared_with_user_id = auth.uid())
    )
  )
  or public.folder_share_perm(folders.id) is not null   -- shared folder/ancestor
  or public.in_folder_approval(folders.id)              -- under a folder approval (approver)
);

drop policy if exists files_select on public.files;
create policy files_select on public.files for select using (
  (
    public.is_org_member(org_id) and (
      owner_id = auth.uid()
      or status = 'released'
      or public.is_org_admin(org_id)
      or exists (select 1 from public.shares s
                 where s.target_type = 'file' and s.target_id = files.id and s.shared_with_user_id = auth.uid())
    )
  )
  or public.is_file_approval_participant(id)             -- file approval participant
  or public.folder_share_perm(files.folder_id) is not null  -- inside a shared folder
  or public.in_folder_approval(files.folder_id)         -- inside a folder under approval
);

-- comment insert: owner / admin / file comment-or-edit share / file-approval
-- participant / folder-inherited comment-or-edit
drop policy if exists file_comments_insert on public.file_comments;
create policy file_comments_insert on public.file_comments for insert with check (
  author_id = auth.uid() and exists (
    select 1 from public.files f where f.id = file_comments.file_id and (
      f.owner_id = auth.uid()
      or public.is_org_admin(f.org_id)
      or exists (select 1 from public.shares s where s.target_type='file' and s.target_id=f.id
                 and s.shared_with_user_id=auth.uid() and s.permission in ('comment','edit'))
      or public.is_file_approval_participant(f.id)
      or public.folder_share_perm(f.folder_id) in ('comment','edit')
    )
  )
);

-- ============================================================================
-- 4) Folder approval RPCs
-- ============================================================================

-- Same-office: single free-pick approver.
create or replace function public.request_folder_approval(p_folder uuid, p_message text, p_assignee uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_folder record; v_req uuid;
begin
  select * into v_folder from public.folders where id = p_folder;
  if v_folder is null then raise exception 'Folder not found'; end if;
  if not (v_folder.owner_id = auth.uid() or public.is_org_admin(v_folder.org_id) or public.is_org_member(v_folder.org_id)) then
    raise exception 'You are not allowed to request approval for this folder';
  end if;

  insert into public.approval_requests (org_id, folder_id, version_no, requester_id, status, current_step, message)
    values (v_folder.org_id, p_folder, 1, auth.uid(), 'pending', 1, p_message)
    returning id into v_req;
  insert into public.approval_step_assignments (org_id, request_id, step_no, position_id, assignee_id, status)
    values (v_folder.org_id, v_req, 1, null, p_assignee, 'pending');
  insert into public.notifications (user_id, type, title, body, link)
    values (p_assignee, 'approval', 'New folder approval request', v_folder.name, '/app/approvals?request=' || v_req);

  update public.folders set status = 'pending' where id = p_folder;
  return v_req;
end $$;
grant execute on function public.request_folder_approval(uuid, text, uuid) to authenticated;

-- Cross-office: route to the target office's approvers as a shared queue.
create or replace function public.request_cross_office_folder_approval(p_folder uuid, p_message text, p_target_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_folder record; v_req uuid; v_app record; v_has boolean;
begin
  select * into v_folder from public.folders where id = p_folder;
  if v_folder is null then raise exception 'Folder not found'; end if;
  if not (v_folder.owner_id = auth.uid() or public.is_org_admin(v_folder.org_id) or public.is_org_member(v_folder.org_id)) then
    raise exception 'You are not allowed to request approval for this folder';
  end if;
  if p_target_org = v_folder.org_id then raise exception 'Target office must be a different office'; end if;
  select exists (select 1 from public.organization_members m
                 where m.org_id = p_target_org and m.role = 'approver' and m.status = 'active') into v_has;
  if not v_has then raise exception 'That office has no approver'; end if;

  insert into public.approval_requests (org_id, folder_id, version_no, requester_id, status, current_step, message, target_org_id)
    values (v_folder.org_id, p_folder, 1, auth.uid(), 'pending', 1, p_message, p_target_org)
    returning id into v_req;

  for v_app in
    select m.user_id from public.organization_members m
    where m.org_id = p_target_org and m.role = 'approver' and m.status = 'active'
  loop
    insert into public.approval_step_assignments (org_id, request_id, step_no, position_id, assignee_id, status)
      values (p_target_org, v_req, 1, null, v_app.user_id, 'pending');
    insert into public.notifications (user_id, type, title, body, link)
      values (v_app.user_id, 'approval', 'New cross-office folder approval request', v_folder.name, '/app/approvals?request=' || v_req);
  end loop;

  update public.folders set status = 'pending' where id = p_folder;
  return v_req;
end $$;
grant execute on function public.request_cross_office_folder_approval(uuid, text, uuid) to authenticated;

-- ============================================================================
-- 5) decide_approval — handle BOTH file and folder requests
--    (file branch unchanged from 0017; adds a folder branch that sets folders.status)
-- ============================================================================
create or replace function public.decide_approval(p_request uuid, p_decision text, p_comment text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_req record; v_step record; v_next record;
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
    if v_req.folder_id is not null then
      update public.folders set status='rejected' where id = v_req.folder_id;
    else
      update public.files set status='rejected' where id = v_req.file_id;
    end if;

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
      -- final approval: mark approved only; release stays a manual owner action
      update public.approval_requests set status='approved' where id = p_request;
      if v_req.folder_id is not null then
        update public.folders set status='approved' where id = v_req.folder_id;
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
