-- Backfill: every existing org with no categories becomes a General office.
-- (Run AFTER 0001. Instantiation of the General template for existing orgs is
--  done by the backend script in Step 2; this file handles approvals migration
--  and ensures type is set.)

update public.organizations set type = 'general' where type is null;

-- Migrate legacy single-approver approvals into multi-step requests (one step each).
insert into public.approval_requests (id, org_id, file_id, document_type_id, version_no, requester_id, status, current_step, message, created_at)
select a.id, a.org_id, a.file_id, null, a.version_no, a.requester_id, a.status, 1, a.message, a.created_at
from public.approvals a
where not exists (select 1 from public.approval_requests r where r.id = a.id);

insert into public.approval_step_assignments (org_id, request_id, step_no, position_id, assignee_id, status, decided_at)
select a.org_id, a.id, 1, null, a.approver_id,
       case a.status when 'pending' then 'pending' else a.status::text end, a.decided_at
from public.approvals a
where not exists (select 1 from public.approval_step_assignments s where s.request_id = a.id and s.step_no = 1);

-- Point legacy comments at their request (ids match because we reused approval ids).
update public.approval_comments c set request_id = c.approval_id where c.request_id is null and c.approval_id is not null;
