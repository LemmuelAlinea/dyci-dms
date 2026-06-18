# Office Org Types — Plan 4: Multi-Step Approval Engine & Progress Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route a document through its document type's approval **chain** (e.g. Program Chair → Dean), one step at a time, with the requester picking the person per step, a live **progress tracker**, and auto-release on final approval for publishable types.

**Architecture:** Uses Plan 1's `approval_requests` / `approval_step_assignments` tables and `document_type_steps`. Request creation is client-side (the owner can set their file to pending). The **decision** transition (advance/approve/reject + change the file's status) is done by a `SECURITY DEFINER` RPC `decide_approval`, because an approver isn't the file owner and RLS would otherwise block them from updating the file. In-app notifications use the existing `notifyUsers`. The legacy single-approver `approvals` table stays for history (already migrated into `approval_requests` by Plan 1's 0002).

**Tech Stack:** React + Vite + TypeScript + Tailwind, TanStack Query, Supabase JS (incl. `.rpc`), react-hot-toast.

**Spec:** `docs/superpowers/specs/2026-06-18-office-org-types-design.md` · **Depends on:** Plans 1–3 (merged).

**⚠️ Requires ONE SQL step from the user:** apply `supabase/migrations/0004_decide_approval.sql` (Task 1) before approvals work.

---

## File structure (Plan 4)

- `supabase/migrations/0004_decide_approval.sql` — **create**: `decide_approval` RPC + a comments-insert RLS policy for request comments.
- `frontend/src/lib/types.ts` — **modify**: add `StepStatus`, `ApprovalRequest`, `ApprovalStep`.
- `frontend/src/lib/approvals.ts` — **rewrite**: chain-based request/decide/list/comment functions (keep `releaseFile`).
- `frontend/src/components/drive/ApprovalTracker.tsx` — **create**: the step progress tracker.
- `frontend/src/components/drive/Dialogs.tsx` — **modify**: rewrite `RequestApprovalDialog` to be chain-based (same props/exports).
- `frontend/src/features/approvals/ApprovalsPage.tsx` — **rewrite**: review/requests tabs + detail modal with tracker, comments, approve/reject.
- `frontend/src/features/drive/FileDetailPage.tsx` — **modify**: gate the Release button by publishability + show the tracker.

**Testing note:** UI + Supabase/RPC; no isolated pure logic. Verify with `cd frontend && npx tsc --noEmit` and `npm run build`, plus the manual smoke in Task 8.

---

### Task 1: `decide_approval` RPC + request-comment policy (SQL)

**Files:**
- Create: `supabase/migrations/0004_decide_approval.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_decide_approval.sql`:

```sql
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
```

- [ ] **Step 2: Apply in Supabase**

SQL Editor → paste → Run → expect "Success." Verify: `select proname from pg_proc where proname='decide_approval';` returns one row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_decide_approval.sql
git commit -m "feat(db): multi-step approval decision RPC + request-comment policy"
```

---

### Task 2: Approval request/step types

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add the types**

In `frontend/src/lib/types.ts`, add after the existing `Approval` / `ApprovalComment` interfaces:

```ts
export type StepStatus = 'waiting' | 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  org_id: string;
  file_id: string;
  document_type_id: string | null;
  version_no: number;
  requester_id: string;
  status: ApprovalStatus;
  current_step: number;
  message: string | null;
  created_at: string;
  files?: FileItem;
  requester?: Profile;
}

export interface ApprovalStep {
  id: string;
  request_id: string;
  step_no: number;
  position_id: string | null;
  assignee_id: string | null;
  status: StepStatus;
  decided_at: string | null;
  position?: { name: string } | null;
  assignee?: Profile | null;
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(approvals): multi-step request/step types"
```

---

### Task 3: Rewrite the approvals data layer

**Files:**
- Modify (replace whole file): `frontend/src/lib/approvals.ts`

- [ ] **Step 1: Replace the file contents**

Replace ALL of `frontend/src/lib/approvals.ts` with:

```ts
import { supabase } from './supabase';
import { notifyUsers } from './notify';
import { listMembers } from './org';
import type { ApprovalComment, ApprovalRequest, ApprovalStep, FileItem, Profile } from './types';

const FILES = 'files(*)';
const REQ = 'requester:profiles!approval_requests_requester_id_fkey(*)';

export interface PlanStep {
  step_no: number;
  position_id: string | null;
  position_name: string;
  holders: Profile[];
}

/**
 * The ordered approval plan for a file: one entry per step in its document
 * type's chain, each with the members who hold that step's position. Returns
 * [] when the file has no document type or its type has no chain (→ caller
 * falls back to a single free-pick approver).
 */
export async function getApprovalPlan(file: FileItem): Promise<PlanStep[]> {
  if (!file.document_type_id) return [];
  const { data: steps } = await supabase
    .from('document_type_steps')
    .select('step_no, position_id, position:positions(name)')
    .eq('document_type_id', file.document_type_id)
    .order('step_no');
  if (!steps?.length) return [];

  const posIds = steps.map((s) => s.position_id);
  const { data: holders } = await supabase
    .from('member_positions')
    .select('position_id, profiles(*)')
    .in('position_id', posIds);
  const byPos = new Map<string, Profile[]>();
  (holders ?? []).forEach((h) => {
    const raw = h as unknown as { position_id: string; profiles: Profile | null };
    const arr = byPos.get(raw.position_id) ?? [];
    if (raw.profiles) arr.push(raw.profiles);
    byPos.set(raw.position_id, arr);
  });

  return steps.map((s) => {
    const raw = s as unknown as { step_no: number; position_id: string; position: { name: string } | null };
    return {
      step_no: raw.step_no,
      position_id: raw.position_id,
      position_name: raw.position?.name ?? 'Approver',
      holders: byPos.get(raw.position_id) ?? [],
    };
  });
}

/** Members available for a free-pick (no-chain) approval. */
export async function approverChoices(orgId: string, excludeUserId?: string): Promise<Profile[]> {
  const members = await listMembers(orgId);
  return members
    .filter((m) => m.profiles && m.user_id !== excludeUserId)
    .map((m) => m.profiles as Profile);
}

export async function createApprovalRequest(
  file: FileItem,
  assignments: { step_no: number; position_id: string | null; assignee_id: string }[],
  message: string,
): Promise<void> {
  const { data: req, error } = await supabase
    .from('approval_requests')
    .insert({
      org_id: file.org_id,
      file_id: file.id,
      document_type_id: file.document_type_id,
      version_no: file.current_version,
      requester_id: file.owner_id,
      status: 'pending',
      current_step: 1,
      message,
    })
    .select()
    .single();
  if (error) throw error;

  const rows = [...assignments]
    .sort((a, b) => a.step_no - b.step_no)
    .map((a) => ({
      org_id: file.org_id,
      request_id: req.id,
      step_no: a.step_no,
      position_id: a.position_id,
      assignee_id: a.assignee_id,
      status: a.step_no === 1 ? 'pending' : 'waiting',
    }));
  const { error: se } = await supabase.from('approval_step_assignments').insert(rows);
  if (se) throw se;

  await supabase.from('files').update({ status: 'pending' }).eq('id', file.id);

  const first = rows.find((r) => r.step_no === 1);
  if (first) {
    await notifyUsers([first.assignee_id], {
      type: 'approval',
      title: 'New approval request',
      body: file.name,
      link: '/app/approvals',
    });
  }
}

/** Requests where the current user is the assignee of the active (pending) step. */
export async function listToReview(userId: string): Promise<ApprovalRequest[]> {
  const { data: steps } = await supabase
    .from('approval_step_assignments')
    .select('request_id')
    .eq('assignee_id', userId)
    .eq('status', 'pending');
  const ids = [...new Set((steps ?? []).map((s) => s.request_id))];
  if (!ids.length) return [];
  const { data } = await supabase
    .from('approval_requests')
    .select(`*, ${FILES}, ${REQ}`)
    .in('id', ids)
    .order('created_at', { ascending: false });
  return (data as ApprovalRequest[]) ?? [];
}

export async function listMyRequests(userId: string): Promise<ApprovalRequest[]> {
  const { data } = await supabase
    .from('approval_requests')
    .select(`*, ${FILES}, ${REQ}`)
    .eq('requester_id', userId)
    .order('created_at', { ascending: false });
  return (data as ApprovalRequest[]) ?? [];
}

export async function getRequestSteps(requestId: string): Promise<ApprovalStep[]> {
  const { data } = await supabase
    .from('approval_step_assignments')
    .select('*, position:positions(name), assignee:profiles!approval_step_assignments_assignee_id_fkey(*)')
    .eq('request_id', requestId)
    .order('step_no');
  return (data as ApprovalStep[]) ?? [];
}

export async function getLatestRequestForFile(fileId: string): Promise<ApprovalRequest | null> {
  const { data } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ApprovalRequest) ?? null;
}

export async function decideApprovalStep(
  request: ApprovalRequest,
  decision: 'approved' | 'rejected',
  comment?: string,
): Promise<void> {
  const { error } = await supabase.rpc('decide_approval', {
    p_request: request.id,
    p_decision: decision,
    p_comment: comment ?? null,
  });
  if (error) throw error;

  const fileName = request.files?.name ?? 'A document';
  if (decision === 'rejected') {
    await notifyUsers([request.requester_id], { type: 'approval', title: 'Your document was rejected', body: fileName, link: '/app/approvals' });
    return;
  }
  // Approved: notify the next pending approver, or the requester if finished.
  const steps = await getRequestSteps(request.id);
  const nextPending = steps.find((s) => s.status === 'pending');
  if (nextPending?.assignee_id) {
    await notifyUsers([nextPending.assignee_id], { type: 'approval', title: 'New approval request', body: fileName, link: '/app/approvals' });
  } else {
    await notifyUsers([request.requester_id], { type: 'approval', title: 'Your document was approved', body: fileName, link: '/app/approvals' });
  }
}

export async function listRequestComments(requestId: string): Promise<ApprovalComment[]> {
  const { data } = await supabase
    .from('approval_comments')
    .select('*, author:profiles!approval_comments_author_id_fkey(*)')
    .eq('request_id', requestId)
    .order('created_at');
  return (data as ApprovalComment[]) ?? [];
}

export async function addRequestComment(requestId: string, body: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase.from('approval_comments').insert({ request_id: requestId, author_id: userId, body });
  if (error) throw error;
}

/** Manually publish an approved (non-auto-released) file to the office feed. */
export async function releaseFile(file: FileItem): Promise<void> {
  const { error } = await supabase
    .from('files')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', file.id);
  if (error) throw error;

  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', file.org_id)
    .eq('status', 'active');
  const recipients = (members ?? []).map((m) => m.user_id).filter((id) => id !== file.owner_id);
  await notifyUsers(recipients, { type: 'release', title: 'New released paper', body: file.name, link: '/app/released' });
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. (If anything in `Dialogs.tsx`/`ApprovalsPage.tsx` still imports removed functions, that's fixed in Tasks 5–7 — type-check those after.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/approvals.ts
git commit -m "feat(approvals): chain-based request/decide/list data layer"
```

---

### Task 4: ApprovalTracker component

**Files:**
- Create: `frontend/src/components/drive/ApprovalTracker.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/drive/ApprovalTracker.tsx`:

```tsx
import { Fragment } from 'react';
import { Check, ChevronRight, Clock, Circle, X } from 'lucide-react';
import type { ApprovalStep, StepStatus } from '@/lib/types';

function Dot({ status }: { status: StepStatus }) {
  if (status === 'approved') return <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><Check size={12} /></span>;
  if (status === 'pending') return <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-navy-900"><Clock size={12} /></span>;
  if (status === 'rejected') return <span className="grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white"><X size={12} /></span>;
  return <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-slate-400 dark:bg-white/10"><Circle size={10} /></span>;
}

export function ApprovalTracker({ steps }: { steps: ApprovalStep[] }) {
  if (!steps.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((s, i) => (
        <Fragment key={s.id}>
          <div className="flex items-center gap-1.5">
            <Dot status={s.status} />
            <span className="text-xs text-navy-900 dark:text-slate-200">
              {s.position?.name ?? 'Approver'}
              {s.assignee && <span className="text-slate-400"> · {s.assignee.full_name}</span>}
            </span>
          </div>
          {i < steps.length - 1 && <ChevronRight size={14} className="text-slate-300" />}
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/drive/ApprovalTracker.tsx
git commit -m "feat(approvals): step progress tracker component"
```

---

### Task 5: Rewrite RequestApprovalDialog (chain-based)

**Files:**
- Modify: `frontend/src/components/drive/Dialogs.tsx`

- [ ] **Step 1: Read Dialogs.tsx fully first.** Then:

(a) Ensure React import includes `useEffect`. Change `import { useState } from 'react';` to:

```ts
import { useEffect, useState } from 'react';
```

(b) Replace the approvals import. Find `import { requestApproval } from '@/lib/approvals';` and replace with:

```ts
import { approverChoices, createApprovalRequest, getApprovalPlan, type PlanStep } from '@/lib/approvals';
```

(c) Replace the ENTIRE existing `RequestApprovalDialog` function (from `export function RequestApprovalDialog(` through its closing `}`) with this:

```tsx
export function RequestApprovalDialog({ open, onClose, file, orgId, onDone }: { open: boolean; onClose: () => void; file: FileItem; orgId: string; onDone: () => void }) {
  const userId = useAuth((s) => s.session?.user.id);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const planQ = useQuery({ queryKey: ['approvalPlan', file.id], queryFn: () => getApprovalPlan(file), enabled: open });
  const choicesQ = useQuery({ queryKey: ['approverChoices', orgId], queryFn: () => approverChoices(orgId, userId), enabled: open && (planQ.data?.length ?? 0) === 0 && !planQ.isLoading });

  const plan: PlanStep[] = planQ.data ?? [];
  const isChain = plan.length > 0;

  // Auto-pick steps whose position has exactly one holder.
  useEffect(() => {
    if (!isChain) return;
    const init: Record<number, string> = {};
    plan.forEach((s) => { if (s.holders.length === 1) init[s.step_no] = s.holders[0].id; });
    setPicks(init);
  }, [planQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    let assignments: { step_no: number; position_id: string | null; assignee_id: string }[];
    if (isChain) {
      if (plan.some((s) => s.holders.length === 0)) return toast.error('Some steps have no member assigned. Set positions in Positions first.');
      if (plan.some((s) => !picks[s.step_no])) return toast.error('Pick an approver for each step');
      assignments = plan.map((s) => ({ step_no: s.step_no, position_id: s.position_id, assignee_id: picks[s.step_no] }));
    } else {
      if (!picks[1]) return toast.error('Choose an approver');
      assignments = [{ step_no: 1, position_id: null, assignee_id: picks[1] }];
    }
    setBusy(true);
    try {
      await createApprovalRequest(file, assignments, message);
      toast.success('Approval requested');
      setPicks({});
      setMessage('');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request approval"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Send request'}</button></>}
    >
      <p className="mb-4 text-sm text-slate-500">Send <strong className="text-navy-700 dark:text-white">{file.name}</strong> (v{file.current_version}) for review.</p>

      {planQ.isLoading ? (
        <div className="grid place-items-center py-6"><Spinner /></div>
      ) : isChain ? (
        <div className="space-y-3">
          {plan.map((s) => (
            <div key={s.step_no}>
              <label className="label">Step {s.step_no} · {s.position_name}</label>
              {s.holders.length === 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">No member holds “{s.position_name}”. Assign one on the Positions page.</p>
              ) : (
                <select value={picks[s.step_no] ?? ''} onChange={(e) => setPicks((p) => ({ ...p, [s.step_no]: e.target.value }))} className="input">
                  <option value="">Select…</option>
                  {s.holders.map((h) => (<option key={h.id} value={h.id}>{h.full_name}</option>))}
                </select>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div>
          <label className="label">Approver</label>
          <select value={picks[1] ?? ''} onChange={(e) => setPicks({ 1: e.target.value })} className="input">
            <option value="">Select a member…</option>
            {(choicesQ.data ?? []).map((p) => (<option key={p.id} value={p.id}>{p.full_name}</option>))}
          </select>
        </div>
      )}

      <label className="label mt-3">Note (optional)</label>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="input resize-none" placeholder="Please review and approve…" />
    </Modal>
  );
}
```

(d) `useQuery` must be imported in Dialogs.tsx (it already is — the ShareDialog uses it). If not present, add `import { useQuery } from '@tanstack/react-query';`.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/drive/Dialogs.tsx
git commit -m "feat(approvals): chain-based request approval dialog"
```

---

### Task 6: Rewrite the Approvals page

**Files:**
- Modify (replace whole file): `frontend/src/features/approvals/ApprovalsPage.tsx`

- [ ] **Step 1: Replace the file contents**

Replace ALL of `frontend/src/features/approvals/ApprovalsPage.tsx` with:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { Check, CheckSquare, Download, MessageSquare, Send, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { Modal } from '@/components/ui/Modal';
import { ApprovalTracker } from '@/components/drive/ApprovalTracker';
import {
  addRequestComment,
  decideApprovalStep,
  getRequestSteps,
  listMyRequests,
  listRequestComments,
  listToReview,
} from '@/lib/approvals';
import { signedUrlForVersion } from '@/lib/drive';
import { useAuth } from '@/store/auth';
import type { ApprovalRequest } from '@/lib/types';

export function ApprovalsPage() {
  const userId = useAuth((s) => s.session?.user.id)!;
  const [tab, setTab] = useState<'review' | 'requests'>('review');
  const [active, setActive] = useState<ApprovalRequest | null>(null);

  const review = useQuery({ queryKey: ['toReview', userId], queryFn: () => listToReview(userId) });
  const requests = useQuery({ queryKey: ['myRequests', userId], queryFn: () => listMyRequests(userId) });
  const list = tab === 'review' ? review : requests;

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Review documents step by step and track your requests." icon={<CheckSquare size={22} />} />

      <div className="mb-5 flex w-full max-w-sm rounded-xl bg-slate-100 p-1 dark:bg-white/5">
        {(['review', 'requests'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${tab === t ? 'bg-white text-navy-900 shadow-sm dark:bg-surface-dark-3 dark:text-white' : 'text-slate-500'}`}
          >
            {t === 'review' ? `To review${review.data?.length ? ` (${review.data.length})` : ''}` : 'My requests'}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !list.data?.length ? (
        <EmptyState
          icon="/assets/icon-approval-stamp.png"
          title={tab === 'review' ? 'Nothing to review' : 'No requests yet'}
          description={tab === 'review' ? 'Documents waiting for your approval will appear here.' : 'Request approval on a file from your drive to start.'}
        />
      ) : (
        <div className="space-y-3">
          {list.data.map((r) => (
            <ApprovalRow key={r.id} request={r} side={tab} onOpen={() => setActive(r)} />
          ))}
        </div>
      )}

      {active && <ApprovalDetail request={active} userId={userId} onClose={() => setActive(null)} />}
    </div>
  );
}

function ApprovalRow({ request, side, onOpen }: { request: ApprovalRequest; side: 'review' | 'requests'; onOpen: () => void }) {
  return (
    <div onClick={onOpen} className="card flex cursor-pointer items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-card">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-50 dark:bg-white/5">
        <FileKindIcon kind={request.files?.kind ?? 'other'} size={24} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">
          {request.files?.name}
          {request.files?.reference_no && <span className="ml-2 font-mono text-[10px] text-navy-500 dark:text-gold-300">{request.files.reference_no}</span>}
        </p>
        <p className="text-[11px] text-slate-400">
          {side === 'review' ? `from ${request.requester?.full_name ?? ''}` : 'your request'} · {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
        </p>
      </div>
      <StatusBadge status={request.status === 'pending' ? 'pending' : request.status === 'approved' ? 'approved' : 'rejected'} />
    </div>
  );
}

function ApprovalDetail({ request, userId, onClose }: { request: ApprovalRequest; userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const stepsQ = useQuery({ queryKey: ['reqSteps', request.id], queryFn: () => getRequestSteps(request.id) });
  const commentsQ = useQuery({ queryKey: ['reqComments', request.id], queryFn: () => listRequestComments(request.id) });

  const myStep = stepsQ.data?.find((s) => s.status === 'pending' && s.assignee_id === userId);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addRequestComment(request.id, body.trim());
      setBody('');
      commentsQ.refetch();
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(true);
    try {
      await decideApprovalStep(request, decision, body.trim() || undefined);
      toast.success(decision === 'approved' ? 'Approved' : 'Rejected');
      qc.invalidateQueries({ queryKey: ['toReview'] });
      qc.invalidateQueries({ queryKey: ['myRequests'] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={request.files?.name} size="lg">
      <div className="mb-4 flex items-center justify-between">
        <StatusBadge status={request.status === 'pending' ? 'pending' : request.status === 'approved' ? 'approved' : 'rejected'} />
        <div className="flex gap-2">
          <button onClick={async () => window.open(await signedUrlForVersion(request.file_id, request.version_no, true), '_blank')} className="btn-outline !py-1.5 !text-xs">
            <Download size={14} /> Download
          </button>
          <button onClick={() => navigate(`/app/file/${request.file_id}`)} className="btn-outline !py-1.5 !text-xs">Open file</button>
        </div>
      </div>

      <div className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
        {stepsQ.isLoading ? <Spinner className="h-4 w-4" /> : <ApprovalTracker steps={stepsQ.data ?? []} />}
      </div>

      {request.message && <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">“{request.message}”</div>}

      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400"><MessageSquare size={14} /> Discussion</p>
      <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
        {(commentsQ.data ?? []).length === 0 && <p className="py-4 text-center text-sm text-slate-400">No comments yet.</p>}
        {(commentsQ.data ?? []).map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar name={c.author?.full_name} url={c.author?.avatar_url} size={30} />
            <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-navy-900 dark:text-white">{c.author?.full_name}</span>
                <span className="text-[10px] text-slate-400">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{c.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} className="input" placeholder="Add a comment…" />
        <button onClick={send} disabled={busy} className="btn-primary !px-3"><Send size={16} /></button>
      </div>

      {myStep && (
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
          <button onClick={() => decide('rejected')} disabled={busy} className="btn flex-1 bg-rose-600 text-white hover:bg-rose-500"><X size={16} /> Reject</button>
          <button onClick={() => decide('approved')} disabled={busy} className="btn-gold flex-1"><Check size={16} /> Approve</button>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/approvals/ApprovalsPage.tsx
git commit -m "feat(approvals): multi-step approvals page with tracker + comments"
```

---

### Task 7: FileDetailPage — gate Release + show tracker

**Files:**
- Modify: `frontend/src/features/drive/FileDetailPage.tsx`

- [ ] **Step 1: Read FileDetailPage.tsx fully first.** Then:

(a) Add imports:

```ts
import { getLatestRequestForFile, getRequestSteps } from '@/lib/approvals';
import { ApprovalTracker } from '@/components/drive/ApprovalTracker';
```

(b) After the existing `docType` query, add a query for the latest approval request + its steps:

```ts
  const { data: request } = useQuery({
    queryKey: ['fileRequest', id],
    queryFn: () => getLatestRequestForFile(id!),
    enabled: !!id,
  });
  const { data: reqSteps } = useQuery({
    queryKey: ['fileReqSteps', request?.id],
    queryFn: () => getRequestSteps(request!.id),
    enabled: !!request?.id,
  });
```

(c) Gate the "Release paper" button by publishability. Find the block `{isOwner && file.status === 'approved' && (` and change its condition to:

```tsx
              {isOwner && file.status === 'approved' && docType?.publishable !== false && (
```

(d) Show the tracker in the main column. Immediately AFTER the closing `</div>` of the actions/status `card` (the first `card p-5` block that contains the file header + actions) and BEFORE the Preview card, insert:

```tsx
          {reqSteps && reqSteps.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 font-display text-sm font-bold text-navy-900 dark:text-white">Approval progress</h3>
              <ApprovalTracker steps={reqSteps} />
            </div>
          )}
```

- [ ] **Step 2: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/drive/FileDetailPage.tsx
git commit -m "feat(approvals): file detail shows tracker + gates release by publishability"
```

---

### Task 8: Build verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build`
Expected: succeeds, no TS errors.

- [ ] **Step 2: Manual smoke (after Task 1 SQL applied + deployed)**

In a **College** org with positions assigned (Program Chair, Dean held by members):
- A staff member uploads a **Grade Sheet** → on the file, **Request approval** → the dialog shows **Step 1 · Program Chair** and **Step 2 · Dean** (single-holder steps auto-filled) → send.
- As the **Program Chair**: Approvals → To review → open → tracker shows ✅... 🕓 Dean ⬜ → **Approve**. It disappears from your queue.
- As the **Dean**: To review → open → **Approve**. Since Grade Sheet is non-publishable, the file becomes **Approved** (not in Released Papers).
- Try a **publishable** type (e.g. Memo) → on final approval it auto-appears in **Released Papers**.
- **Reject** at any step → the requester sees it as Rejected; the file detail shows the tracker with a red step.
- General-org file (no chain) → Request approval still works as a single free-pick approver.

---

## Self-review against the spec

**Spec coverage (Plan 4 portion):**
- Request reads the type's chain; requester picks per step; single-holder auto-resolves → Tasks 3, 5 ✅
- Step-by-step advance; only current step is actionable → Tasks 1, 3 (RPC + `listToReview` on pending step) ✅
- Rejection stops + returns with comments → Tasks 1, 6 ✅
- Progress tracker everywhere (Approvals + file detail) → Tasks 4, 6, 7 ✅
- Final approval: publishable → Released Papers; else Approved → Task 1 (RPC publishable branch) ✅
- Threaded comments on the request → Tasks 1 (policy), 3, 6 ✅
- Backward compatible: no-chain/General → single free-pick approver; legacy requests already in `approval_requests` → Tasks 3, 5 ✅

**Placeholder scan:** none — all code concrete; Tasks 5 & 7 are targeted edits with exact find/replace against files the implementer reads first.

**Type consistency:** `ApprovalRequest`/`ApprovalStep`/`StepStatus` defined in `types.ts`, used in `approvals.ts`, `ApprovalTracker`, `ApprovalsPage`, `FileDetailPage`. `decideApprovalStep(request, decision, comment?)` matches its RPC params (`p_request`,`p_decision`,`p_comment`). `getApprovalPlan`/`createApprovalRequest`/`approverChoices` consumed by `RequestApprovalDialog`. `releaseFile(file)` signature unchanged for existing callers (DrivePage, FileDetailPage).

**Deferred (correct):** editing chains/positions in a settings UI = Plan 5; metadata search/filter = Plan 6; email notifications for the new multi-step flow (in-app notifications ship now; email is a later enhancement).
```
