# Reports — Plan 2: Staff Personal Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the three remaining Staff reports — **My Approval Requests**, **My Approval Queue**, **My Released Papers** — each reusing the `ReportShell` framework (filters, column toggles, presets, print).

**Architecture:** Client-side queries over RLS (each user reads their own approval requests / queue / released files). Three new query functions in the existing `staff.ts` lib, three new report pages using `ReportShell`, three registry entries (so they appear on the Reports landing automatically), and three routes. No backend, no SQL.

**Tech Stack:** React + Vite + TS + Tailwind, TanStack Query, Supabase JS, date-fns, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-18-reports-design.md` · **Depends on:** Reports Plan 1 (merged). **This is Plan 2 of 4. No SQL required.**

**Testing note:** UI + Supabase queries. Verify with `cd frontend && npx tsc --noEmit` and `npm run build`, plus the manual smoke in Task 7.

---

## File structure (Plan 2)

- `frontend/src/lib/reports/staff.ts` — **modify**: add `listMyApprovalRequests`, `listMyApprovalQueue`, `listMyReleased` + their types.
- `frontend/src/features/reports/registry.ts` — **modify**: add three `ORG_REPORTS` entries.
- `frontend/src/features/reports/staff/MyApprovalRequestsReport.tsx` — **create**.
- `frontend/src/features/reports/staff/MyApprovalQueueReport.tsx` — **create**.
- `frontend/src/features/reports/staff/MyReleasedReport.tsx` — **create**.
- `frontend/src/main.tsx` — **modify**: add three routes.

---

### Task 1: Staff query functions

**Files:**
- Modify: `frontend/src/lib/reports/staff.ts`

- [ ] **Step 1: Append the new types + functions**

Add the following to the **end** of `frontend/src/lib/reports/staff.ts` (keep the existing `MyDocFilters` / `listMyDocuments`). First add `ApprovalStatus` to the existing type import — change the existing import line:

```ts
import type { FileItem } from '@/lib/types';
```

to:

```ts
import type { ApprovalStatus, FileItem } from '@/lib/types';
```

Then append:

```ts
// ── My Approval Requests ─────────────────────────────────────────────────────
export interface ApprovalReqFilters {
  from?: string;
  to?: string;
  status?: string;
}

export interface MyRequestRow {
  id: string;
  file_name: string;
  reference_no: string | null;
  type_name: string | null;
  status: ApprovalStatus;
  created_at: string;
  current_approver: string | null;
  decided_at: string | null;
}

export async function listMyApprovalRequests(userId: string, f: ApprovalReqFilters): Promise<MyRequestRow[]> {
  let q = supabase
    .from('approval_requests')
    .select('id, status, current_step, created_at, files(name, reference_no, document_type:document_types(name))')
    .eq('requester_id', userId)
    .order('created_at', { ascending: false });
  if (f.status) q = q.eq('status', f.status);
  if (f.from) q = q.gte('created_at', f.from);
  if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`);
  const { data: reqs } = await q;

  const ids = (reqs ?? []).map((r) => (r as { id: string }).id);
  const byReq = new Map<string, { step_no: number; decided_at: string | null; assignee: { full_name: string | null } | null }[]>();
  if (ids.length) {
    const { data: steps } = await supabase
      .from('approval_step_assignments')
      .select('request_id, step_no, decided_at, assignee:profiles!approval_step_assignments_assignee_id_fkey(full_name)')
      .in('request_id', ids);
    (steps ?? []).forEach((s) => {
      const raw = s as unknown as { request_id: string; step_no: number; decided_at: string | null; assignee: { full_name: string | null } | null };
      const arr = byReq.get(raw.request_id) ?? [];
      arr.push(raw);
      byReq.set(raw.request_id, arr);
    });
  }

  return (reqs ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      status: ApprovalStatus;
      current_step: number;
      created_at: string;
      files: { name?: string; reference_no?: string | null; document_type?: { name?: string } | null } | null;
    };
    const ss = byReq.get(row.id) ?? [];
    const cur = ss.find((s) => s.step_no === row.current_step);
    const decided = ss.map((s) => s.decided_at).filter(Boolean).sort().pop() ?? null;
    return {
      id: row.id,
      file_name: row.files?.name ?? '—',
      reference_no: row.files?.reference_no ?? null,
      type_name: row.files?.document_type?.name ?? null,
      status: row.status,
      created_at: row.created_at,
      current_approver: cur?.assignee?.full_name ?? null,
      decided_at: row.status === 'pending' ? null : (decided as string | null),
    };
  });
}

// ── My Approval Queue ────────────────────────────────────────────────────────
export interface QueueFilters {
  documentTypeId?: string;
}

export interface QueueRow {
  id: string;
  file_id: string;
  file_name: string;
  reference_no: string | null;
  type_name: string | null;
  requester: string | null;
  created_at: string;
}

export async function listMyApprovalQueue(userId: string, f: QueueFilters): Promise<QueueRow[]> {
  const { data: steps } = await supabase
    .from('approval_step_assignments')
    .select('request_id')
    .eq('assignee_id', userId)
    .eq('status', 'pending');
  const ids = [...new Set((steps ?? []).map((s) => s.request_id))];
  if (!ids.length) return [];

  let q = supabase
    .from('approval_requests')
    .select('id, file_id, created_at, document_type_id, files(name, reference_no, document_type:document_types(name)), requester:profiles!approval_requests_requester_id_fkey(full_name)')
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (f.documentTypeId) q = q.eq('document_type_id', f.documentTypeId);
  const { data } = await q;

  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      file_id: string;
      created_at: string;
      files: { name?: string; reference_no?: string | null; document_type?: { name?: string } | null } | null;
      requester: { full_name: string | null } | null;
    };
    return {
      id: row.id,
      file_id: row.file_id,
      file_name: row.files?.name ?? '—',
      reference_no: row.files?.reference_no ?? null,
      type_name: row.files?.document_type?.name ?? null,
      requester: row.requester?.full_name ?? null,
      created_at: row.created_at,
    };
  });
}

// ── My Released Papers ───────────────────────────────────────────────────────
export interface ReleasedFilters {
  from?: string;
  to?: string;
  documentTypeId?: string;
}

export async function listMyReleased(userId: string, f: ReleasedFilters): Promise<FileItem[]> {
  let q = supabase
    .from('files')
    .select('*, approver:profiles!files_approved_by_fkey(*), document_type:document_types(name, publishable)')
    .eq('owner_id', userId)
    .eq('status', 'released')
    .order('released_at', { ascending: false });
  if (f.from) q = q.gte('released_at', f.from);
  if (f.to) q = q.lte('released_at', `${f.to}T23:59:59`);
  if (f.documentTypeId) q = q.eq('document_type_id', f.documentTypeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as FileItem[]) ?? [];
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/lib/reports/staff.ts
git commit -m "feat(reports): staff approval-requests/queue/released queries"
```

---

### Task 2: Registry entries

**Files:**
- Modify: `frontend/src/features/reports/registry.ts`

- [ ] **Step 1: Add three entries**

In `frontend/src/features/reports/registry.ts`, add these objects to the `ORG_REPORTS` array (after the existing `my-documents` entry):

```ts
  {
    key: 'my-approval-requests',
    title: 'My Approval Requests',
    description: 'Approvals you requested and their status.',
    to: '/app/reports/my-approval-requests',
    roles: ['admin', 'co_admin', 'staff', 'approver'],
  },
  {
    key: 'my-approval-queue',
    title: 'My Approval Queue',
    description: 'Documents waiting for your approval.',
    to: '/app/reports/my-approval-queue',
    roles: ['admin', 'co_admin', 'staff', 'approver'],
  },
  {
    key: 'my-released',
    title: 'My Released Papers',
    description: 'Your documents that have been released.',
    to: '/app/reports/my-released',
    roles: ['admin', 'co_admin', 'staff', 'approver'],
  },
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/features/reports/registry.ts
git commit -m "feat(reports): register staff reports"
```

---

### Task 3: My Approval Requests report

**Files:**
- Create: `frontend/src/features/reports/staff/MyApprovalRequestsReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/staff/MyApprovalRequestsReport.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format } from 'date-fns';
import { ClipboardCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { listMyApprovalRequests, type ApprovalReqFilters, type MyRequestRow } from '@/lib/reports/staff';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { DocStatus } from '@/lib/types';

const STATUSES = ['pending', 'approved', 'rejected'];

const columns: ColumnDef<MyRequestRow>[] = [
  { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
  { key: 'document', label: 'Document', render: (r) => r.file_name },
  { key: 'type', label: 'Type', render: (r) => r.type_name ?? '—' },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status as DocStatus} /> },
  { key: 'approver', label: 'Approver', render: (r) => r.current_approver ?? '—' },
  { key: 'requested', label: 'Requested', render: (r) => format(new Date(r.created_at), 'PP') },
  { key: 'decided', label: 'Decided', render: (r) => (r.decided_at ? format(new Date(r.decided_at), 'PP') : '—') },
  { key: 'turnaround', label: 'Turnaround', align: 'right', render: (r) => (r.decided_at ? `${differenceInCalendarDays(new Date(r.decided_at), new Date(r.created_at))} day(s)` : '—') },
];

export function MyApprovalRequestsReport() {
  const { currentOrgId, session } = useAuth();
  const userId = session!.user.id;
  const [filters, setFilters] = useState<ApprovalReqFilters>({});
  const rows = useQuery({ queryKey: ['rpt-myreqs', userId, filters], queryFn: () => listMyApprovalRequests(userId, filters) });

  const applied = [filters.from && `from ${filters.from}`, filters.to && `to ${filters.to}`, filters.status && `status ${filters.status}`].filter(Boolean).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="My Approval Requests" subtitle="Approvals you requested and their status." icon={<ClipboardCheck size={22} />} />
      <ReportShell<MyRequestRow>
        reportKey="my-approval-requests"
        title="My Approval Requests Report"
        orgId={currentOrgId}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data ?? []}
        loading={rows.isLoading}
        presetData={filters as Record<string, unknown>}
        onLoadPreset={(p) => setFilters({ from: (p.from as string) || undefined, to: (p.to as string) || undefined, status: (p.status as string) || undefined })}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">From</label><input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" /></div>
            <div><label className="label">To</label><input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" /></div>
            <div><label className="label">Status</label><select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input"><option value="">Any</option>{STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            <button onClick={() => setFilters({})} className="btn-ghost">Clear</button>
          </div>
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/features/reports/staff/MyApprovalRequestsReport.tsx
git commit -m "feat(reports): My Approval Requests report"
```

---

### Task 4: My Approval Queue report

**Files:**
- Create: `frontend/src/features/reports/staff/MyApprovalQueueReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/staff/MyApprovalQueueReport.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Inbox } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { listMyApprovalQueue, type QueueFilters, type QueueRow } from '@/lib/reports/staff';
import { listDocumentTypes } from '@/lib/documentTypes';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<QueueRow>[] = [
  { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
  { key: 'document', label: 'Document', render: (r) => r.file_name },
  { key: 'type', label: 'Type', render: (r) => r.type_name ?? '—' },
  { key: 'requester', label: 'Requested by', render: (r) => r.requester ?? '—' },
  { key: 'requested', label: 'Requested', render: (r) => format(new Date(r.created_at), 'PP') },
];

export function MyApprovalQueueReport() {
  const { currentOrgId, session } = useAuth();
  const userId = session!.user.id;
  const [filters, setFilters] = useState<QueueFilters>({});
  const types = useQuery({ queryKey: ['docTypes', currentOrgId], queryFn: () => listDocumentTypes(currentOrgId!), enabled: !!currentOrgId });
  const rows = useQuery({ queryKey: ['rpt-myqueue', userId, filters], queryFn: () => listMyApprovalQueue(userId, filters) });

  const applied = filters.documentTypeId ? `type ${types.data?.find((t) => t.id === filters.documentTypeId)?.name ?? ''}` : 'All';

  return (
    <div>
      <PageHeader title="My Approval Queue" subtitle="Documents waiting for your approval." icon={<Inbox size={22} />} />
      <ReportShell<QueueRow>
        reportKey="my-approval-queue"
        title="My Approval Queue Report"
        orgId={currentOrgId}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data ?? []}
        loading={rows.isLoading}
        presetData={filters as Record<string, unknown>}
        onLoadPreset={(p) => setFilters({ documentTypeId: (p.documentTypeId as string) || undefined })}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">Type</label><select value={filters.documentTypeId ?? ''} onChange={(e) => setFilters({ documentTypeId: e.target.value || undefined })} className="input"><option value="">All</option>{(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
            <button onClick={() => setFilters({})} className="btn-ghost">Clear</button>
          </div>
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/features/reports/staff/MyApprovalQueueReport.tsx
git commit -m "feat(reports): My Approval Queue report"
```

---

### Task 5: My Released Papers report

**Files:**
- Create: `frontend/src/features/reports/staff/MyReleasedReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/staff/MyReleasedReport.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { listMyReleased, type ReleasedFilters } from '@/lib/reports/staff';
import { listDocumentTypes } from '@/lib/documentTypes';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { FileItem } from '@/lib/types';

const columns: ColumnDef<FileItem>[] = [
  { key: 'reference', label: 'Reference', render: (f) => f.reference_no ?? '—' },
  { key: 'title', label: 'Title', render: (f) => f.name },
  { key: 'type', label: 'Type', render: (f) => f.document_type?.name ?? '—' },
  { key: 'approver', label: 'Approved by', render: (f) => f.approver?.full_name ?? '—' },
  { key: 'released', label: 'Released', render: (f) => (f.released_at ? format(new Date(f.released_at), 'PP') : '—') },
];

export function MyReleasedReport() {
  const { currentOrgId, session } = useAuth();
  const userId = session!.user.id;
  const [filters, setFilters] = useState<ReleasedFilters>({});
  const types = useQuery({ queryKey: ['docTypes', currentOrgId], queryFn: () => listDocumentTypes(currentOrgId!), enabled: !!currentOrgId });
  const rows = useQuery({ queryKey: ['rpt-myreleased', userId, filters], queryFn: () => listMyReleased(userId, filters) });

  const applied = [filters.from && `from ${filters.from}`, filters.to && `to ${filters.to}`, filters.documentTypeId && `type ${types.data?.find((t) => t.id === filters.documentTypeId)?.name ?? ''}`].filter(Boolean).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="My Released Papers" subtitle="Your documents that have been released." icon={<Megaphone size={22} />} />
      <ReportShell<FileItem>
        reportKey="my-released"
        title="My Released Papers Report"
        orgId={currentOrgId}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data ?? []}
        loading={rows.isLoading}
        presetData={filters as Record<string, unknown>}
        onLoadPreset={(p) => setFilters({ from: (p.from as string) || undefined, to: (p.to as string) || undefined, documentTypeId: (p.documentTypeId as string) || undefined })}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">From</label><input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" /></div>
            <div><label className="label">To</label><input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" /></div>
            <div><label className="label">Type</label><select value={filters.documentTypeId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, documentTypeId: e.target.value || undefined }))} className="input"><option value="">All</option>{(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
            <button onClick={() => setFilters({})} className="btn-ghost">Clear</button>
          </div>
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/features/reports/staff/MyReleasedReport.tsx
git commit -m "feat(reports): My Released Papers report"
```

---

### Task 6: Routes

**Files:**
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Add routes** (read `main.tsx` first)

In `frontend/src/main.tsx`, add imports near the existing reports imports:

```ts
import { MyApprovalRequestsReport } from '@/features/reports/staff/MyApprovalRequestsReport';
import { MyApprovalQueueReport } from '@/features/reports/staff/MyApprovalQueueReport';
import { MyReleasedReport } from '@/features/reports/staff/MyReleasedReport';
```

In the `/app` children array, add after the existing `reports/my-documents` route:

```tsx
          { path: 'reports/my-approval-requests', element: <MyApprovalRequestsReport /> },
          { path: 'reports/my-approval-queue', element: <MyApprovalQueueReport /> },
          { path: 'reports/my-released', element: <MyReleasedReport /> },
```

- [ ] **Step 2: Type-check + build + commit**

Run: `cd frontend && npx tsc --noEmit && npm run build`
```bash
git add frontend/src/main.tsx
git commit -m "feat(reports): routes for staff reports"
```

---

### Task 7: Build verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build` → succeeds.

- [ ] **Step 2: Manual check (on the running app)**

- Reports landing now shows four cards: My Documents, My Approval Requests, My Approval Queue, My Released Papers.
- **My Approval Requests** → lists approvals you requested with status, approver, requested/decided dates, and turnaround; filter by date/status; print.
- **My Approval Queue** → lists documents currently awaiting your approval (where you're the active step); filter by type. (As an approver, request one to yourself to populate it.)
- **My Released Papers** → lists your released documents with approver + release date; filter by date/type.
- Columns/presets/print work on each (same shell as My Documents).

---

## Self-review against the spec

**Spec coverage (Plan 2 portion):**
- My Approval Requests (status + turnaround) → Tasks 1, 3 ✅
- My Approval Queue (awaiting my approval) → Tasks 1, 4 ✅
- My Released Papers → Tasks 1, 5 ✅
- All reuse the framework (filters, columns, presets, print) and appear on the landing via the registry → Tasks 2, 6 ✅

**Placeholder scan:** none — all code concrete; Task 6 is a targeted edit the implementer reads first.

**Type consistency:** `ApprovalReqFilters`/`MyRequestRow`/`QueueFilters`/`QueueRow`/`ReleasedFilters` defined in `staff.ts` and imported by the report pages; `listMyApprovalRequests`/`listMyApprovalQueue`/`listMyReleased` signatures match. `MyRequestRow.status` is `ApprovalStatus`, cast to `DocStatus` for `StatusBadge` (values pending/approved/rejected are valid in both). `ColumnDef<T>` reused from Plan 1. Registry keys match report `reportKey` props.

**Deferred (correct):** office reports (backend) = Plan 3; platform reports (backend) = Plan 4.
```
