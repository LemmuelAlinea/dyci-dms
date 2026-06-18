-- Multi-step approval decision RPC + request-comment insert policy.
-- Paste into Supabase SQL Editor and run. Safe to re-run.

create or replace function public.decide_approval(p_request uuid, p_decision text, p_comment text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_step record;
  v_next record;
  v_publishable boolean;
begin
  select * into v_req from public.approval_requests where id = p_request;
  if v_req is null then raise exception 'Request not found'; end if;
  if v_req.status <> 'pending' then raise exception 'This request has already been decided'; end if;

  select * into v_step from public.approval_step_assignments
    where request_id = p_request and step_no = v_req.current_step;
  if v_step is null then raise exception 'Current step not found'; end if;

  if not (v_step.assignee_id = auth.uid() or public.is_org_admin(v_req.org_id)) then
    raise exception 'You are not the approver for this step';
  end if;

  if p_decision = 'rejected' then
    update public.approval_step_assignments set status='rejected', decided_at=now() where id = v_step.id;
    update public.approval_requests set status='rejected' where id = p_request;
    update public.files set status='rejected' where id = v_req.file_id;

  elsif p_decision = 'approved' then
    update public.approval_step_assignments set status='approved', decided_at=now() where id = v_step.id;

    select * into v_next from public.approval_step_assignments
      where request_id = p_request and step_no = v_req.current_step + 1;

    if v_next.id is not null then
      update public.approval_requests set current_step = v_req.current_step + 1 where id = p_request;
      update public.approval_step_assignments set status='pending' where id = v_next.id;
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

-- Allow participants to comment on a request (the old policy only covered approval_id).
drop policy if exists comments_insert_req on public.approval_comments;
create policy comments_insert_req on public.approval_comments for insert with check (
  author_id = auth.uid() and request_id is not null and exists (
    select 1 from public.approval_requests r
    where r.id = request_id and (
      r.requester_id = auth.uid()
      or public.is_org_admin(r.org_id)
      or exists (select 1 from public.approval_step_assignments a where a.request_id = r.id and a.assignee_id = auth.uid())
    )
  )
);
