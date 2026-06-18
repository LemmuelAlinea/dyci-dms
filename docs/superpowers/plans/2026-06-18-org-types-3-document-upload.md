# Office Org Types — Plan 3: Document Types, Reference Numbers & Dynamic Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make uploading a document start by picking a **Document Type**, render that type's **fields** as a dynamic form, stamp an auto **reference number** (`VCHR-2026-0042`), and store `document_type_id` / `category_id` / `reference_no` / `metadata` on the file — shown on cards and the detail page.

**Architecture:** Document types come from Plan 1's `document_types` table (per-org, with `fields` JSONB). Reference numbers are allocated atomically by a new Postgres RPC (`allocate_reference`) over `reference_counters`. A new `UploadDocumentDialog` drives the whole flow; the existing drag-drop simply pre-fills its file. `uploadFile` gains an optional metadata argument so the old simple path still works.

**Tech Stack:** React + Vite + TypeScript + Tailwind, TanStack Query, Supabase JS (incl. `.rpc`), react-hot-toast.

**Spec:** `docs/superpowers/specs/2026-06-18-office-org-types-design.md` · **Depends on:** Plans 1–2 (merged).

**⚠️ Requires ONE SQL step from the user:** apply `supabase/migrations/0003_allocate_reference.sql` (Task 1) before the upload flow can allocate reference numbers.

---

## File structure (Plan 3)

- `supabase/migrations/0003_allocate_reference.sql` — **create**: atomic `allocate_reference` RPC.
- `frontend/src/lib/documentTypes.ts` — **create**: document-type types + queries + `allocateReference` RPC wrapper.
- `frontend/src/components/drive/DynamicFields.tsx` — **create**: renders a `FieldDef[]` form.
- `frontend/src/components/drive/UploadDocumentDialog.tsx` — **create**: pick type → fill fields → choose file → upload.
- `frontend/src/lib/types.ts` — **modify**: extend `FileItem` with the new columns.
- `frontend/src/lib/drive.ts` — **modify**: `uploadFile` accepts optional document context.
- `frontend/src/features/drive/DrivePage.tsx` — **modify**: route Upload button + drag-drop into the dialog.
- `frontend/src/components/drive/ItemViews.tsx` — **modify**: show the reference number on `FileCard`.
- `frontend/src/features/drive/FileDetailPage.tsx` — **modify**: show document type + reference + metadata.

---

### Task 1: Atomic reference-number RPC (SQL)

**Files:**
- Create: `supabase/migrations/0003_allocate_reference.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_allocate_reference.sql`:

```sql
-- Atomic reference-number allocation. Paste into Supabase SQL Editor and run.
-- Safe to re-run (CREATE OR REPLACE).

create or replace function public.allocate_reference(p_org uuid, p_document_type uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_format text;
  v_year int := extract(year from now())::int;
  v_seq int;
begin
  -- Caller must be an active member of the org.
  if not exists (
    select 1 from public.organization_members
    where org_id = p_org and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Not a member of this organization';
  end if;

  select reference_format into v_format from public.document_types where id = p_document_type and org_id = p_org;
  if v_format is null then v_format := 'DOC-{YYYY}-{seq}'; end if;

  insert into public.reference_counters (org_id, document_type_id, year, last_seq)
  values (p_org, p_document_type, v_year, 1)
  on conflict (org_id, document_type_id, year)
  do update set last_seq = public.reference_counters.last_seq + 1
  returning last_seq into v_seq;

  return replace(replace(v_format, '{YYYY}', v_year::text), '{seq}', lpad(v_seq::text, 4, '0'));
end $$;

grant execute on function public.allocate_reference(uuid, uuid) to authenticated;
```

- [ ] **Step 2: Apply in Supabase**

Open Supabase → SQL Editor → paste → Run. Expect "Success."

- [ ] **Step 3: Verify it works**

Run (replace the UUIDs with a real org + one of its document types — find them via `select id, org_id from document_types limit 1;`):

```sql
select id, org_id from public.document_types limit 1;
-- then, as a quick smoke test from the SQL editor (runs as the postgres role, so the membership check is skipped only if auth.uid() is null — instead verify the format string):
select reference_format from public.document_types limit 5;
```

Real verification happens from the app in Task 7. Just confirm the function was created: `select proname from pg_proc where proname='allocate_reference';` returns one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_allocate_reference.sql
git commit -m "feat(db): atomic reference-number allocation RPC"
```

---

### Task 2: Document-type lib + FileItem fields + uploadFile context

**Files:**
- Create: `frontend/src/lib/documentTypes.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/drive.ts`

- [ ] **Step 1: Create the document-type lib**

Create `frontend/src/lib/documentTypes.ts`:

```ts
import { supabase } from './supabase';

export type FieldType = 'text' | 'longtext' | 'number' | 'money' | 'date' | 'dropdown' | 'yesno';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
}

export interface DocumentType {
  id: string;
  org_id: string;
  category_id: string | null;
  name: string;
  icon: string;
  color: string;
  reference_format: string;
  publishable: boolean;
  fields: FieldDef[];
  active: boolean;
  sort: number;
  category?: { name: string } | null;
}

/** Active document types for an org, with their category name, in display order. */
export async function listDocumentTypes(orgId: string): Promise<DocumentType[]> {
  const { data, error } = await supabase
    .from('document_types')
    .select('*, category:categories(name)')
    .eq('org_id', orgId)
    .eq('active', true)
    .order('sort');
  if (error) throw error;
  return (data as DocumentType[]) ?? [];
}

export async function getDocumentType(id: string): Promise<DocumentType | null> {
  const { data } = await supabase.from('document_types').select('*, category:categories(name)').eq('id', id).maybeSingle();
  return (data as DocumentType) ?? null;
}

/** Atomically allocate the next reference number for a document type. */
export async function allocateReference(orgId: string, documentTypeId: string): Promise<string> {
  const { data, error } = await supabase.rpc('allocate_reference', { p_org: orgId, p_document_type: documentTypeId });
  if (error) throw error;
  return data as string;
}
```

- [ ] **Step 2: Extend FileItem**

In `frontend/src/lib/types.ts`, add these four fields to the `FileItem` interface (after `description`):

```ts
  document_type_id: string | null;
  category_id: string | null;
  reference_no: string | null;
  metadata: Record<string, unknown>;
```

- [ ] **Step 3: Add upload context to uploadFile**

In `frontend/src/lib/drive.ts`, find the existing `uploadFile` function. Add this interface just above it:

```ts
export interface UploadContext {
  documentTypeId?: string | null;
  categoryId?: string | null;
  referenceNo?: string | null;
  metadata?: Record<string, unknown>;
}
```

Change the signature and the `files` insert. Replace the function header line:

```ts
export async function uploadFile(
  orgId: string,
  ownerId: string,
  folderId: string | null,
  file: File,
): Promise<FileItem> {
```

with:

```ts
export async function uploadFile(
  orgId: string,
  ownerId: string,
  folderId: string | null,
  file: File,
  ctx?: UploadContext,
): Promise<FileItem> {
```

Then in the `.from('files').insert({ ... })` object inside that function, add these keys (after `status: 'draft',`):

```ts
      document_type_id: ctx?.documentTypeId ?? null,
      category_id: ctx?.categoryId ?? null,
      reference_no: ctx?.referenceNo ?? null,
      metadata: ctx?.metadata ?? {},
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/documentTypes.ts frontend/src/lib/types.ts frontend/src/lib/drive.ts
git commit -m "feat(documents): document-type lib, reference RPC, upload context"
```

---

### Task 3: DynamicFields component

**Files:**
- Create: `frontend/src/components/drive/DynamicFields.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/drive/DynamicFields.tsx`:

```tsx
import type { FieldDef } from '@/lib/documentTypes';

export function DynamicFields({
  fields,
  values,
  onChange,
}: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (!fields.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className={f.type === 'longtext' ? 'sm:col-span-2' : ''}>
          <label className="label">
            {f.label}
            {f.required && <span className="text-rose-500"> *</span>}
          </label>
          {f.type === 'longtext' ? (
            <textarea
              value={(values[f.key] as string) ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              rows={3}
              className="input resize-none"
            />
          ) : f.type === 'dropdown' ? (
            <select value={(values[f.key] as string) ?? ''} onChange={(e) => onChange(f.key, e.target.value)} className="input">
              <option value="">Select…</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : f.type === 'yesno' ? (
            <label className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={Boolean(values[f.key])} onChange={(e) => onChange(f.key, e.target.checked)} className="h-4 w-4 accent-navy-700" />
              Yes
            </label>
          ) : (
            <div className="relative">
              {f.type === 'money' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₱</span>}
              <input
                type={f.type === 'number' || f.type === 'money' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                value={(values[f.key] as string | number) ?? ''}
                onChange={(e) => onChange(f.key, f.type === 'number' || f.type === 'money' ? e.target.value : e.target.value)}
                className={`input ${f.type === 'money' ? 'pl-7' : ''}`}
              />
            </div>
          )}
        </div>
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
git add frontend/src/components/drive/DynamicFields.tsx
git commit -m "feat(documents): dynamic metadata field renderer"
```

---

### Task 4: UploadDocumentDialog

**Files:**
- Create: `frontend/src/components/drive/UploadDocumentDialog.tsx`

- [ ] **Step 1: Create the dialog**

Create `frontend/src/components/drive/UploadDocumentDialog.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UploadCloud } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { DynamicFields } from './DynamicFields';
import { allocateReference, listDocumentTypes, type DocumentType } from '@/lib/documentTypes';
import { uploadFile } from '@/lib/drive';

export function UploadDocumentDialog({
  open,
  onClose,
  orgId,
  ownerId,
  folderId,
  initialFile,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  ownerId: string;
  folderId: string | null;
  initialFile?: File | null;
  onUploaded: () => void;
}) {
  const [typeId, setTypeId] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const types = useQuery({ queryKey: ['docTypes', orgId], queryFn: () => listDocumentTypes(orgId), enabled: open });

  useEffect(() => {
    if (open) setFile(initialFile ?? null);
  }, [open, initialFile]);

  // Default to the first type when the list loads.
  useEffect(() => {
    if (open && !typeId && types.data?.length) setTypeId(types.data[0].id);
  }, [open, typeId, types.data]);

  const selected: DocumentType | undefined = useMemo(
    () => types.data?.find((t) => t.id === typeId),
    [types.data, typeId],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentType[]>();
    for (const t of types.data ?? []) {
      const cat = t.category?.name ?? 'Documents';
      map.set(cat, [...(map.get(cat) ?? []), t]);
    }
    return [...map.entries()];
  }, [types.data]);

  const reset = () => {
    setTypeId('');
    setValues({});
    setFile(null);
  };

  const submit = async () => {
    if (!selected) return toast.error('Choose a document type');
    if (!file) return toast.error('Choose a file');
    for (const f of selected.fields) {
      if (f.required && !values[f.key]) return toast.error(`${f.label} is required`);
    }
    setBusy(true);
    try {
      const referenceNo = await allocateReference(orgId, selected.id);
      await uploadFile(orgId, ownerId, folderId, file, {
        documentTypeId: selected.id,
        categoryId: selected.category_id,
        referenceNo,
        metadata: values,
      });
      toast.success(`Uploaded · ${referenceNo}`);
      reset();
      onUploaded();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Upload document"
      size="lg"
      footer={
        <>
          <button className="btn-ghost" onClick={() => { reset(); onClose(); }}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : 'Upload'}
          </button>
        </>
      }
    >
      {types.isLoading ? (
        <div className="grid place-items-center py-8"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Document type</label>
            <select value={typeId} onChange={(e) => { setTypeId(e.target.value); setValues({}); }} className="input">
              {grouped.map(([cat, list]) => (
                <optgroup key={cat} label={cat}>
                  {list.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {selected && <DynamicFields fields={selected.fields} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />}

          <div>
            <label className="label">File</label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 transition hover:border-navy-400 dark:border-white/10">
              <UploadCloud size={18} className="text-navy-500" />
              {file ? <span className="font-medium text-navy-900 dark:text-white">{file.name}</span> : 'Choose a PDF, Word, or Excel file…'}
              <input
                type="file"
                hidden
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {selected && <p className="mt-1.5 text-[11px] text-slate-400">A reference number will be generated from “{selected.reference_format}”.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/drive/UploadDocumentDialog.tsx
git commit -m "feat(documents): upload dialog with type picker + dynamic fields"
```

---

### Task 5: Route DrivePage uploads through the dialog

**Files:**
- Modify: `frontend/src/features/drive/DrivePage.tsx`

- [ ] **Step 1: Read DrivePage.tsx fully first**, then make these changes:

(a) Add the import near the other drive-dialog imports:

```ts
import { UploadDocumentDialog } from '@/components/drive/UploadDocumentDialog';
```

(b) Add state near the other `useState` calls:

```ts
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dropped, setDropped] = useState<File | null>(null);
```

(c) Replace the existing `onDrop` function body so a dropped file opens the dialog instead of uploading directly. Find the current `const onDrop = async (accepted: File[]) => { ... }` and replace the WHOLE function with:

```ts
  const onDrop = (accepted: File[]) => {
    if (!accepted.length) return;
    setDropped(accepted[0]);
    setUploadOpen(true);
  };
```

(d) The `useDropzone` call stays, but it no longer needs `open`/`uploading`. Change the **Upload button** in the header actions. Find the button that calls `open` (the one with the Upload icon) and replace its `onClick` so it opens the dialog with no pre-filled file:

```tsx
            <button onClick={() => { setDropped(null); setUploadOpen(true); }} className="btn-primary">
              <Upload size={17} /> Upload
            </button>
```

(Remove the `disabled={uploading}` and the `{uploading ? <Spinner .../> : <Upload .../>}` ternary — the dialog now owns the busy state.)

(e) In the empty-state `action`, change its upload button the same way:

```tsx
          action={<button onClick={() => { setDropped(null); setUploadOpen(true); }} className="btn-primary"><Upload size={17} /> Upload a file</button>}
```

(f) Add the dialog near the other dialogs at the bottom of the returned JSX (next to `NewFolderDialog`):

```tsx
      <UploadDocumentDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        orgId={orgId}
        ownerId={userId!}
        folderId={folderId}
        initialFile={dropped}
        onUploaded={() => { setUploadOpen(false); refresh(); }}
      />
```

(g) If `uploadFile` and the `uploading` state are now unused in DrivePage, remove them to keep it clean (the `uploadFile` import and `const [uploading, setUploading] = useState(false)` line). Leave the `useDropzone`/`getRootProps`/`getInputProps` and the drag overlay intact.

- [ ] **Step 2: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/drive/DrivePage.tsx
git commit -m "feat(documents): drive upload routes through document dialog"
```

---

### Task 6: Show reference + metadata on card and detail page

**Files:**
- Modify: `frontend/src/components/drive/ItemViews.tsx`
- Modify: `frontend/src/features/drive/FileDetailPage.tsx`

- [ ] **Step 1: FileCard reference chip**

In `frontend/src/components/drive/ItemViews.tsx`, inside the `FileCard` component, find the file name paragraph:

```tsx
        <p className="truncate text-sm font-semibold text-navy-900 dark:text-white" title={file.name}>
          {file.name}
        </p>
```

Immediately AFTER that `<p>`, add a reference line (only renders when present):

```tsx
        {file.reference_no && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-navy-500 dark:text-gold-300">{file.reference_no}</p>
        )}
```

- [ ] **Step 2: FileDetailPage — document type + reference + metadata**

In `frontend/src/features/drive/FileDetailPage.tsx`:

(a) Add imports:

```ts
import { getDocumentType } from '@/lib/documentTypes';
```

(b) After the existing `versions` query, add a query for the document type:

```ts
  const { data: docType } = useQuery({
    queryKey: ['docType', file?.document_type_id],
    queryFn: () => getDocumentType(file!.document_type_id!),
    enabled: !!file?.document_type_id,
  });
```

(c) In the **Details** card (the `<dl>` with `Detail` rows), add these rows at the TOP of the `<dl>` (right after the opening `<dl ...>` tag):

```tsx
              {file.reference_no && <Detail label="Reference"><span className="font-mono text-navy-700 dark:text-gold-200">{file.reference_no}</span></Detail>}
              {docType && <Detail label="Document type">{docType.name}</Detail>}
```

(d) Add a **Document details** card showing the metadata, right AFTER the Details card's closing `</div>` (i.e., as a sibling card in the sidebar column). Use this block:

```tsx
          {docType && docType.fields.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 font-display text-sm font-bold text-navy-900 dark:text-white">Document details</h3>
              <dl className="space-y-2 text-sm">
                {docType.fields.map((f) => {
                  const v = file.metadata?.[f.key];
                  if (v === undefined || v === '' || v === null) return null;
                  const display = f.type === 'money' ? `₱${Number(v).toLocaleString()}` : f.type === 'yesno' ? (v ? 'Yes' : 'No') : String(v);
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">{f.label}</dt>
                      <dd className="text-right font-medium text-navy-900 dark:text-white">{display}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
```

- [ ] **Step 3: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/drive/ItemViews.tsx frontend/src/features/drive/FileDetailPage.tsx
git commit -m "feat(documents): show reference number + metadata on card and detail"
```

---

### Task 7: Build verification + manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build`
Expected: succeeds, no TS errors.

- [ ] **Step 2: Manual smoke (on the running app, after Task 1's SQL is applied)**

As a member of a typed org (create a **College** org and add yourself, or use a General org):
- Click **Upload** → pick a document type → fill the fields → choose a file → Upload.
- Toast shows a reference like `GRD-2026-0001` (or `DOC-2026-0001` for General).
- The file card shows the reference under the name; the detail page shows Reference, Document type, and a "Document details" section with your field values.
- Upload a second of the same type → reference increments to `-0002`.

---

## Self-review against the spec

**Spec coverage (Plan 3 portion):**
- Upload picks a document type → dynamic form of its fields → Tasks 3, 4 ✅
- Reference number generated on submission (configurable format, atomic) → Tasks 1, 2, 4 ✅
- `files` store document_type_id/category_id/reference_no/metadata → Task 2 ✅
- Cards/detail show reference + key metadata → Task 6 ✅
- Backward compatible (General orgs work; old `uploadFile` callers unaffected by optional `ctx`) → Task 2 ✅

**Placeholder scan:** none — all code concrete. (Task 5 uses targeted edits with exact snippets against the existing DrivePage; the implementer reads the file first.)

**Type consistency:** `FieldDef`/`DocumentType` defined in `documentTypes.ts`, imported by `DynamicFields`, `UploadDocumentDialog`, and `FileDetailPage`. `allocateReference(orgId, documentTypeId)` matches its RPC params (`p_org`, `p_document_type`). `uploadFile(..., ctx?)` optional arg keeps existing calls valid. `FileItem.reference_no/metadata` added in Task 2 are used in Tasks 4/6.

**Deferred (correct):** routing the uploaded doc into its approval chain + the progress tracker = Plan 4; editing a type's fields/chain = Plan 5; filtering by metadata = Plan 6.
