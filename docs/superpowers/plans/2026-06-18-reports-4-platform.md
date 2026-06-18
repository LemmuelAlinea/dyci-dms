# Reports — Plan 4: System Admin Platform Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the four platform-wide reports to the System Admin console — Platform Overview, Organizations Directory, Storage Utilization, and Platform Activity Log — completing the reports feature.

**Architecture:** Three new system-admin-only backend endpoints (`/reports/admin/overview|organizations|storage`) plus the existing `/admin/activity` (reused for the activity report). Four frontend pages using `ReportLayout` (overview) and `ReportShell` (the three tables), registered in `ADMIN_REPORTS` (the Admin Reports landing already renders that list) with routes under `/admin/reports/*`.

**Tech Stack:** Express + TS (backend, supabaseAdmin); React + Vite + TS + Tailwind, TanStack Query, date-fns.

**Spec:** `docs/superpowers/specs/2026-06-18-reports-design.md` · **Depends on:** Reports Plans 1–3 (merged). **This is Plan 4 of 4. No SQL; requires a backend redeploy.**

**Testing note:** UI + backend. Verify with `cd backend && npm run build`, `cd frontend && npx tsc --noEmit`, `npm run build`, plus the manual smoke in Task 8.

---

## File structure (Plan 4)

- `backend/src/routes/reports.ts` — **modify**: append three `/admin/*` endpoints.
- `frontend/src/lib/api.ts` — **modify**: add three methods + types.
- `frontend/src/features/reports/admin/PlatformOverviewReport.tsx` — **create**.
- `frontend/src/features/reports/admin/OrganizationsDirectoryReport.tsx` — **create**.
- `frontend/src/features/reports/admin/StorageUtilizationReport.tsx` — **create**.
- `frontend/src/features/reports/admin/PlatformActivityReport.tsx` — **create**.
- `frontend/src/features/reports/registry.ts` — **modify**: add `ADMIN_REPORTS` entries.
- `frontend/src/main.tsx` — **modify**: add routes.

---

### Task 1: Backend platform endpoints

**Files:**
- Modify: `backend/src/routes/reports.ts`

- [ ] **Step 1: Read the file**, then add `isSystemAdmin` to the auth import. Change:

```ts
import { requireAuth, roleInOrg, type AuthedRequest } from '../middleware/auth.js';
```

to:

```ts
import { isSystemAdmin, requireAuth, roleInOrg, type AuthedRequest } from '../middleware/auth.js';
```

- [ ] **Step 2: Append the three endpoints** to the **end** of `backend/src/routes/reports.ts`:

```ts
// ── Platform Overview (system admin) ─────────────────────────────────────────
reportsRouter.get('/admin/overview', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isSystemAdmin(req.user!.id))) return res.status(403).json({ error: 'System admin only' });
  const [{ count: orgCount }, { count: userCount }, { count: fileCount }, { data: orgs }] = await Promise.all([
    supabaseAdmin.from('organizations').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('files').select('*', { count: 'exact', head: true }).neq('state', 'trashed'),
    supabaseAdmin.from('organizations').select('type, storage_used_bytes'),
  ]);
  const byType: Record<string, { count: number; storage: number }> = {};
  let totalStorage = 0;
  (orgs ?? []).forEach((o: any) => {
    const t = o.type ?? 'general';
    if (!byType[t]) byType[t] = { count: 0, storage: 0 };
    byType[t].count += 1;
    byType[t].storage += Number(o.storage_used_bytes ?? 0);
    totalStorage += Number(o.storage_used_bytes ?? 0);
  });
  res.json({
    organizations: orgCount ?? 0,
    users: userCount ?? 0,
    documents: fileCount ?? 0,
    storageBytes: totalStorage,
    byType: Object.entries(byType).map(([type, v]) => ({ type, count: v.count, storage: v.storage })),
  });
});

// ── Organizations Directory (system admin) ───────────────────────────────────
reportsRouter.get('/admin/organizations', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isSystemAdmin(req.user!.id))) return res.status(403).json({ error: 'System admin only' });
  const [{ data: orgs }, { data: members }, { data: files }, { data: admins }] = await Promise.all([
    supabaseAdmin.from('organizations').select('id, code, name, type, storage_used_bytes, storage_quota_bytes, admin_id, created_at').order('created_at', { ascending: false }),
    supabaseAdmin.from('organization_members').select('org_id'),
    supabaseAdmin.from('files').select('org_id').neq('state', 'trashed'),
    supabaseAdmin.from('profiles').select('id, full_name'),
  ]);
  const memberCount: Record<string, number> = {};
  (members ?? []).forEach((m: any) => (memberCount[m.org_id] = (memberCount[m.org_id] ?? 0) + 1));
  const docCount: Record<string, number> = {};
  (files ?? []).forEach((f: any) => (docCount[f.org_id] = (docCount[f.org_id] ?? 0) + 1));
  const adminName = new Map((admins ?? []).map((a: any) => [a.id, a.full_name]));
  res.json({
    rows: (orgs ?? []).map((o: any) => ({
      id: o.id, code: o.code, name: o.name, type: o.type,
      admin_name: o.admin_id ? adminName.get(o.admin_id) ?? null : null,
      members: memberCount[o.id] ?? 0, documents: docCount[o.id] ?? 0,
      storage_used: o.storage_used_bytes, storage_quota: o.storage_quota_bytes, created_at: o.created_at,
    })),
  });
});

// ── Storage Utilization (system admin) ───────────────────────────────────────
reportsRouter.get('/admin/storage', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isSystemAdmin(req.user!.id))) return res.status(403).json({ error: 'System admin only' });
  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('id, code, name, type, storage_used_bytes, storage_quota_bytes')
    .order('storage_used_bytes', { ascending: false });
  res.json({
    rows: (orgs ?? []).map((o: any) => {
      const pct = o.storage_quota_bytes ? (Number(o.storage_used_bytes) / Number(o.storage_quota_bytes)) * 100 : 0;
      return {
        id: o.id, code: o.code, name: o.name, type: o.type,
        storage_used: o.storage_used_bytes, storage_quota: o.storage_quota_bytes,
        percent: pct, health: pct < 60 ? 'Healthy' : pct < 85 ? 'Moderate' : 'Critical',
      };
    }),
  });
});
```

- [ ] **Step 3: Build + commit**

Run: `cd backend && npm run build` (expected: succeeds)
```bash
git add backend/src/routes/reports.ts
git commit -m "feat(reports): platform report endpoints"
```

---

### Task 2: Frontend API methods + types

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Read the file**, then add three methods inside the `api` object, after the existing `reportOrgByType` method:

```ts
  reportAdminOverview: () => get<AdminOverview>('/reports/admin/overview'),
  reportAdminOrganizations: () => get<{ rows: OrgDirRow[] }>('/reports/admin/organizations'),
  reportAdminStorage: () => get<{ rows: StorageRow[] }>('/reports/admin/storage'),
```

- [ ] **Step 2: Add the types** at the end of `api.ts`:

```ts
export interface AdminOverview {
  organizations: number;
  users: number;
  documents: number;
  storageBytes: number;
  byType: { type: string; count: number; storage: number }[];
}
export interface OrgDirRow {
  id: string; code: string; name: string; type: string; admin_name: string | null;
  members: number; documents: number; storage_used: number; storage_quota: number; created_at: string;
}
export interface StorageRow {
  id: string; code: string; name: string; type: string;
  storage_used: number; storage_quota: number; percent: number; health: string;
}
```

- [ ] **Step 3: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/lib/api.ts
git commit -m "feat(reports): platform report api methods + types"
```

---

### Task 3: Platform Overview report

**Files:**
- Create: `frontend/src/features/reports/admin/PlatformOverviewReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/admin/PlatformOverviewReport.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Database, Printer } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { ORG_TYPE_LABELS, type OrgType } from '@/lib/types';
import { useAuth } from '@/store/auth';

export function PlatformOverviewReport() {
  const generatedBy = useAuth((s) => s.profile?.full_name) ?? 'System Admin';
  const q = useQuery({ queryKey: ['rpt-platover'], queryFn: api.reportAdminOverview, retry: 0 });
  const d = q.data;

  return (
    <div>
      <PageHeader title="Platform Overview" subtitle="A snapshot of the whole platform." icon={<Database size={22} />} />
      <div className="no-print mb-4 flex justify-end">
        <button onClick={() => window.print()} className="btn-primary"><Printer size={16} /> Print / Save as PDF</button>
      </div>
      {q.isError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
          Backend API is unreachable — start the backend to load this report.
        </div>
      )}
      {q.isLoading || !d ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : (
        <ReportLayout title="Platform Overview Report" generatedBy={generatedBy}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Organizations', value: d.organizations },
              { label: 'Users', value: d.users },
              { label: 'Documents', value: d.documents },
              { label: 'Total storage', value: formatBytes(d.storageBytes) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <p className="font-display text-2xl font-extrabold text-navy-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-wide text-slate-400">By office type</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-400 dark:border-white/10">
                <th className="px-2 py-1.5">Office type</th><th className="px-2 py-1.5 text-right">Offices</th><th className="px-2 py-1.5 text-right">Storage</th>
              </tr>
            </thead>
            <tbody>
              {d.byType.map((t) => (
                <tr key={t.type} className="border-b border-slate-100 dark:border-white/5">
                  <td className="px-2 py-1.5">{ORG_TYPE_LABELS[t.type as OrgType] ?? t.type}</td>
                  <td className="px-2 py-1.5 text-right">{t.count}</td>
                  <td className="px-2 py-1.5 text-right">{formatBytes(t.storage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportLayout>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/features/reports/admin/PlatformOverviewReport.tsx
git commit -m "feat(reports): Platform Overview report"
```

---

### Task 4: Organizations Directory report

**Files:**
- Create: `frontend/src/features/reports/admin/OrganizationsDirectoryReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/admin/OrganizationsDirectoryReport.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Building2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type OrgDirRow } from '@/lib/api';
import { formatBytes, storagePercent } from '@/lib/utils';
import { ORG_TYPE_LABELS, type OrgType } from '@/lib/types';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<OrgDirRow>[] = [
  { key: 'code', label: 'Code', render: (r) => r.code },
  { key: 'name', label: 'Office', render: (r) => r.name },
  { key: 'type', label: 'Type', render: (r) => ORG_TYPE_LABELS[r.type as OrgType] ?? r.type },
  { key: 'admin', label: 'Admin', render: (r) => r.admin_name ?? '—' },
  { key: 'members', label: 'Members', align: 'right', render: (r) => r.members },
  { key: 'documents', label: 'Documents', align: 'right', render: (r) => r.documents },
  { key: 'storage', label: 'Storage', align: 'right', render: (r) => `${formatBytes(r.storage_used)} (${storagePercent(r.storage_used, r.storage_quota).label}%)` },
  { key: 'created', label: 'Created', render: (r) => format(new Date(r.created_at), 'PP') },
];

export function OrganizationsDirectoryReport() {
  const rows = useQuery({ queryKey: ['rpt-orgdir'], queryFn: api.reportAdminOrganizations, retry: 0 });
  return (
    <div>
      <PageHeader title="Organizations Directory" subtitle="Every office on the platform." icon={<Building2 size={22} />} />
      <ReportShell<OrgDirRow>
        reportKey="organizations-directory"
        title="Organizations Directory"
        orgId={null}
        appliedFilters="All offices"
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
git add frontend/src/features/reports/admin/OrganizationsDirectoryReport.tsx
git commit -m "feat(reports): Organizations Directory report"
```

---

### Task 5: Storage Utilization report

**Files:**
- Create: `frontend/src/features/reports/admin/StorageUtilizationReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/admin/StorageUtilizationReport.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { HardDrive } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type StorageRow } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { ORG_TYPE_LABELS, type OrgType } from '@/lib/types';
import type { ColumnDef } from '@/lib/reports/types';

const healthClass = (h: string) =>
  h === 'Healthy'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'
    : h === 'Moderate'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300'
    : 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300';

const columns: ColumnDef<StorageRow>[] = [
  { key: 'code', label: 'Code', render: (r) => r.code },
  { key: 'name', label: 'Office', render: (r) => r.name },
  { key: 'type', label: 'Type', render: (r) => ORG_TYPE_LABELS[r.type as OrgType] ?? r.type },
  { key: 'used', label: 'Used', align: 'right', render: (r) => formatBytes(r.storage_used) },
  { key: 'quota', label: 'Quota', align: 'right', render: (r) => formatBytes(r.storage_quota) },
  { key: 'percent', label: 'Used %', align: 'right', render: (r) => `${r.percent.toFixed(r.percent < 1 ? 2 : 0)}%` },
  { key: 'health', label: 'Health', render: (r) => <span className={`chip ${healthClass(r.health)}`}>{r.health}</span> },
];

export function StorageUtilizationReport() {
  const rows = useQuery({ queryKey: ['rpt-storage'], queryFn: api.reportAdminStorage, retry: 0 });
  return (
    <div>
      <PageHeader title="Storage Utilization" subtitle="Storage usage per office." icon={<HardDrive size={22} />} />
      <ReportShell<StorageRow>
        reportKey="storage-utilization"
        title="Storage Utilization Report"
        orgId={null}
        appliedFilters="All offices"
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
git add frontend/src/features/reports/admin/StorageUtilizationReport.tsx
git commit -m "feat(reports): Storage Utilization report"
```

---

### Task 6: Platform Activity report

**Files:**
- Create: `frontend/src/features/reports/admin/PlatformActivityReport.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/reports/admin/PlatformActivityReport.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type ActivityEvent } from '@/lib/api';
import { listOrganizations } from '@/lib/admin';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<ActivityEvent>[] = [
  { key: 'when', label: 'When', render: (e) => format(new Date(e.at), 'PP p') },
  { key: 'actor', label: 'Actor', render: (e) => e.actor ?? '—' },
  { key: 'action', label: 'Action', render: (e) => e.action },
  { key: 'target', label: 'Target', render: (e) => e.target ?? '—' },
  { key: 'office', label: 'Office', render: (e) => e.org_code ?? '—' },
];

export function PlatformActivityReport() {
  const [orgId, setOrgId] = useState('');
  const orgs = useQuery({ queryKey: ['adminOrgs'], queryFn: listOrganizations });
  const data = useQuery({ queryKey: ['rpt-platactivity', orgId], queryFn: () => api.adminActivity(orgId || undefined), retry: 0 });

  const applied = orgId ? `office ${orgs.data?.find((o) => o.id === orgId)?.code ?? ''}` : 'All offices';

  return (
    <div>
      <PageHeader title="Platform Activity Log" subtitle="Recent activity across all offices." icon={<Activity size={22} />} />
      <ReportShell<ActivityEvent>
        reportKey="platform-activity"
        title="Platform Activity Log"
        orgId={null}
        appliedFilters={applied}
        columns={columns}
        rows={data.data?.events ?? []}
        loading={data.isLoading}
        presetData={{ orgId }}
        onLoadPreset={(p) => setOrgId((p.orgId as string) || '')}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div>
              <label className="label">Office</label>
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="input">
                <option value="">All offices</option>
                {(orgs.data ?? []).map((o) => (<option key={o.id} value={o.id}>{o.code} — {o.name}</option>))}
              </select>
            </div>
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
git add frontend/src/features/reports/admin/PlatformActivityReport.tsx
git commit -m "feat(reports): Platform Activity Log report"
```

---

### Task 7: Registry + routes

**Files:**
- Modify: `frontend/src/features/reports/registry.ts`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Add ADMIN_REPORTS entries** — in `frontend/src/features/reports/registry.ts`, replace the empty `ADMIN_REPORTS` array:

```ts
export const ADMIN_REPORTS: AdminReportDef[] = [];
```

with:

```ts
export const ADMIN_REPORTS: AdminReportDef[] = [
  { key: 'platform-overview', title: 'Platform Overview', description: 'A snapshot of the whole platform.', to: '/admin/reports/overview' },
  { key: 'organizations-directory', title: 'Organizations Directory', description: 'Every office with admin, members, storage.', to: '/admin/reports/organizations' },
  { key: 'storage-utilization', title: 'Storage Utilization', description: 'Storage usage per office.', to: '/admin/reports/storage' },
  { key: 'platform-activity', title: 'Platform Activity Log', description: 'Recent activity across all offices.', to: '/admin/reports/activity' },
];
```

- [ ] **Step 2: Add routes** — in `frontend/src/main.tsx` (read first), add imports near the existing reports imports:

```ts
import { PlatformOverviewReport } from '@/features/reports/admin/PlatformOverviewReport';
import { OrganizationsDirectoryReport } from '@/features/reports/admin/OrganizationsDirectoryReport';
import { StorageUtilizationReport } from '@/features/reports/admin/StorageUtilizationReport';
import { PlatformActivityReport } from '@/features/reports/admin/PlatformActivityReport';
```

In the `/admin` children array, after the existing `reports` route, add:

```tsx
          { path: 'reports/overview', element: <PlatformOverviewReport /> },
          { path: 'reports/organizations', element: <OrganizationsDirectoryReport /> },
          { path: 'reports/storage', element: <StorageUtilizationReport /> },
          { path: 'reports/activity', element: <PlatformActivityReport /> },
```

- [ ] **Step 3: Type-check + build + commit**

Run: `cd frontend && npx tsc --noEmit && npm run build`
```bash
git add frontend/src/features/reports/registry.ts frontend/src/main.tsx
git commit -m "feat(reports): register platform reports + routes"
```

---

### Task 8: Build verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Builds**

Run: `cd backend && npm run build` → succeeds. `cd frontend && npm run build` → succeeds.

- [ ] **Step 2: Manual check (after backend redeploy)**

- As **System Admin**, Admin console → **Reports** now shows four cards.
  - **Platform Overview** prints totals + a by-office-type table.
  - **Organizations Directory** lists every office (code, type, admin, members, documents, storage) — columns/presets/print.
  - **Storage Utilization** lists per-office usage with a colored health chip.
  - **Platform Activity Log** lists recent actions; filter by office; print.
- All print to a clean DYCI letterhead.

---

## Self-review against the spec

**Spec coverage (Plan 4 portion):**
- Platform Overview (totals + by office type) → Tasks 1, 3 ✅
- Organizations Directory → Tasks 1, 4 ✅
- Storage Utilization (per-office %, health) → Tasks 1, 5 ✅
- Platform Activity Log (reuses `/admin/activity`) → Task 6 ✅
- System-admin-only (backend `isSystemAdmin` guard) → Task 1 ✅
- Reuse framework (ReportShell/ReportLayout, print, presets) → Tasks 3–6 ✅
- Registered on the Admin Reports landing + routes → Task 7 ✅

**Placeholder scan:** none — all code concrete; Tasks 1, 2, 7 are targeted edits the implementer reads first.

**Type consistency:** `AdminOverview`/`OrgDirRow`/`StorageRow` defined in `api.ts` and imported by their pages; `api.reportAdmin*` + reused `api.adminActivity` (returns `{ events: ActivityEvent[] }`) signatures match. `ColumnDef<T>` reused; `ORG_TYPE_LABELS` + `OrgType` from `types.ts`; `storagePercent` from `utils.ts`; `listOrganizations` from `admin.ts`. `ADMIN_REPORTS` keys are informational (the landing reads `.to`).

**This completes the reports feature** (Plans 1–4: foundation, staff, office, platform).
