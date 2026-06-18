# Office Org Types — Plan 6: Search & Filter by Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the global search into a real document finder: search by name/reference and filter by **document type, category, status,** and a selected type's **metadata fields** (e.g. payee, term, leave type).

**Architecture:** A new `searchFiles` query builds a filtered Supabase query over `files` (joined to `document_types`), including JSONB metadata filters (`metadata->>key ilike`). RLS already limits results to what the user may see (own files, released papers, admin, shared, approval participant). The Search page gains a filter bar; when a document type is chosen, its fields render as filter inputs.

**Tech Stack:** React + Vite + TypeScript + Tailwind, TanStack Query, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-06-18-office-org-types-design.md` · **Depends on:** Plans 1–5 (merged). **No SQL required.**

**Testing note:** UI + Supabase queries. Verify with `cd frontend && npx tsc --noEmit` and `npm run build`, plus the manual smoke in Task 3.

---

## File structure (Plan 6)

- `frontend/src/lib/types.ts` — **modify**: add `name` to the `FileItem.document_type` shape.
- `frontend/src/lib/search.ts` — **create**: `SearchFilters` + `searchFiles`.
- `frontend/src/features/search/SearchPage.tsx` — **rewrite**: filter bar + metadata filters + results.

---

### Task 1: Search data layer

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/search.ts`

- [ ] **Step 1: Add the document type name to FileItem**

In `frontend/src/lib/types.ts`, change the `document_type` line of `FileItem` from:

```ts
  document_type?: { publishable: boolean } | null;
```

to:

```ts
  document_type?: { name?: string; publishable: boolean } | null;
```

- [ ] **Step 2: Create the search lib**

Create `frontend/src/lib/search.ts`:

```ts
import { supabase } from './supabase';
import type { DocStatus, FileItem } from './types';

const OWNER = 'owner:profiles!files_owner_id_fkey(*)';

export interface SearchFilters {
  term?: string;
  documentTypeId?: string;
  categoryId?: string;
  status?: DocStatus | '';
  metadata?: Record<string, string>;
}

function sanitize(term: string): string {
  // strip characters that break PostgREST's or() filter grammar
  return term.replace(/[(),]/g, ' ').trim();
}

/** Filtered file search. RLS limits results to what the caller may see. */
export async function searchFiles(orgId: string, f: SearchFilters): Promise<FileItem[]> {
  let q = supabase
    .from('files')
    .select(`*, ${OWNER}, document_type:document_types(name, publishable)`)
    .eq('org_id', orgId)
    .neq('state', 'trashed');

  if (f.documentTypeId) q = q.eq('document_type_id', f.documentTypeId);
  if (f.categoryId) q = q.eq('category_id', f.categoryId);
  if (f.status) q = q.eq('status', f.status);

  const term = f.term ? sanitize(f.term) : '';
  if (term) q = q.or(`name.ilike.%${term}%,reference_no.ilike.%${term}%`);

  for (const [key, value] of Object.entries(f.metadata ?? {})) {
    if (value?.trim()) q = q.ilike(`metadata->>${key}`, `%${value.trim()}%`);
  }

  const { data, error } = await q.order('updated_at', { ascending: false }).limit(80);
  if (error) throw error;
  return (data as FileItem[]) ?? [];
}

export function hasAnyFilter(f: SearchFilters): boolean {
  return Boolean(
    f.term?.trim() ||
      f.documentTypeId ||
      f.categoryId ||
      f.status ||
      Object.values(f.metadata ?? {}).some((v) => v?.trim()),
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/lib/types.ts frontend/src/lib/search.ts
git commit -m "feat(search): filtered file search with metadata"
```

---

### Task 2: Rewrite the Search page

**Files:**
- Modify (replace whole file): `frontend/src/features/search/SearchPage.tsx`

- [ ] **Step 1: Replace the file contents**

Replace ALL of `frontend/src/features/search/SearchPage.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { hasAnyFilter, searchFiles, type SearchFilters } from '@/lib/search';
import { listDocumentTypes } from '@/lib/documentTypes';
import { listCategories } from '@/lib/docTypeAdmin';
import { useAuth } from '@/store/auth';
import type { DocStatus } from '@/lib/types';

const STATUSES: DocStatus[] = ['draft', 'pending', 'approved', 'released', 'rejected'];

export function SearchPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orgId = useAuth((s) => s.currentOrgId)!;

  const [term, setTerm] = useState(params.get('q') ?? '');
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<DocStatus | ''>('');
  const [metadata, setMetadata] = useState<Record<string, string>>({});

  useEffect(() => {
    setTerm(params.get('q') ?? '');
  }, [params]);

  const docTypes = useQuery({ queryKey: ['docTypes', orgId], queryFn: () => listDocumentTypes(orgId) });
  const categories = useQuery({ queryKey: ['categories', orgId], queryFn: () => listCategories(orgId) });

  const selectedType = useMemo(
    () => docTypes.data?.find((t) => t.id === documentTypeId),
    [docTypes.data, documentTypeId],
  );

  const filters: SearchFilters = { term, documentTypeId, categoryId, status, metadata };
  const results = useQuery({
    queryKey: ['search', orgId, term, documentTypeId, categoryId, status, metadata],
    queryFn: () => searchFiles(orgId, filters),
    enabled: hasAnyFilter(filters),
  });

  const onTypeChange = (id: string) => {
    setDocumentTypeId(id);
    setMetadata({});
  };

  return (
    <div>
      <PageHeader title="Search" subtitle="Find documents by name, reference, type, status, or their details." icon={<Search size={22} />} />

      <div className="card mb-6 space-y-3 p-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} className="input pl-9" placeholder="Search by file name or reference number…" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal size={15} className="text-slate-400" />
          <select value={documentTypeId} onChange={(e) => onTypeChange(e.target.value)} className="input !w-auto !py-2 text-sm">
            <option value="">All document types</option>
            {(docTypes.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input !w-auto !py-2 text-sm">
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as DocStatus | '')} className="input !w-auto !py-2 text-sm">
            <option value="">Any status</option>
            {STATUSES.map((s) => (<option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>))}
          </select>
        </div>

        {selectedType && selectedType.fields.length > 0 && (
          <div className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-3 dark:border-white/10">
            {selectedType.fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-[11px] font-medium text-slate-400">{f.label}</label>
                {f.type === 'dropdown' ? (
                  <select
                    value={metadata[f.key] ?? ''}
                    onChange={(e) => setMetadata((m) => ({ ...m, [f.key]: e.target.value }))}
                    className="input !py-1.5 text-sm"
                  >
                    <option value="">Any</option>
                    {(f.options ?? []).map((o) => (<option key={o} value={o}>{o}</option>))}
                  </select>
                ) : (
                  <input
                    value={metadata[f.key] ?? ''}
                    onChange={(e) => setMetadata((m) => ({ ...m, [f.key]: e.target.value }))}
                    className="input !py-1.5 text-sm"
                    placeholder={`Filter by ${f.label.toLowerCase()}`}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!hasAnyFilter(filters) ? (
        <EmptyState title="Search your office" description="Type a name or reference, or pick a document type to filter by its fields." />
      ) : results.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !results.data?.length ? (
        <EmptyState icon="/assets/icon-document.png" title="No matches" description="Try a different search or fewer filters." />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">{results.data.length} result{results.data.length === 1 ? '' : 's'}</p>
          {results.data.map((f) => (
            <div
              key={f.id}
              onClick={() => navigate(`/app/file/${f.id}`)}
              className="card flex cursor-pointer items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-card"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-50 dark:bg-white/5">
                <FileKindIcon kind={f.kind} size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">
                  {f.name}
                  {f.reference_no && <span className="ml-2 font-mono text-[10px] text-navy-500 dark:text-gold-300">{f.reference_no}</span>}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  {f.document_type?.name && <span>{f.document_type.name} ·</span>}
                  {f.owner && <Avatar name={f.owner.full_name} url={f.owner.avatar_url} size={16} />}
                  {f.owner?.full_name}
                </p>
              </div>
              <StatusBadge status={f.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build + commit**

Run: `cd frontend && npx tsc --noEmit && npm run build`
```bash
git add frontend/src/features/search/SearchPage.tsx
git commit -m "feat(search): filter bar + metadata filters + results"
```

---

### Task 3: Build verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build`
Expected: succeeds, no TS errors.

- [ ] **Step 2: Manual check (on the running app)**

- Top-bar search → lands on the Search page with the term pre-filled; results show matching files (by name or reference) the user can access.
- Pick a **Document Type** → its fields appear as filters. Filter, e.g., a College *Grade Sheet* by **Term = 1st Semester**, or a Finance *Voucher* by **Payee** → results narrow.
- **Status** and **Category** filters narrow results.
- A staff user only sees their own files + released papers; an admin sees the whole office (RLS-enforced).

---

## Self-review against the spec

**Spec coverage (Plan 6 portion):**
- Global search across files by name + reference → Tasks 1, 2 ✅
- Filter by document type, category, status → Tasks 1, 2 ✅
- Filter by a type's metadata fields (incl. dropdown options) → Tasks 1, 2 ✅
- Results respect per-user visibility → RLS on `files_select` (no change needed) ✅

**Placeholder scan:** none — all code concrete.

**Type consistency:** `SearchFilters`/`searchFiles`/`hasAnyFilter` defined in `search.ts` and used in `SearchPage`; `FileItem.document_type` extended with optional `name`; `listDocumentTypes` (active types, with `fields`) and `listCategories` reused.

**Deferred (acceptable):** numeric range filters (e.g. "amount over ₱50k") — current metadata filter is contains-match; numeric ranges over JSONB would need a casted column or RPC and can be a later enhancement. This completes the Phase-1 org-types upgrade.
```
