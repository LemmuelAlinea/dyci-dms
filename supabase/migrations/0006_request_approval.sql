-- Create an approval request via a SECURITY DEFINER RPC (mirrors decide_approval).
-- This avoids brittle client-side RLS on the multi-row insert (request + steps +
-- file status) and authorizes the caller server-side.
-- Paste into Supabase SQL Editor and run. Safe to re-run.

create or replace function public.request_approval(p_file uuid, p_message text, p_assignees jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file record;
  v_req  uuid;
  v_a    jsonb;
begin
  select * into v_file from public.files where id = p_file;
  if v_file is null then raise exception 'File not found'; end if;

  -- Authorize: the file owner, an org admin, or an active org member.
  if not (
    v_file.owner_id = auth.uid()
    or public.is_org_admin(v_file.org_id)
    or public.is_org_member(v_file.org_id)
  ) then
    raise exception 'You are not allowed to request approval for this file';
  end if;

  insert into public.approval_requests
    (org_id, file_id, document_type_id, version_no, requester_id, status, current_step, message)
  values
    (v_file.org_id, p_file, v_file.document_type_id, v_file.current_version, auth.uid(), 'pending', 1, p_message)
  returning id into v_req;

  for v_a in select value from jsonb_array_elements(p_assignees) loop
    insert into public.approval_step_assignments
      (org_id, request_id, step_no, position_id, assignee_id, status)
    values (
      v_file.org_id,
      v_req,
      (v_a->>'step_no')::int,
      nullif(v_a->>'position_id', '')::uuid,
      (v_a->>'assignee_id')::uuid,
      case when (v_a->>'step_no')::int = 1 then 'pending' else 'waiting' end
    );
  end loop;

  update public.files set status = 'pending' where id = p_file;
  return v_req;
end $$;

grant execute on function public.request_approval(uuid, text, jsonb) to authenticated;
