-- 0016_fix_approval_rls_recursion.sql — safe to re-run.
-- approval_requests_select and approval_steps_select referenced each other's
-- tables inline → Postgres "infinite recursion detected in policy" (500).
-- Move the cross-table lookups into SECURITY DEFINER helpers that bypass RLS.

create or replace function public.is_request_assignee(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.approval_step_assignments a
    where a.request_id = p_request and a.assignee_id = auth.uid()
  );
$$;
grant execute on function public.is_request_assignee(uuid) to authenticated;

create or replace function public.is_request_requester(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.approval_requests r
    where r.id = p_request and r.requester_id = auth.uid()
  );
$$;
grant execute on function public.is_request_requester(uuid) to authenticated;

drop policy if exists approval_requests_select on public.approval_requests;
create policy approval_requests_select on public.approval_requests for select using (
  requester_id = auth.uid()
  or public.is_org_admin(org_id)
  or (target_org_id is not null and public.is_org_admin(target_org_id))
  or public.is_request_assignee(id)
);

drop policy if exists approval_steps_select on public.approval_step_assignments;
create policy approval_steps_select on public.approval_step_assignments for select using (
  assignee_id = auth.uid()
  or public.is_org_admin(org_id)
  or public.is_request_requester(request_id)
);
