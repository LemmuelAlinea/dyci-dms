# Reports — Plan 1: Foundation + First Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable reports framework — role-gated Reports landing pages, a printable DYCI-letterhead layout, a filter + column-toggle + saved-preset shell — and ship one end-to-end report (Staff "My Documents") to prove the whole pipeline.

**Architecture:** A generic `ReportShell` wraps any report: it renders a no-print toolbar (columns, presets, print) + a filter panel, and a printable `ReportLayout` (letterhead) containing a `ReportTable`. Print uses a CSS `@media print` visibility trick (only the `.report-print` subtree prints) so no layout components need editing. Presets persist per-user in a new `report_presets` table. This plan's only report (My Documents) is client-side over RLS; office/platform reports come in later plans via a scaffolded backend `/reports` router.

**Tech Stack:** React + Vite + TS + Tailwind, TanStack Query, Supabase JS, date-fns, lucide-react; Express + TS backend.

**Spec:** `docs/superpowers/specs/2026-06-18-reports-design.md` · **This is Plan 1 of 4.**

**⚠️ Requires ONE SQL step:** apply `supabase/migrations/0010_report_presets.sql` (Task 1).

**Testing note:** UI + Supabase queries (no isolated pure logic). Verify with `cd frontend && npx tsc --noEmit` and `npm run build`, plus the manual smoke in Task 12.

---

## File structure (Plan 1)

- `supabase/migrations/0010_report_presets.sql` — **create**: `report_presets` table + RLS.
- `frontend/src/index.css` — **modify**: append `@media print` rules.
- `frontend/src/lib/reports/types.ts` — **create**: `ColumnDef`.
- `frontend/src/lib/reports/presets.ts` — **create**: preset CRUD.
- `frontend/src/lib/reports/staff.ts` — **create**: staff report queries (`listMyDocuments`).
- `frontend/src/components/reports/ReportLayout.tsx` — **create**: printable letterhead.
- `frontend/src/components/reports/ReportTable.tsx` — **create**: generic table + totals.
- `frontend/src/components/reports/ReportShell.tsx` — **create**: toolbar + filters + presets + print, renders Layout+Table.
- `frontend/src/features/reports/registry.ts` — **create**: report registry (role-gated list).
- `frontend/src/features/reports/ReportsPage.tsx` — **create**: org Reports landing.
- `frontend/src/features/reports/AdminReportsPage.tsx` — **create**: system-admin Reports landing.
- `frontend/src/features/reports/staff/MyDocumentsReport.tsx` — **create**: the report.
- `frontend/src/main.tsx` — **modify**: add routes.
- `frontend/src/components/layout/AppShell.tsx` — **modify**: add Reports nav (all org roles).
- `frontend/src/components/layout/AdminShell.tsx` — **modify**: add Reports nav.
- `backend/src/routes/reports.ts` — **create**: `/reports` router scaffold.
- `backend/src/index.ts` — **modify**: mount the router.

---

### Task 1: `report_presets` table (SQL)

**Files:**
- Create: `supabase/migrations/0010_report_presets.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_report_presets.sql`:

```sql
-- Saved report filter/column presets, per user. Paste into Supabase SQL Editor and run.
-- Safe to re-run.

create table if not exists public.report_presets (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  org_id     uuid references public.organizations(id) on delete cascade,
  report_key text not null,
  name       text not null,
  params     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_report_presets_user on public.report_presets(user_id, report_key);

alter table public.report_presets enable row level security;
drop policy if exists presets_all on public.report_presets;
create policy presets_all on public.report_presets for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 2: Apply in Supabase**

SQL Editor → paste → Run → "Success." Verify: `select count(*) from public.report_presets;` returns 0.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0010_report_presets.sql
git commit -m "feat(db): report_presets table"
```

---

### Task 2: Print stylesheet

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Append print rules**

Add this block to the **end** of `frontend/src/index.css`:

```css
@media print {
  body {
    background: #fff !important;
  }
  /* Hide everything, then reveal only the report letterhead subtree. */
  body * {
    visibility: hidden;
  }
  .report-print,
  .report-print * {
    visibility: visible;
  }
  .report-print {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none !important;
    box-shadow: none !important;
    color: #000;
  }
  .no-print {
    display: none !important;
  }
}
```

- [ ] **Step 2: Build check + commit**

Run: `cd frontend && npm run build` (expected: succeeds)
```bash
git add frontend/src/index.css
git commit -m "feat(reports): print stylesheet"
```

---

### Task 3: Report types + preset CRUD

**Files:**
- Create: `frontend/src/lib/reports/types.ts`
- Create: `frontend/src/lib/reports/presets.ts`

- [ ] **Step 1: Create the column type**

Create `frontend/src/lib/reports/types.ts`:

```ts
import type { ReactNode } from 'react';

export interface ColumnDef<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  total?: (rows: T[]) => ReactNode;
  align?: 'left' | 'right';
  defaultHidden?: boolean;
}
```

- [ ] **Step 2: Create the presets lib**

Create `frontend/src/lib/reports/presets.ts`:

```ts
import { supabase } from '@/lib/supabase';

export interface ReportPreset {
  id: string;
  user_id: string;
  org_id: string | null;
  report_key: string;
  name: string;
  params: Record<string, unknown>;
  created_at: string;
}

export async function listPresets(reportKey: string, orgId: string | null): Promise<ReportPreset[]> {
  let q = supabase.from('report_presets').select('*').eq('report_key', reportKey).order('created_at');
  if (orgId) q = q.or(`org_id.eq.${orgId},org_id.is.null`);
  const { data } = await q;
  return (data as ReportPreset[]) ?? [];
}

export async function savePreset(reportKey: string, name: string, params: Record<string, unknown>, orgId: string | null): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase.from('report_presets').insert({ user_id: userId, org_id: orgId, report_key: reportKey, name, params });
  if (error) throw error;
}

export async function deletePreset(id: string): Promise<void> {
  const { error } = await supabase.from('report_presets').delete().eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 3: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/lib/reports/types.ts frontend/src/lib/reports/presets.ts
git commit -m "feat(reports): column type + preset CRUD"
```

---

### Task 4: Printable letterhead layout

**Files:**
- Create: `frontend/src/components/reports/ReportLayout.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/reports/ReportLayout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { Logo } from '@/components/ui/Logo';

export function ReportLayout({
  title,
  orgName,
  appliedFilters,
  generatedBy,
  children,
}: {
  title: string;
  orgName?: string;
  appliedFilters?: string;
  generatedBy: string;
  children: ReactNode;
}) {
  return (
    <div className="report-print card p-6">
      <div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
        <Logo size={56} />
        <div>
          <p className="font-display text-lg font-extrabold text-navy-900 dark:text-white">Dr. Yanga's Colleges, Inc.</p>
          <p className="text-xs text-slate-500">Bocaue, Bulacan{orgName ? ` · ${orgName}` : ''}</p>
        </div>
      </div>
      <div className="mb-4">
        <h2 className="font-display text-xl font-bold text-navy-900 dark:text-white">{title}</h2>
        {appliedFilters && <p className="mt-0.5 text-xs text-slate-500">Filters: {appliedFilters}</p>}
        <p className="text-[11px] text-slate-400">Generated on {format(new Date(), 'PPpp')} by {generatedBy}</p>
      </div>
      {children}
      <div className="mt-6 border-t border-slate-200 pt-2 text-[10px] text-slate-400 dark:border-white/10">
        DYCI Document Management System
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/components/reports/ReportLayout.tsx
git commit -m "feat(reports): printable letterhead layout"
```

---

### Task 5: Generic report table

**Files:**
- Create: `frontend/src/components/reports/ReportTable.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/reports/ReportTable.tsx`:

```tsx
import type { ColumnDef } from '@/lib/reports/types';

export function ReportTable<T>({ columns, rows }: { columns: ColumnDef<T>[]; rows: T[] }) {
  const hasTotals = columns.some((c) => c.total);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-white/10">
            {columns.map((c) => (
              <th key={c.key} className={`px-2 py-2 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-white/5">
              {columns.map((c) => (
                <td key={c.key} className={`px-2 py-1.5 align-top text-navy-900 dark:text-slate-200 ${c.align === 'right' ? 'text-right' : ''}`}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="py-8 text-center text-slate-400">No records found.</td></tr>
          )}
        </tbody>
        {hasTotals && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold text-navy-900 dark:border-white/20 dark:text-white">
              {columns.map((c) => (
                <td key={c.key} className={`px-2 py-2 ${c.align === 'right' ? 'text-right' : ''}`}>{c.total ? c.total(rows) : ''}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/components/reports/ReportTable.tsx
git commit -m "feat(reports): generic report table with totals"
```

---

### Task 6: Report shell (toolbar + filters + presets + print)

**Files:**
- Create: `frontend/src/components/reports/ReportShell.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/reports/ReportShell.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, Columns3, Printer, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { ReportLayout } from './ReportLayout';
import { ReportTable } from './ReportTable';
import { deletePreset, listPresets, savePreset } from '@/lib/reports/presets';
import type { ColumnDef } from '@/lib/reports/types';
import { useAuth } from '@/store/auth';

export function ReportShell<T>({
  reportKey,
  title,
  orgId,
  orgName,
  appliedFilters,
  filterPanel,
  columns,
  rows,
  loading,
  presetData,
  onLoadPreset,
}: {
  reportKey: string;
  title: string;
  orgId: string | null;
  orgName?: string;
  appliedFilters: string;
  filterPanel: ReactNode;
  columns: ColumnDef<T>[];
  rows: T[];
  loading: boolean;
  presetData: Record<string, unknown>;
  onLoadPreset: (data: Record<string, unknown>) => void;
}) {
  const fullName = useAuth((s) => s.profile?.full_name) ?? 'User';
  const [hidden, setHidden] = useState<Set<string>>(new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));
  const [colsOpen, setColsOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const presets = useQuery({ queryKey: ['presets', reportKey, orgId], queryFn: () => listPresets(reportKey, orgId) });
  const visible = columns.filter((c) => !hidden.has(c.key));

  const toggleCol = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const save = async () => {
    const name = window.prompt('Save this view as…');
    if (!name?.trim()) return;
    await savePreset(reportKey, name.trim(), { ...presetData, _hidden: [...hidden] }, orgId);
    presets.refetch();
    setPresetsOpen(false);
  };

  const load = (params: Record<string, unknown>) => {
    const h = (params as { _hidden?: unknown })._hidden;
    if (Array.isArray(h)) setHidden(new Set(h as string[]));
    onLoadPreset(params);
    setPresetsOpen(false);
  };

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowFilters((s) => !s)} className="btn-outline md:hidden"><SlidersHorizontal size={16} /> Filters</button>

        <div className="relative">
          <button onClick={() => setColsOpen((o) => !o)} className="btn-outline"><Columns3 size={16} /> Columns</button>
          {colsOpen && (
            <div className="absolute z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-navy dark:border-white/10 dark:bg-surface-dark-2">
              {columns.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleCol(c.key)} className="h-4 w-4 accent-navy-700" />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button onClick={() => setPresetsOpen((o) => !o)} className="btn-outline"><Bookmark size={16} /> Presets</button>
          {presetsOpen && (
            <div className="absolute z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-navy dark:border-white/10 dark:bg-surface-dark-2">
              <button onClick={save} className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-navy-700 hover:bg-navy-50 dark:text-gold-300 dark:hover:bg-white/5">+ Save current view</button>
              <div className="my-1 border-t border-slate-100 dark:border-white/10" />
              {(presets.data ?? []).length === 0 && <p className="px-2 py-2 text-xs text-slate-400">No saved presets.</p>}
              {(presets.data ?? []).map((p) => (
                <div key={p.id} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-50 dark:hover:bg-white/5">
                  <button onClick={() => load(p.params)} className="flex-1 truncate py-0.5 text-left text-sm text-navy-900 dark:text-slate-200">{p.name}</button>
                  <button onClick={async () => { await deletePreset(p.id); presets.refetch(); }} className="rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => window.print()} className="btn-primary ml-auto"><Printer size={16} /> Print / Save as PDF</button>
      </div>

      <div className={`no-print mb-5 ${showFilters ? '' : 'hidden md:block'}`}>{filterPanel}</div>

      {loading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : (
        <ReportLayout title={title} orgName={orgName} appliedFilters={appliedFilters} generatedBy={fullName}>
          <ReportTable columns={visible} rows={rows} />
        </ReportLayout>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/components/reports/ReportShell.tsx
git commit -m "feat(reports): report shell with columns, presets, print"
```

---

### Task 7: Staff query lib + report registry

**Files:**
- Create: `frontend/src/lib/reports/staff.ts`
- Create: `frontend/src/features/reports/registry.ts`

- [ ] **Step 1: Create the staff query lib**

Create `frontend/src/lib/reports/staff.ts`:

```ts
import { supabase } from '@/lib/supabase';
import type { FileItem } from '@/lib/types';

export interface MyDocFilters {
  from?: string;
  to?: string;
  status?: string;
  documentTypeId?: string;
}

export async function listMyDocuments(userId: string, f: MyDocFilters): Promise<FileItem[]> {
  let q = supabase
    .from('files')
    .select('*, document_type:document_types(name, publishable)')
    .eq('owner_id', userId)
    .neq('state', 'trashed')
    .order('created_at', { ascending: false });
  if (f.status) q = q.eq('status', f.status);
  if (f.documentTypeId) q = q.eq('document_type_id', f.documentTypeId);
  if (f.from) q = q.gte('created_at', f.from);
  if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`);
  const { data, error } = await q;
  if (error) throw error;
  return (data as FileItem[]) ?? [];
}
```

- [ ] **Step 2: Create the registry**

Create `frontend/src/features/reports/registry.ts`:

```ts
import type { OrgRole } from '@/lib/types';

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  to: string;
  roles: OrgRole[];
}

export const ORG_REPORTS: ReportDef[] = [
  {
    key: 'my-documents',
    title: 'My Documents',
    description: 'A printable register of the documents you own.',
    to: '/app/reports/my-documents',
    roles: ['admin', 'co_admin', 'staff', 'approver'],
  },
];

export interface AdminReportDef {
  key: string;
  title: string;
  description: string;
  to: string;
}

export const ADMIN_REPORTS: AdminReportDef[] = [];
```

- [ ] **Step 3: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/lib/reports/staff.ts frontend/src/features/reports/registry.ts
git commit -m "feat(reports): staff query lib + report registry"
```

---

### Task 8: My Documents report

**Files:**
- Create: `frontend/src/features/reports/staff/MyDocumentsReport.tsx`

- [ ] **Step 1: Create the report page**

Create `frontend/src/features/reports/staff/MyDocumentsReport.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileBarChart2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { listMyDocuments, type MyDocFilters } from '@/lib/reports/staff';
import { listDocumentTypes } from '@/lib/documentTypes';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { DocStatus, FileItem } from '@/lib/types';

const STATUSES: DocStatus[] = ['draft', 'pending', 'approved', 'released', 'rejected'];

const columns: ColumnDef<FileItem>[] = [
  { key: 'reference', label: 'Reference', render: (f) => f.reference_no ?? '—' },
  { key: 'title', label: 'Title', render: (f) => f.name },
  { key: 'type', label: 'Type', render: (f) => f.document_type?.name ?? '—' },
  { key: 'status', label: 'Status', render: (f) => <StatusBadge status={f.status} /> },
  { key: 'created', label: 'Created', render: (f) => format(new Date(f.created_at), 'PP') },
  { key: 'released', label: 'Released', render: (f) => (f.released_at ? format(new Date(f.released_at), 'PP') : '—') },
];

export function MyDocumentsReport() {
  const { currentOrgId, session } = useAuth();
  const userId = session!.user.id;
  const [filters, setFilters] = useState<MyDocFilters>({});

  const types = useQuery({ queryKey: ['docTypes', currentOrgId], queryFn: () => listDocumentTypes(currentOrgId!), enabled: !!currentOrgId });
  const rows = useQuery({ queryKey: ['rpt-mydocs', userId, filters], queryFn: () => listMyDocuments(userId, filters) });

  const applied =
    [
      filters.from && `from ${filters.from}`,
      filters.to && `to ${filters.to}`,
      filters.status && `status ${filters.status}`,
      filters.documentTypeId && `type ${types.data?.find((t) => t.id === filters.documentTypeId)?.name ?? ''}`,
    ]
      .filter(Boolean)
      .join(', ') || 'All';

  return (
    <div>
      <PageHeader title="My Documents" subtitle="A printable register of the documents you own." icon={<FileBarChart2 size={22} />} />
      <ReportShell<FileItem>
        reportKey="my-documents"
        title="My Documents Report"
        orgId={currentOrgId}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data ?? []}
        loading={rows.isLoading}
        presetData={filters as Record<string, unknown>}
        onLoadPreset={(p) =>
          setFilters({
            from: (p.from as string) || undefined,
            to: (p.to as string) || undefined,
            status: (p.status as string) || undefined,
            documentTypeId: (p.documentTypeId as string) || undefined,
          })
        }
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div>
              <label className="label">From</label>
              <input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Status</label>
              <select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input">
                <option value="">Any</option>
                {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select value={filters.documentTypeId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, documentTypeId: e.target.value }))} className="input">
                <option value="">All</option>
                {(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </div>
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
git add frontend/src/features/reports/staff/MyDocumentsReport.tsx
git commit -m "feat(reports): My Documents report"
```

---

### Task 9: Reports landing pages

**Files:**
- Create: `frontend/src/features/reports/ReportsPage.tsx`
- Create: `frontend/src/features/reports/AdminReportsPage.tsx`

- [ ] **Step 1: Org Reports landing**

Create `frontend/src/features/reports/ReportsPage.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { FileBarChart2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ORG_REPORTS } from './registry';
import { useAuth } from '@/store/auth';

export function ReportsPage() {
  const role = useAuth((s) => s.role());
  const available = ORG_REPORTS.filter((r) => role && r.roles.includes(role));

  return (
    <div>
      <PageHeader title="Reports" subtitle="Generate and print office reports." icon={<FileBarChart2 size={22} />} />
      {available.length === 0 ? (
        <EmptyState title="No reports available" description="There are no reports for your role yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((r) => (
            <Link key={r.key} to={r.to} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-card">
              <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-navy-700 text-gold-300"><FileBarChart2 size={22} /></div>
              <p className="font-display text-base font-bold text-navy-900 dark:text-white">{r.title}</p>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: System-admin Reports landing**

Create `frontend/src/features/reports/AdminReportsPage.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Database } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ADMIN_REPORTS } from './registry';

export function AdminReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Platform-wide reports." icon={<Database size={22} />} />
      {ADMIN_REPORTS.length === 0 ? (
        <EmptyState title="No reports yet" description="Platform reports will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_REPORTS.map((r) => (
            <Link key={r.key} to={r.to} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-card">
              <p className="font-display text-base font-bold text-navy-900 dark:text-white">{r.title}</p>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/features/reports/ReportsPage.tsx frontend/src/features/reports/AdminReportsPage.tsx
git commit -m "feat(reports): reports landing pages"
```

---

### Task 10: Routes + nav

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/components/layout/AdminShell.tsx`

- [ ] **Step 1: Add routes** (read `main.tsx` first)

In `frontend/src/main.tsx`, add imports near the other feature imports:

```ts
import { ReportsPage } from '@/features/reports/ReportsPage';
import { MyDocumentsReport } from '@/features/reports/staff/MyDocumentsReport';
import { AdminReportsPage } from '@/features/reports/AdminReportsPage';
```

In the `/app` children array, add after the `search` route:

```tsx
          { path: 'reports', element: <ReportsPage /> },
          { path: 'reports/my-documents', element: <MyDocumentsReport /> },
```

In the `/admin` children array (next to `activity`), add:

```tsx
          { path: 'reports', element: <AdminReportsPage /> },
```

- [ ] **Step 2: Add the org nav item** (read `AppShell.tsx` first)

In `frontend/src/components/layout/AppShell.tsx`, add `FileBarChart2` to the `lucide-react` import. Then add a Reports item to the **Workspace** section's `items` array (after Messages):

```tsx
        { to: '/app/reports', label: 'Reports', icon: FileBarChart2 },
```

- [ ] **Step 3: Add the admin nav item** (read `AdminShell.tsx` first)

In `frontend/src/components/layout/AdminShell.tsx`, add `FileBarChart2` to the `lucide-react` import, and add to the `sections[0].items` array (after Activity):

```tsx
      { to: '/admin/reports', label: 'Reports', icon: FileBarChart2 },
```

- [ ] **Step 4: Type-check + build + commit**

Run: `cd frontend && npx tsc --noEmit && npm run build`
```bash
git add frontend/src/main.tsx frontend/src/components/layout/AppShell.tsx frontend/src/components/layout/AdminShell.tsx
git commit -m "feat(reports): routes + nav items"
```

---

### Task 11: Backend `/reports` router scaffold

**Files:**
- Create: `backend/src/routes/reports.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create the router**

Create `backend/src/routes/reports.ts`:

```ts
import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const reportsRouter = Router();

// Scaffold — office and platform report endpoints are added in later plans.
reportsRouter.get('/_ping', requireAuth, (_req: AuthedRequest, res) => res.json({ ok: true }));
```

- [ ] **Step 2: Mount it** (read `index.ts` first)

In `backend/src/index.ts`, add the import next to the other route imports:

```ts
import { reportsRouter } from './routes/reports.js';
```

And mount it next to the other `app.use('/...')` mounts:

```ts
app.use('/reports', reportsRouter);
```

- [ ] **Step 3: Build + commit**

Run: `cd backend && npm run build` (expected: succeeds)
```bash
git add backend/src/routes/reports.ts backend/src/index.ts
git commit -m "feat(reports): backend /reports router scaffold"
```

---

### Task 12: Build verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build` → succeeds. `cd backend && npm run build` → succeeds.

- [ ] **Step 2: Manual check (after Task 1 SQL applied + deployed)**

- Sidebar → **Reports** → see the **My Documents** card → open it.
- The table lists your documents (reference, title, type, status, created, released).
- Apply **filters** (date range / status / type) → the table updates; the "Filters applied" line in the letterhead reflects them.
- **Columns** → hide a column → it disappears (and won't print).
- **Presets** → Save current view (name it) → reload it later; delete it.
- **Print / Save as PDF** → only the DYCI-letterhead report prints (no sidebar/topbar/toolbar); save as PDF works.
- On a **phone**, the Filters button toggles the filter panel; the table scrolls horizontally; printing still produces the letterhead.
- System Admin → Admin console → **Reports** → shows the "No reports yet" placeholder.

---

## Self-review against the spec

**Spec coverage (Plan 1 portion):**
- Role-gated Reports landing pages (`/app/reports`, `/admin/reports`) → Tasks 9, 10 ✅
- Printable DYCI letterhead + `window.print()` + print CSS → Tasks 2, 4, 6 ✅
- Filter panel + column-toggle framework → Task 6 ✅
- `report_presets` table + RLS + lib + save/load/delete UI → Tasks 1, 3, 6 ✅
- Backend `/reports` scaffold + auth (`requireAuth` reused; role helpers `roleInOrg`/`isSystemAdmin` already exist for later plans) → Task 11 ✅
- One end-to-end report (Staff My Documents, client-side, filters + columns + print) → Tasks 7, 8 ✅
- Responsive (filter toggle on mobile, horizontal table scroll, fixed print width) → Tasks 2, 6 ✅

**Placeholder scan:** none — all code concrete; Tasks 10/11 are targeted edits the implementer reads first.

**Type consistency:** `ColumnDef<T>` (types.ts) used by `ReportTable`, `ReportShell`, `MyDocumentsReport`. `ReportPreset` + `listPresets/savePreset/deletePreset` consistent across `presets.ts` and `ReportShell`. `MyDocFilters` shared by `staff.ts` and the report. `ReportDef.roles` uses `OrgRole`; `useAuth().role()` returns `OrgRole | null`.

**Deferred (correct):** remaining staff reports = Plan 2; office reports (backend) = Plan 3; platform reports (backend) = Plan 4.
```
