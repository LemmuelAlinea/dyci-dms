# Reports — Plan 3: Org Admin + Co-Admin Office Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the office-level reports — Office Summary, Document Register, Approval Report (with per-approver workload), Member Activity, Released Papers Register, and Document-Type Report — for Org Admins, plus the operational subset (Document Register, Approval Report, Released Register, Member Directory) for Co-Admins.

**Architecture:** Backend `/reports/org/:orgId/*` endpoints (service role) authorize the caller's role (`admin`, or `co_admin` for the subset) — required because co-admins can't read office-wide files via RLS. The frontend report pages call them through the `api` client and render with the existing `ReportShell` (a small `extra` slot is added so the Approval Report can print its workload table; the Office Summary uses `ReportLayout` directly since it isn't a single table).

**Tech Stack:** Express + TS (backend, supabaseAdmin); React + Vite + TS + Tailwind, TanStack Query, date-fns (frontend).

**Spec:** `docs/superpowers/specs/2026-06-18-reports-design.md` · **Depends on:** Reports Plans 1–2 (merged). **This is Plan 3 of 4. No SQL; requires a backend redeploy.**

**Testing note:** UI + backend queries. Verify with `cd backend && npm run build`, `cd frontend && npx tsc --noEmit`, `npm run build`, plus the manual smoke in Task 12.

---

## File structure (Plan 3)

- `backend/src/routes/reports.ts` — **replace**: the 7 office report endpoints.
- `frontend/src/lib/api.ts` — **modify**: a `qs()` helper + report methods + response types.
- `frontend/src/components/reports/ReportShell.tsx` — **modify**: add an optional `extra` slot.
- `frontend/src/features/reports/office/OfficeSummaryReport.tsx` — **create**.
- `frontend/src/features/reports/office/DocumentRegisterReport.tsx` — **create**.
- `frontend/src/features/reports/office/ApprovalReportPage.tsx` — **create**.
- `frontend/src/features/reports/office/MemberActivityReport.tsx` — **create**.
- `frontend/src/features/reports/office/MemberDirectoryReport.tsx` — **create**.
- `frontend/src/features/reports/office/ReleasedRegisterReport.tsx` — **create**.
- `frontend/src/features/reports/office/DocumentTypeReport.tsx` — **create**.
- `frontend/src/features/reports/registry.ts` — **modify**: add the office report entries.
- `frontend/src/main.tsx` — **modify**: add routes.

---

### Task 1: Backend office report endpoints

**Files:**
- Replace whole file: `backend/src/routes/reports.ts`

- [ ] **Step 1: Replace the file**

Replace ALL of `backend/src/routes/reports.ts` with:

```ts
import { Router, type Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, roleInOrg, type AuthedRequest } from '../middleware/auth.js';

export const reportsRouter = Router();

async function authorizeOrg(req: AuthedRequest, res: Response, orgId: string, allowed: string[]): Promise<boolean> {
  const role = await roleInOrg(req.user!.id, orgId);
  if (!role || !allowed.includes(role)) {
    res.status(403).json({ error: 'You are not allowed to view this report' });
    return false;
  }
  return true;
}

const fullName = (p: unknown) => (p as { full_name?: string } | null)?.full_name ?? null;
const dayEnd = (d: string) => `${d}T23:59:59`;

// ── Office Summary (admin) ───────────────────────────────────────────────────
reportsRouter.get('/org/:orgId/summary', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin']))) return;
  const [{ data: org }, membersRes, filesRes, catsRes, typesRes, pendingRes] = await Promise.all([
    supabaseAdmin.from('organizations').select('name, code, storage_used_bytes, storage_quota_bytes').eq('id', orgId).single(),
    supabaseAdmin.from('organization_members').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
    supabaseAdmin.from('files').select('status, category_id, document_type_id').eq('org_id', orgId).neq('state', 'trashed'),
    supabaseAdmin.from('categories').select('id, name').eq('org_id', orgId),
    supabaseAdmin.from('document_types').select('id, name').eq('org_id', orgId),
    supabaseAdmin.from('approval_requests').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending'),
  ]);
  const files = (filesRes.data ?? []) as { status: string; category_id: string | null; document_type_id: string | null }[];
  const byStatus: Record<string, number> = { draft: 0, pending: 0, approved: 0, released: 0, rejected: 0 };
  const byCat: Record<string, number> = {};
  const byType: Record<string, number> = {};
  files.forEach((f) => {
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    if (f.category_id) byCat[f.category_id] = (byCat[f.category_id] ?? 0) + 1;
    if (f.document_type_id) byType[f.document_type_id] = (byType[f.document_type_id] ?? 0) + 1;
  });
  const catName = new Map((catsRes.data ?? []).map((c) => [c.id, c.name]));
  const typeName = new Map((typesRes.data ?? []).map((t) => [t.id, t.name]));
  res.json({
    org,
    members: membersRes.count ?? 0,
    totalFiles: files.length,
    byStatus,
    byCategory: Object.entries(byCat).map(([id, count]) => ({ name: catName.get(id) ?? '—', count })),
    byType: Object.entries(byType).map(([id, count]) => ({ name: typeName.get(id) ?? '—', count })),
    released: byStatus.released,
    pendingApprovals: pendingRes.count ?? 0,
  });
});

// ── Document Register (admin, co_admin) ──────────────────────────────────────
reportsRouter.get('/org/:orgId/documents', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin', 'co_admin']))) return;
  const { status, type, category, owner, from, to } = req.query as Record<string, string>;
  let q = supabaseAdmin
    .from('files')
    .select('id, reference_no, name, status, created_at, released_at, owner:profiles!files_owner_id_fkey(full_name), document_type:document_types(name), category:categories(name)')
    .eq('org_id', orgId).neq('state', 'trashed').order('created_at', { ascending: false }).limit(2000);
  if (status) q = q.eq('status', status);
  if (type) q = q.eq('document_type_id', type);
  if (category) q = q.eq('category_id', category);
  if (owner) q = q.eq('owner_id', owner);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', dayEnd(to));
  const { data } = await q;
  res.json({
    rows: (data ?? []).map((r: any) => ({
      id: r.id, reference_no: r.reference_no, name: r.name, status: r.status, created_at: r.created_at, released_at: r.released_at,
      type_name: r.document_type?.name ?? null, category_name: r.category?.name ?? null, owner_name: fullName(r.owner),
    })),
  });
});

// ── Approval Report (admin, co_admin) ────────────────────────────────────────
reportsRouter.get('/org/:orgId/approvals', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin', 'co_admin']))) return;
  const { status, approver, from, to } = req.query as Record<string, string>;
  let q = supabaseAdmin
    .from('approval_requests')
    .select('id, status, current_step, created_at, files(name, reference_no), requester:profiles!approval_requests_requester_id_fkey(full_name)')
    .eq('org_id', orgId).order('created_at', { ascending: false }).limit(2000);
  if (status) q = q.eq('status', status);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', dayEnd(to));
  const { data: reqs } = await q;
  const ids = (reqs ?? []).map((r: any) => r.id);
  const stepsByReq = new Map<string, any[]>();
  const workload = new Map<string, { approver: string; pending: number; approved: number }>();
  if (ids.length) {
    const { data: steps } = await supabaseAdmin
      .from('approval_step_assignments')
      .select('request_id, step_no, status, decided_at, assignee_id, assignee:profiles!approval_step_assignments_assignee_id_fkey(full_name)')
      .in('request_id', ids);
    (steps ?? []).forEach((s: any) => {
      const arr = stepsByReq.get(s.request_id) ?? []; arr.push(s); stepsByReq.set(s.request_id, arr);
      if (!s.assignee_id) return;
      const w = workload.get(s.assignee_id) ?? { approver: fullName(s.assignee) ?? '—', pending: 0, approved: 0 };
      if (s.status === 'pending') w.pending += 1;
      if (s.status === 'approved') w.approved += 1;
      workload.set(s.assignee_id, w);
    });
  }
  let rows = (reqs ?? []).map((r: any) => {
    const ss = stepsByReq.get(r.id) ?? [];
    const cur = ss.find((s) => s.step_no === r.current_step);
    const decided = ss.map((s) => s.decided_at).filter(Boolean).sort().pop() ?? null;
    return { id: r.id, file_name: r.files?.name ?? '—', reference_no: r.files?.reference_no ?? null, requester: fullName(r.requester), current_approver: fullName(cur?.assignee), status: r.status, created_at: r.created_at, decided_at: r.status === 'pending' ? null : decided };
  });
  if (approver) {
    const allowed = new Set<string>();
    stepsByReq.forEach((ss, reqId) => { if (ss.some((s) => s.assignee_id === approver)) allowed.add(reqId); });
    rows = rows.filter((r) => allowed.has(r.id));
  }
  res.json({ rows, workload: [...workload.values()] });
});

// ── Member Activity (admin) ──────────────────────────────────────────────────
reportsRouter.get('/org/:orgId/members', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin']))) return;
  const [membersRes, posRes, filesRes, stepsRes] = await Promise.all([
    supabaseAdmin.from('organization_members').select('user_id, role, joined_at, profiles:profiles!organization_members_user_id_fkey(full_name, email)').eq('org_id', orgId).order('role'),
    supabaseAdmin.from('member_positions').select('user_id, positions(name)').eq('org_id', orgId),
    supabaseAdmin.from('files').select('owner_id, size_bytes, created_at').eq('org_id', orgId).neq('state', 'trashed'),
    supabaseAdmin.from('approval_step_assignments').select('assignee_id, status').eq('org_id', orgId).eq('status', 'approved'),
  ]);
  const posByUser = new Map<string, string[]>();
  (posRes.data ?? []).forEach((p: any) => { const a = posByUser.get(p.user_id) ?? []; if (p.positions?.name) a.push(p.positions.name); posByUser.set(p.user_id, a); });
  const upBy = new Map<string, number>(); const sizeBy = new Map<string, number>(); const lastBy = new Map<string, string>();
  (filesRes.data ?? []).forEach((f: any) => {
    upBy.set(f.owner_id, (upBy.get(f.owner_id) ?? 0) + 1);
    sizeBy.set(f.owner_id, (sizeBy.get(f.owner_id) ?? 0) + (f.size_bytes ?? 0));
    const cur = lastBy.get(f.owner_id); if (!cur || f.created_at > cur) lastBy.set(f.owner_id, f.created_at);
  });
  const apprBy = new Map<string, number>();
  (stepsRes.data ?? []).forEach((s: any) => { if (s.assignee_id) apprBy.set(s.assignee_id, (apprBy.get(s.assignee_id) ?? 0) + 1); });
  res.json({
    rows: (membersRes.data ?? []).map((m: any) => ({
      user_id: m.user_id, full_name: m.profiles?.full_name ?? null, email: m.profiles?.email ?? null, role: m.role,
      positions: (posByUser.get(m.user_id) ?? []).join(', '), uploads: upBy.get(m.user_id) ?? 0,
      approvals: apprBy.get(m.user_id) ?? 0, storage_bytes: sizeBy.get(m.user_id) ?? 0, last_active: lastBy.get(m.user_id) ?? null,
    })),
  });
});

// ── Member Directory (admin, co_admin) ───────────────────────────────────────
reportsRouter.get('/org/:orgId/members-directory', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin', 'co_admin']))) return;
  const [membersRes, posRes] = await Promise.all([
    supabaseAdmin.from('organization_members').select('user_id, role, joined_at, profiles:profiles!organization_members_user_id_fkey(full_name, email)').eq('org_id', orgId).order('role'),
    supabaseAdmin.from('member_positions').select('user_id, positions(name)').eq('org_id', orgId),
  ]);
  const posByUser = new Map<string, string[]>();
  (posRes.data ?? []).forEach((p: any) => { const a = posByUser.get(p.user_id) ?? []; if (p.positions?.name) a.push(p.positions.name); posByUser.set(p.user_id, a); });
  res.json({
    rows: (membersRes.data ?? []).map((m: any) => ({
      full_name: m.profiles?.full_name ?? null, email: m.profiles?.email ?? null, role: m.role,
      positions: (posByUser.get(m.user_id) ?? []).join(', '), joined_at: m.joined_at,
    })),
  });
});

// ── Released Register (admin, co_admin) ──────────────────────────────────────
reportsRouter.get('/org/:orgId/released', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin', 'co_admin']))) return;
  const { type, category, from, to } = req.query as Record<string, string>;
  let q = supabaseAdmin
    .from('files')
    .select('id, reference_no, name, released_at, owner:profiles!files_owner_id_fkey(full_name), approver:profiles!files_approved_by_fkey(full_name), document_type:document_types(name), category:categories(name)')
    .eq('org_id', orgId).eq('status', 'released').eq('state', 'active').order('released_at', { ascending: false }).limit(2000);
  if (type) q = q.eq('document_type_id', type);
  if (category) q = q.eq('category_id', category);
  if (from) q = q.gte('released_at', from);
  if (to) q = q.lte('released_at', dayEnd(to));
  const { data } = await q;
  res.json({
    rows: (data ?? []).map((r: any) => ({
      id: r.id, reference_no: r.reference_no, name: r.name, released_at: r.released_at,
      owner_name: fullName(r.owner), approver_name: fullName(r.approver), type_name: r.document_type?.name ?? null, category_name: r.category?.name ?? null,
    })),
  });
});

// ── Document-Type Report (admin) ─────────────────────────────────────────────
reportsRouter.get('/org/:orgId/by-type', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin']))) return;
  const { documentTypeId, status, from, to } = req.query as Record<string, string>;
  if (!documentTypeId) return res.json({ name: null, fields: [], rows: [] });
  const { data: dt } = await supabaseAdmin.from('document_types').select('name, fields').eq('id', documentTypeId).eq('org_id', orgId).single();
  let q = supabaseAdmin
    .from('files')
    .select('id, reference_no, status, created_at, metadata, owner:profiles!files_owner_id_fkey(full_name)')
    .eq('org_id', orgId).eq('document_type_id', documentTypeId).neq('state', 'trashed').order('created_at', { ascending: false }).limit(2000);
  if (status) q = q.eq('status', status);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', dayEnd(to));
  const { data } = await q;
  res.json({
    name: dt?.name ?? null,
    fields: dt?.fields ?? [],
    rows: (data ?? []).map((r: any) => ({ id: r.id, reference_no: r.reference_no, status: r.status, created_at: r.created_at, owner_name: fullName(r.owner), metadata: r.metadata ?? {} })),
  });
});
```

- [ ] **Step 2: Build + commit**

Run: `cd backend && npm run build` (expected: succeeds)
```bash
git add backend/src/routes/reports.ts
git commit -m "feat(reports): office report endpoints"
```

---

### Task 2: Frontend API methods + types

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Read `api.ts`**, then add a query-string helper just above the `export const api = {` line:

```ts
function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
}
```

- [ ] **Step 2: Add report methods** — inside the `api` object, after the existing `adminOrgDetail` method, add:

```ts
  reportOrgSummary: (orgId: string) => get<OrgSummary>(`/reports/org/${orgId}/summary`),
  reportOrgDocuments: (orgId: string, f: Record<string, string | undefined>) => get<{ rows: DocRegisterRow[] }>(`/reports/org/${orgId}/documents${qs(f)}`),
  reportOrgApprovals: (orgId: string, f: Record<string, string | undefined>) => get<{ rows: ApprovalRow[]; workload: WorkloadRow[] }>(`/reports/org/${orgId}/approvals${qs(f)}`),
  reportOrgMembers: (orgId: string) => get<{ rows: MemberActivityRow[] }>(`/reports/org/${orgId}/members`),
  reportOrgMembersDirectory: (orgId: string) => get<{ rows: MemberDirRow[] }>(`/reports/org/${orgId}/members-directory`),
  reportOrgReleased: (orgId: string, f: Record<string, string | undefined>) => get<{ rows: ReleasedRow[] }>(`/reports/org/${orgId}/released${qs(f)}`),
  reportOrgByType: (orgId: string, f: Record<string, string | undefined>) => get<ByTypeReport>(`/reports/org/${orgId}/by-type${qs(f)}`),
```

- [ ] **Step 3: Add the response types** — at the end of `api.ts` (after the existing exported interfaces), add:

```ts
export interface OrgSummary {
  org: { name: string; code: string; storage_used_bytes: number; storage_quota_bytes: number };
  members: number;
  totalFiles: number;
  byStatus: Record<string, number>;
  byCategory: { name: string; count: number }[];
  byType: { name: string; count: number }[];
  released: number;
  pendingApprovals: number;
}
export interface DocRegisterRow {
  id: string; reference_no: string | null; name: string; status: string; created_at: string; released_at: string | null;
  type_name: string | null; category_name: string | null; owner_name: string | null;
}
export interface ApprovalRow {
  id: string; file_name: string; reference_no: string | null; requester: string | null; current_approver: string | null;
  status: string; created_at: string; decided_at: string | null;
}
export interface WorkloadRow { approver: string; pending: number; approved: number }
export interface MemberActivityRow {
  user_id: string; full_name: string | null; email: string | null; role: string; positions: string;
  uploads: number; approvals: number; storage_bytes: number; last_active: string | null;
}
export interface MemberDirRow { full_name: string | null; email: string | null; role: string; positions: string; joined_at: string }
export interface ReleasedRow {
  id: string; reference_no: string | null; name: string; released_at: string | null;
  owner_name: string | null; approver_name: string | null; type_name: string | null; category_name: string | null;
}
export interface ByTypeField { key: string; label: string; type: string; options?: string[] }
export interface ByTypeReport {
  name: string | null;
  fields: ByTypeField[];
  rows: { id: string; reference_no: string | null; status: string; created_at: string; owner_name: string | null; metadata: Record<string, unknown> }[];
}
```

- [ ] **Step 4: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/lib/api.ts
git commit -m "feat(reports): office report api methods + types"
```

---

### Task 3: Add an `extra` slot to ReportShell

**Files:**
- Modify: `frontend/src/components/reports/ReportShell.tsx`

- [ ] **Step 1: Read the file**, then add `extra` to the props. Change the destructured props to include `extra` (add it after `onLoadPreset` in both the type and the destructure), e.g. add to the props type:

```ts
  extra?: ReactNode;
```

and to the destructure:

```ts
  extra,
```

- [ ] **Step 2: Render it** — inside the `<ReportLayout>`, after `<ReportTable .../>`, add:

```tsx
          {extra}
```

So it reads:

```tsx
        <ReportLayout title={title} orgName={orgName} appliedFilters={appliedFilters} generatedBy={fullName}>
          <ReportTable columns={visible} rows={rows} />
          {extra}
        </ReportLayout>
```

- [ ] **Step 3: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/components/reports/ReportShell.tsx
git commit -m "feat(reports): ReportShell extra slot"
```

---

### Task 4: Office Summary report

**Files:**
- Create: `frontend/src/features/reports/office/OfficeSummaryReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/office/OfficeSummaryReport.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Printer, Gauge } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { useAuth } from '@/store/auth';

export function OfficeSummaryReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const q = useQuery({ queryKey: ['rpt-summary', orgId], queryFn: () => api.reportOrgSummary(orgId) });
  const d = q.data;

  return (
    <div>
      <PageHeader title="Office Summary" subtitle="A printable snapshot of this office." icon={<Gauge size={22} />} />
      <div className="no-print mb-4 flex justify-end">
        <button onClick={() => window.print()} className="btn-primary"><Printer size={16} /> Print / Save as PDF</button>
      </div>
      {q.isLoading || !d ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : (
        <ReportLayout title="Office Summary Report" orgName={orgName} generatedBy={useAuth.getState().profile?.full_name ?? 'User'}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Members', value: d.members },
              { label: 'Documents', value: d.totalFiles },
              { label: 'Released', value: d.released },
              { label: 'Pending approvals', value: d.pendingApprovals },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <p className="font-display text-2xl font-extrabold text-navy-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">Storage: {formatBytes(d.org.storage_used_bytes)} of {formatBytes(d.org.storage_quota_bytes)}</p>

          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">By status</p>
              {(['draft', 'pending', 'approved', 'released', 'rejected'] as const).map((s) => (
                <div key={s} className="flex justify-between text-sm"><span className="capitalize text-slate-600 dark:text-slate-300">{s}</span><span className="font-semibold">{d.byStatus[s] ?? 0}</span></div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">By category</p>
              {d.byCategory.map((c) => (<div key={c.name} className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">{c.name}</span><span className="font-semibold">{c.count}</span></div>))}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">By document type</p>
              {d.byType.map((t) => (<div key={t.name} className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">{t.name}</span><span className="font-semibold">{t.count}</span></div>))}
            </div>
          </div>
        </ReportLayout>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/features/reports/office/OfficeSummaryReport.tsx
git commit -m "feat(reports): Office Summary report"
```

---

### Task 5: Document Register report

**Files:**
- Create: `frontend/src/features/reports/office/DocumentRegisterReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/office/DocumentRegisterReport.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BookText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api, type DocRegisterRow } from '@/lib/api';
import { listDocumentTypes } from '@/lib/documentTypes';
import { listCategories } from '@/lib/docTypeAdmin';
import { listMembers } from '@/lib/org';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { DocStatus } from '@/lib/types';

const STATUSES: DocStatus[] = ['draft', 'pending', 'approved', 'released', 'rejected'];

const columns: ColumnDef<DocRegisterRow>[] = [
  { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
  { key: 'title', label: 'Title', render: (r) => r.name },
  { key: 'type', label: 'Type', render: (r) => r.type_name ?? '—' },
  { key: 'category', label: 'Category', render: (r) => r.category_name ?? '—' },
  { key: 'owner', label: 'Owner', render: (r) => r.owner_name ?? '—' },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status as DocStatus} /> },
  { key: 'created', label: 'Created', render: (r) => format(new Date(r.created_at), 'PP') },
  { key: 'released', label: 'Released', render: (r) => (r.released_at ? format(new Date(r.released_at), 'PP') : '—') },
];

export function DocumentRegisterReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});

  const types = useQuery({ queryKey: ['docTypes', orgId], queryFn: () => listDocumentTypes(orgId) });
  const cats = useQuery({ queryKey: ['categories', orgId], queryFn: () => listCategories(orgId) });
  const members = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId) });
  const rows = useQuery({ queryKey: ['rpt-docreg', orgId, filters], queryFn: () => api.reportOrgDocuments(orgId, filters) });

  const applied = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="Document Register" subtitle="Every document in this office." icon={<BookText size={22} />} />
      <ReportShell<DocRegisterRow>
        reportKey="document-register"
        title="Document Register"
        orgId={orgId}
        orgName={orgName}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data?.rows ?? []}
        loading={rows.isLoading}
        presetData={filters}
        onLoadPreset={(p) => setFilters(p as Record<string, string | undefined>)}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">From</label><input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" /></div>
            <div><label className="label">To</label><input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" /></div>
            <div><label className="label">Status</label><select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input"><option value="">Any</option>{STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            <div><label className="label">Type</label><select value={filters.type ?? ''} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="input"><option value="">All</option>{(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
            <div><label className="label">Category</label><select value={filters.category ?? ''} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className="input"><option value="">All</option>{(cats.data ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
            <div><label className="label">Owner</label><select value={filters.owner ?? ''} onChange={(e) => setFilters((f) => ({ ...f, owner: e.target.value }))} className="input"><option value="">Anyone</option>{(members.data ?? []).map((m) => (<option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>))}</select></div>
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
git add frontend/src/features/reports/office/DocumentRegisterReport.tsx
git commit -m "feat(reports): Document Register report"
```

---

### Task 6: Approval report (with workload)

**Files:**
- Create: `frontend/src/features/reports/office/ApprovalReportPage.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/office/ApprovalReportPage.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format } from 'date-fns';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api, type ApprovalRow, type WorkloadRow } from '@/lib/api';
import { listMembers } from '@/lib/org';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { DocStatus } from '@/lib/types';

const STATUSES = ['pending', 'approved', 'rejected'];

const columns: ColumnDef<ApprovalRow>[] = [
  { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
  { key: 'document', label: 'Document', render: (r) => r.file_name },
  { key: 'requester', label: 'Requester', render: (r) => r.requester ?? '—' },
  { key: 'approver', label: 'Approver', render: (r) => r.current_approver ?? '—' },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status as DocStatus} /> },
  { key: 'requested', label: 'Requested', render: (r) => format(new Date(r.created_at), 'PP') },
  { key: 'decided', label: 'Decided', render: (r) => (r.decided_at ? format(new Date(r.decided_at), 'PP') : '—') },
  { key: 'turnaround', label: 'Turnaround', align: 'right', render: (r) => (r.decided_at ? `${differenceInCalendarDays(new Date(r.decided_at), new Date(r.created_at))} day(s)` : '—') },
];

function Workload({ rows }: { rows: WorkloadRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="mt-6">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Approver workload</p>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-400 dark:border-white/10"><th className="px-2 py-1.5">Approver</th><th className="px-2 py-1.5 text-right">Pending</th><th className="px-2 py-1.5 text-right">Approved</th></tr></thead>
        <tbody>{rows.map((w) => (<tr key={w.approver} className="border-b border-slate-100 dark:border-white/5"><td className="px-2 py-1.5">{w.approver}</td><td className="px-2 py-1.5 text-right">{w.pending}</td><td className="px-2 py-1.5 text-right">{w.approved}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

export function ApprovalReportPage() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});

  const members = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId) });
  const data = useQuery({ queryKey: ['rpt-approvals', orgId, filters], queryFn: () => api.reportOrgApprovals(orgId, filters) });

  const applied = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="Approval Report" subtitle="Approval activity and turnaround across the office." icon={<ClipboardList size={22} />} />
      <ReportShell<ApprovalRow>
        reportKey="approval-report"
        title="Approval Report"
        orgId={orgId}
        orgName={orgName}
        appliedFilters={applied}
        columns={columns}
        rows={data.data?.rows ?? []}
        loading={data.isLoading}
        presetData={filters}
        onLoadPreset={(p) => setFilters(p as Record<string, string | undefined>)}
        extra={<Workload rows={data.data?.workload ?? []} />}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">From</label><input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" /></div>
            <div><label className="label">To</label><input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" /></div>
            <div><label className="label">Status</label><select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input"><option value="">Any</option>{STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            <div><label className="label">Approver</label><select value={filters.approver ?? ''} onChange={(e) => setFilters((f) => ({ ...f, approver: e.target.value }))} className="input"><option value="">Anyone</option>{(members.data ?? []).map((m) => (<option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>))}</select></div>
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
git add frontend/src/features/reports/office/ApprovalReportPage.tsx
git commit -m "feat(reports): Approval Report with workload"
```

---

### Task 7: Member Activity report

**Files:**
- Create: `frontend/src/features/reports/office/MemberActivityReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/office/MemberActivityReport.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type MemberActivityRow } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { ROLE_LABEL, type OrgRole } from '@/lib/types';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<MemberActivityRow>[] = [
  { key: 'name', label: 'Name', render: (r) => r.full_name ?? '—' },
  { key: 'role', label: 'Role', render: (r) => ROLE_LABEL[r.role as OrgRole] ?? r.role },
  { key: 'positions', label: 'Positions', render: (r) => r.positions || '—' },
  { key: 'uploads', label: 'Uploads', align: 'right', render: (r) => r.uploads },
  { key: 'approvals', label: 'Approvals', align: 'right', render: (r) => r.approvals },
  { key: 'storage', label: 'Storage', align: 'right', render: (r) => formatBytes(r.storage_bytes) },
  { key: 'last', label: 'Last upload', render: (r) => (r.last_active ? format(new Date(r.last_active), 'PP') : '—') },
];

export function MemberActivityReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const rows = useQuery({ queryKey: ['rpt-members', orgId], queryFn: () => api.reportOrgMembers(orgId) });

  return (
    <div>
      <PageHeader title="Member Activity" subtitle="Per-member uploads, approvals, and storage." icon={<Users size={22} />} />
      <ReportShell<MemberActivityRow>
        reportKey="member-activity"
        title="Member Activity Report"
        orgId={orgId}
        orgName={orgName}
        appliedFilters="All members"
        columns={columns}
        rows={rows.data?.rows ?? []}
        loading={rows.isLoading}
        presetData={{}}
        onLoadPreset={() => undefined}
        filterPanel={null}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/features/reports/office/MemberActivityReport.tsx
git commit -m "feat(reports): Member Activity report"
```

---

### Task 8: Member Directory report (co-admin)

**Files:**
- Create: `frontend/src/features/reports/office/MemberDirectoryReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/office/MemberDirectoryReport.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Contact } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type MemberDirRow } from '@/lib/api';
import { ROLE_LABEL, type OrgRole } from '@/lib/types';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<MemberDirRow>[] = [
  { key: 'name', label: 'Name', render: (r) => r.full_name ?? '—' },
  { key: 'email', label: 'Email', render: (r) => r.email ?? '—' },
  { key: 'role', label: 'Role', render: (r) => ROLE_LABEL[r.role as OrgRole] ?? r.role },
  { key: 'positions', label: 'Positions', render: (r) => r.positions || '—' },
  { key: 'joined', label: 'Joined', render: (r) => format(new Date(r.joined_at), 'PP') },
];

export function MemberDirectoryReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const rows = useQuery({ queryKey: ['rpt-memdir', orgId], queryFn: () => api.reportOrgMembersDirectory(orgId) });

  return (
    <div>
      <PageHeader title="Member Directory" subtitle="People in this office and their positions." icon={<Contact size={22} />} />
      <ReportShell<MemberDirRow>
        reportKey="member-directory"
        title="Member Directory"
        orgId={orgId}
        orgName={orgName}
        appliedFilters="All members"
        columns={columns}
        rows={rows.data?.rows ?? []}
        loading={rows.isLoading}
        presetData={{}}
        onLoadPreset={() => undefined}
        filterPanel={null}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/features/reports/office/MemberDirectoryReport.tsx
git commit -m "feat(reports): Member Directory report"
```

---

### Task 9: Released Register report

**Files:**
- Create: `frontend/src/features/reports/office/ReleasedRegisterReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/office/ReleasedRegisterReport.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type ReleasedRow } from '@/lib/api';
import { listDocumentTypes } from '@/lib/documentTypes';
import { listCategories } from '@/lib/docTypeAdmin';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<ReleasedRow>[] = [
  { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
  { key: 'title', label: 'Title', render: (r) => r.name },
  { key: 'type', label: 'Type', render: (r) => r.type_name ?? '—' },
  { key: 'category', label: 'Category', render: (r) => r.category_name ?? '—' },
  { key: 'owner', label: 'Owner', render: (r) => r.owner_name ?? '—' },
  { key: 'approver', label: 'Approved by', render: (r) => r.approver_name ?? '—' },
  { key: 'released', label: 'Released', render: (r) => (r.released_at ? format(new Date(r.released_at), 'PP') : '—') },
];

export function ReleasedRegisterReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});

  const types = useQuery({ queryKey: ['docTypes', orgId], queryFn: () => listDocumentTypes(orgId) });
  const cats = useQuery({ queryKey: ['categories', orgId], queryFn: () => listCategories(orgId) });
  const rows = useQuery({ queryKey: ['rpt-releasedreg', orgId, filters], queryFn: () => api.reportOrgReleased(orgId, filters) });

  const applied = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="Released Papers Register" subtitle="All released documents in this office." icon={<Megaphone size={22} />} />
      <ReportShell<ReleasedRow>
        reportKey="released-register"
        title="Released Papers Register"
        orgId={orgId}
        orgName={orgName}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data?.rows ?? []}
        loading={rows.isLoading}
        presetData={filters}
        onLoadPreset={(p) => setFilters(p as Record<string, string | undefined>)}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">From</label><input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" /></div>
            <div><label className="label">To</label><input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" /></div>
            <div><label className="label">Type</label><select value={filters.type ?? ''} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="input"><option value="">All</option>{(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
            <div><label className="label">Category</label><select value={filters.category ?? ''} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className="input"><option value="">All</option>{(cats.data ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
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
git add frontend/src/features/reports/office/ReleasedRegisterReport.tsx
git commit -m "feat(reports): Released Papers Register report"
```

---

### Task 10: Document-Type report (dynamic)

**Files:**
- Create: `frontend/src/features/reports/office/DocumentTypeReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/office/DocumentTypeReport.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileSpreadsheet } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api, type ByTypeField } from '@/lib/api';
import { listDocumentTypes } from '@/lib/documentTypes';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { DocStatus } from '@/lib/types';

type Row = { id: string; reference_no: string | null; status: string; created_at: string; owner_name: string | null; metadata: Record<string, unknown> };
const STATUSES: DocStatus[] = ['draft', 'pending', 'approved', 'released', 'rejected'];

const peso = (n: number) => `₱${n.toLocaleString()}`;

function buildColumns(fields: ByTypeField[]): ColumnDef<Row>[] {
  const base: ColumnDef<Row>[] = [
    { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
    { key: 'owner', label: 'Owner', render: (r) => r.owner_name ?? '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status as DocStatus} /> },
    { key: 'created', label: 'Created', render: (r) => format(new Date(r.created_at), 'PP') },
  ];
  const fieldCols: ColumnDef<Row>[] = fields.map((f) => ({
    key: `m_${f.key}`,
    label: f.label,
    align: f.type === 'money' || f.type === 'number' ? 'right' : 'left',
    render: (r) => {
      const v = r.metadata?.[f.key];
      if (v === undefined || v === null || v === '') return '—';
      if (f.type === 'money') return peso(Number(v));
      if (f.type === 'yesno') return v ? 'Yes' : 'No';
      return String(v);
    },
    total:
      f.type === 'money'
        ? (rows) => peso(rows.reduce((s, r) => s + (Number(r.metadata?.[f.key]) || 0), 0))
        : undefined,
  }));
  return [...base, ...fieldCols];
}

export function DocumentTypeReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const [typeId, setTypeId] = useState('');
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});

  const types = useQuery({ queryKey: ['docTypes', orgId], queryFn: () => listDocumentTypes(orgId) });
  const data = useQuery({
    queryKey: ['rpt-bytype', orgId, typeId, filters],
    queryFn: () => api.reportOrgByType(orgId, { documentTypeId: typeId, ...filters }),
    enabled: !!typeId,
  });

  const columns = useMemo(() => buildColumns(data.data?.fields ?? []), [data.data?.fields]);
  const typeName = types.data?.find((t) => t.id === typeId)?.name ?? '';
  const applied = [typeName, ...Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`)].filter(Boolean).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="Document-Type Report" subtitle="A detailed report of one document type with its fields and totals." icon={<FileSpreadsheet size={22} />} />
      <ReportShell<Row>
        reportKey="document-type"
        title={`Document-Type Report${typeName ? ` — ${typeName}` : ''}`}
        orgId={orgId}
        orgName={orgName}
        appliedFilters={applied}
        columns={columns}
        rows={typeId ? data.data?.rows ?? [] : []}
        loading={!!typeId && data.isLoading}
        presetData={{ typeId, ...filters }}
        onLoadPreset={(p) => { if (p.typeId) setTypeId(p.typeId as string); setFilters({ from: p.from as string, to: p.to as string, status: p.status as string }); }}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">Document type</label><select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="input"><option value="">Select a type…</option>{(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
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
git add frontend/src/features/reports/office/DocumentTypeReport.tsx
git commit -m "feat(reports): dynamic Document-Type report"
```

---

### Task 11: Registry + routes

**Files:**
- Modify: `frontend/src/features/reports/registry.ts`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Add registry entries** — in `frontend/src/features/reports/registry.ts`, add to the `ORG_REPORTS` array:

```ts
  { key: 'office-summary', title: 'Office Summary', description: 'A snapshot of this office.', to: '/app/reports/office-summary', roles: ['admin'] },
  { key: 'document-register', title: 'Document Register', description: 'Every document in this office.', to: '/app/reports/document-register', roles: ['admin', 'co_admin'] },
  { key: 'approval-report', title: 'Approval Report', description: 'Approval activity and turnaround.', to: '/app/reports/approval-report', roles: ['admin', 'co_admin'] },
  { key: 'released-register', title: 'Released Papers Register', description: 'All released documents.', to: '/app/reports/released-register', roles: ['admin', 'co_admin'] },
  { key: 'member-activity', title: 'Member Activity', description: 'Per-member uploads, approvals, storage.', to: '/app/reports/member-activity', roles: ['admin'] },
  { key: 'member-directory', title: 'Member Directory', description: 'People in this office and their positions.', to: '/app/reports/member-directory', roles: ['co_admin'] },
  { key: 'document-type', title: 'Document-Type Report', description: 'A type’s records with fields and totals.', to: '/app/reports/document-type', roles: ['admin'] },
```

- [ ] **Step 2: Add routes** — in `frontend/src/main.tsx` (read it first), add imports near the existing reports imports:

```ts
import { OfficeSummaryReport } from '@/features/reports/office/OfficeSummaryReport';
import { DocumentRegisterReport } from '@/features/reports/office/DocumentRegisterReport';
import { ApprovalReportPage } from '@/features/reports/office/ApprovalReportPage';
import { MemberActivityReport } from '@/features/reports/office/MemberActivityReport';
import { MemberDirectoryReport } from '@/features/reports/office/MemberDirectoryReport';
import { ReleasedRegisterReport } from '@/features/reports/office/ReleasedRegisterReport';
import { DocumentTypeReport } from '@/features/reports/office/DocumentTypeReport';
```

In the `/app` children array, after the staff report routes, add:

```tsx
          { path: 'reports/office-summary', element: <OfficeSummaryReport /> },
          { path: 'reports/document-register', element: <DocumentRegisterReport /> },
          { path: 'reports/approval-report', element: <ApprovalReportPage /> },
          { path: 'reports/released-register', element: <ReleasedRegisterReport /> },
          { path: 'reports/member-activity', element: <MemberActivityReport /> },
          { path: 'reports/member-directory', element: <MemberDirectoryReport /> },
          { path: 'reports/document-type', element: <DocumentTypeReport /> },
```

- [ ] **Step 3: Type-check + build + commit**

Run: `cd frontend && npx tsc --noEmit && npm run build`
```bash
git add frontend/src/features/reports/registry.ts frontend/src/main.tsx
git commit -m "feat(reports): register office reports + routes"
```

---

### Task 12: Build verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Builds**

Run: `cd backend && npm run build` → succeeds. `cd frontend && npm run build` → succeeds.

- [ ] **Step 2: Manual check (after backend redeploy)**

- As an **Org Admin**, Reports landing shows the office reports + the staff reports. Open each:
  - **Office Summary** prints a letterhead snapshot (counts, storage, breakdowns).
  - **Document Register** lists all office documents; filter by date/status/type/category/owner; columns/presets/print.
  - **Approval Report** lists requests with turnaround + an **Approver workload** table (prints too).
  - **Member Activity** shows per-member uploads/approvals/storage.
  - **Released Papers Register** lists released docs.
  - **Document-Type Report** → pick *Disbursement Voucher* → columns include Payee/Amount with an **Amount total** row.
- As a **Co-Admin**, the landing shows only Document Register, Approval Report, Released Register, **Member Directory** (not Office Summary / Member Activity / Document-Type). Visiting an admin-only report route returns a 403 from the backend (the report shows empty / error state).
- As **Staff**, only the four personal reports appear.

---

## Self-review against the spec

**Spec coverage (Plan 3 portion):**
- Org Admin: Office Summary, Document Register, Approval Report (+ workload), Member Activity, Released Register, Document-Type Report → Tasks 1, 4–10 ✅
- Co-Admin operational subset (Document Register, Approval Report, Released Register, Member Directory); backend denies admin-only endpoints → Tasks 1, 11 (roles) + `authorizeOrg` ✅
- Backend service-role endpoints role-authorized → Task 1 ✅
- Reuse framework (filters/columns/presets/print); workload + summary print via `extra`/`ReportLayout` → Tasks 3, 4, 6 ✅
- Document-Type metadata columns + money totals → Task 10 ✅

**Placeholder scan:** none — all code concrete; Tasks 2, 3, 11 are targeted edits the implementer reads first.

**Type consistency:** response types (`OrgSummary`, `DocRegisterRow`, `ApprovalRow`, `WorkloadRow`, `MemberActivityRow`, `MemberDirRow`, `ReleasedRow`, `ByTypeReport`/`ByTypeField`) defined in `api.ts` and imported by their pages; `api.reportOrg*` signatures match. `ColumnDef<T>` reused. Registry keys match each page's `reportKey`. `listMembers` returns `OrgMembership[]` (`m.user_id`, `m.profiles`).

**Deferred (correct):** System Admin platform reports = Plan 4 (final).
```
