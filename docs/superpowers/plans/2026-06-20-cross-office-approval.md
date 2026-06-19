# Cross-Office Approval — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Let a user request approval from another office (chosen by name); routed to that office's approver-role members as a shared queue (first decides).

**Architecture:** New `target_org_id` on `approval_requests`; SECURITY DEFINER RPCs for office listing + cross-office request (resolves approvers + notifies server-side); `decide_approval` rewritten to act on the caller's own step row and close sibling approvers; RLS opened so a cross-org approval assignee can read the file + comment.

**Tech Stack:** Supabase SQL (RPC/RLS), React+TS.

**Spec:** `docs/superpowers/specs/2026-06-20-cross-office-approval-design.md`.

---

### Task 1: Migration `0014_cross_office_approval.sql`

**Files:** create `supabase/migrations/0014_cross_office_approval.sql`; update `supabase/schema.sql`.

- [ ] **Step 1: Write migration** (apply in Supabase; can't be applied from here):

```sql
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

-- 5) file read: a cross-org approval assignee can read the file (move participant check
--    OUT of the is_org_member gate)
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
```

> Note: `approval_requests_select` / `approval_steps_select` may already exist under different names; this replaces them by the names above. If pre-existing policies with other names remain and are more restrictive, drop those too. (Inspect with `\d+ public.approval_requests`.)

- [ ] **Step 2:** Mirror in `supabase/schema.sql`: add `target_org_id uuid references public.organizations(id)` to the `approval_requests` table; the RPCs/policies live in the migration (schema.sql need not duplicate functions, but update the `files_select` / `file_comments` policy + the column to stay representative).
- [ ] **Step 3:** Apply `0014` in Supabase. Verify: `select target_org_id from approval_requests limit 1;` works; `select * from list_approver_offices('<your-org-uuid>');` returns rows with `has_approver`.
- [ ] **Step 4:** Commit: `feat(approval): cross-office RPCs + shared-queue decide + RLS (migration 0014)`.

---

### Task 2: Types

**Files:** `frontend/src/lib/types.ts`.

- [ ] **Step 1:** In `ApprovalRequest`, add `target_org_id: string | null;`. Add:
```ts
export interface ApproverOffice { id: string; code: string; name: string; has_approver: boolean }
```
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit` → clean. Commit: `feat(types): ApprovalRequest.target_org_id + ApproverOffice`.

---

### Task 3: Approvals lib

**Files:** `frontend/src/lib/approvals.ts`.

- [ ] **Step 1:** Add:
```ts
export async function listApproverOffices(excludeOrgId: string): Promise<ApproverOffice[]> {
  const { data, error } = await supabase.rpc('list_approver_offices', { p_exclude_org: excludeOrgId });
  if (error) throw error;
  return (data as ApproverOffice[]) ?? [];
}

export async function createCrossOfficeRequest(file: FileItem, targetOrgId: string, message: string): Promise<void> {
  const { error } = await supabase.rpc('request_cross_office_approval', {
    p_file: file.id, p_message: message, p_target_org: targetOrgId,
  });
  if (error) throw error;
  // approver notifications are inserted server-side by the RPC
}
```
Import `ApproverOffice` from `./types`.
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit` → clean. Commit: `feat(approval): listApproverOffices + createCrossOfficeRequest`.

---

### Task 4: RequestApprovalDialog — office mode

**Files:** `frontend/src/components/drive/Dialogs.tsx` (RequestApprovalDialog).

- [ ] **Step 1:** Read the component. Add state:
```ts
const [mode, setMode] = useState<'office' | 'cross'>('office');
const [targetOrg, setTargetOrg] = useState('');
const { data: offices } = useQuery({
  queryKey: ['approverOffices', orgId],
  queryFn: () => listApproverOffices(orgId),
  enabled: open && mode === 'cross',
});
```
(Use the dialog's existing `orgId`/`file`/`open` props and `message` state; import `listApproverOffices`, `createCrossOfficeRequest`, and `useQuery` if not already.)
- [ ] **Step 2:** Add a two-button toggle at the top of the dialog body: **My office** (`mode='office'`, existing approver/chain UI) / **Another office** (`mode='cross'`). Render the existing approver-selection UI only when `mode==='office'`.
- [ ] **Step 3:** When `mode==='cross'`, render:
```tsx
<select value={targetOrg} onChange={(e) => setTargetOrg(e.target.value)} className="...existing input class...">
  <option value="">Select an office…</option>
  {(offices ?? []).map((o) => (
    <option key={o.id} value={o.id} disabled={!o.has_approver}>
      {o.name} ({o.code}){o.has_approver ? '' : ' — no approver'}
    </option>
  ))}
</select>
```
- [ ] **Step 4:** In the submit handler, branch: if `mode==='cross'` → require `targetOrg` (else toast), call `await createCrossOfficeRequest(file, targetOrg, message)`, toast success, `onDone?.()`, close; else keep the existing internal path.
- [ ] **Step 5:** `cd frontend && npx tsc --noEmit` && `npm run build` → clean. Manual: toggle shows office select; offices without approver disabled. Commit: `feat(approval): cross-office mode in RequestApprovalDialog`.

---

### Task 5: Approvals list/tracker labels

**Files:** `frontend/src/components/drive/ApprovalTracker.tsx`, `frontend/src/features/approvals/ApprovalsPage.tsx` (adjust to actual paths).

- [ ] **Step 1:** Where a step/request renders a position name, when the request has `target_org_id` (cross-office) show the office label instead. Minimal: in the requester's "My requests" list and the tracker header, render a "Cross-office → {office name}" badge when `target_org_id` is set. Fetch the office name via the request's joined data or `listApproverOffices` cache; simplest is to display `request.target_org_id ? 'Cross-office request' : …` plus, if convenient, the office code from the `approverOffices` query. (Acceptable minimum: a "Cross-office" badge; office name is a nice-to-have.)
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit` && `npm run build`. Manual: cross-office request shows the badge for requester and approver. Commit: `feat(approval): label cross-office requests`.

---

## Self-Review
- Spec coverage: Q1 shared-queue (decide_approval sibling-skip) ✓; Q2 single office (one step) ✓; Q3 view+comment, no download (files_select participant + file_comments insert; no download surface) ✓; Q4 list all other offices, disable no-approver (`list_approver_offices.has_approver`) ✓; Q5 same-as-office-only outcome (decide_approval unchanged finish logic) ✓.
- `'skipped'` is a new status value — `approval_step_assignments.status` is TEXT (already stores `'waiting'`), so no enum change needed.
- Notifications inserted in the RPC (definer) since the requester can't read target-org members under RLS.
- No change to the internal `request_approval` flow.
