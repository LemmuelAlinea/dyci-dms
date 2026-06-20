-- 0017_no_auto_release_on_approval.sql — safe to re-run.
-- Final approval (office-only or cross-office) now marks the file 'approved'
-- only. Releasing to the office feed is a manual, optional owner action from
-- My Drive (still gated on the document type's publishable flag in the UI).

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
      -- final approval: mark approved only; release stays a manual owner action
      update public.approval_requests set status='approved' where id = p_request;
      update public.files set status='approved', approved_by=auth.uid() where id = v_req.file_id;
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
