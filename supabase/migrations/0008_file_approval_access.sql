-- Let approval participants (the requester and each step's approver) read the
-- file under review and its versions, so they can open/download it from the
-- Approvals page even before it's released.
-- Paste into Supabase SQL Editor and run. Safe to re-run.

create or replace function public.is_file_approval_participant(p_file uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.approval_requests r
    where r.file_id = p_file and (
      r.requester_id = auth.uid()
      or exists (
        select 1 from public.approval_step_assignments a
        where a.request_id = r.id and a.assignee_id = auth.uid()
      )
    )
  );
$$;

drop policy if exists files_select on public.files;
create policy files_select on public.files for select using (
  is_org_member(org_id) and (
    owner_id = auth.uid()
    or status = 'released'
    or is_org_admin(org_id)
    or exists (select 1 from public.shares s where s.target_type = 'file' and s.target_id = files.id and s.shared_with_user_id = auth.uid())
    or public.is_file_approval_participant(id)
  )
);
