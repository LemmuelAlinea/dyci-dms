-- Fix "infinite recursion detected in policy for relation approval_requests".
-- The approval_requests and approval_step_assignments SELECT policies referenced
-- each other's (RLS-protected) tables, creating a cycle. Route the cross-checks
-- through SECURITY DEFINER helpers, which bypass RLS and break the recursion.
-- Paste into Supabase SQL Editor and run. Safe to re-run.

create or replace function public.can_access_request(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.approval_requests r
    where r.id = p_request
      and ( r.requester_id = auth.uid() or public.is_org_admin(r.org_id) )
  )
  or exists (
    select 1 from public.approval_step_assignments a
    where a.request_id = p_request and a.assignee_id = auth.uid()
  );
$$;

create or replace function public.is_request_assignee(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.approval_step_assignments a
    where a.request_id = p_request and a.assignee_id = auth.uid()
  );
$$;

-- approval_requests: no longer references approval_step_assignments directly
drop policy if exists areq_select on public.approval_requests;
create policy areq_select on public.approval_requests for select using (
  public.can_access_request(id)
);

drop policy if exists areq_update on public.approval_requests;
create policy areq_update on public.approval_requests for update using (
  public.is_org_admin(org_id) or public.is_request_assignee(id)
);

-- approval_step_assignments: no longer references approval_requests directly
drop policy if exists asa_select on public.approval_step_assignments;
create policy asa_select on public.approval_step_assignments for select using (
  public.can_access_request(request_id)
);
