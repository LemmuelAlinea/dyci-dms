# Office Org Types — Plan 5: Org-Admin Document Types & Approvals Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Org Admin a self-service settings screen to manage their office's **categories**, **document types** (name, category, reference format, publish-to-feed flag, active), each type's **metadata fields** (the field-schema builder), and each type's **approval chain** (ordered positions).

**Architecture:** Pure frontend over Plan 1's `categories`, `document_types`, `document_type_steps` tables. RLS already restricts writes to the org admin (`*_write` policies). A new admin-only "Document Types" page lists types grouped by category; an editor modal edits everything for one type. Positions come from Plan 2 (reused).

**Tech Stack:** React + Vite + TypeScript + Tailwind, TanStack Query, Supabase JS, react-hot-toast.

**Spec:** `docs/superpowers/specs/2026-06-18-office-org-types-design.md` · **Depends on:** Plans 1–4 (merged). **No SQL required.**

**Testing note:** UI + Supabase calls. Verify with `cd frontend && npx tsc --noEmit` and `npm run build`, plus the manual smoke in Task 6.

---

## File structure (Plan 5)

- `frontend/src/lib/docTypeAdmin.ts` — **create**: category + document-type + chain CRUD.
- `frontend/src/components/org/DocTypeEditor.tsx` — **create**: editor modal (settings + fields builder + chain builder).
- `frontend/src/components/org/CategoriesDialog.tsx` — **create**: manage categories.
- `frontend/src/features/org/DocTypeSettingsPage.tsx` — **create**: the admin page.
- `frontend/src/main.tsx` — **modify**: add `/app/doc-types` route.
- `frontend/src/components/layout/AppShell.tsx` — **modify**: add admin-only "Document Types" nav item.

---

### Task 1: Data layer

**Files:**
- Create: `frontend/src/lib/docTypeAdmin.ts`

- [ ] **Step 1: Create the lib**

Create `frontend/src/lib/docTypeAdmin.ts`:

```ts
import { supabase } from './supabase';
import type { DocumentType, FieldDef } from './documentTypes';

export interface Category {
  id: string;
  org_id: string;
  name: string;
  sort: number;
}

export interface ChainStep {
  id: string;
  document_type_id: string;
  step_no: number;
  position_id: string;
  position?: { name: string } | null;
}

// ── Categories ───────────────────────────────────────────────────────────────
export async function listCategories(orgId: string): Promise<Category[]> {
  const { data } = await supabase.from('categories').select('*').eq('org_id', orgId).order('sort');
  return (data as Category[]) ?? [];
}
export async function createCategory(orgId: string, name: string, sort: number): Promise<void> {
  const { error } = await supabase.from('categories').insert({ org_id: orgId, name, sort });
  if (error) throw error;
}
export async function renameCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('categories').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// ── Document types ───────────────────────────────────────────────────────────
export async function listAllDocumentTypes(orgId: string): Promise<DocumentType[]> {
  const { data } = await supabase
    .from('document_types')
    .select('*, category:categories(name)')
    .eq('org_id', orgId)
    .order('sort');
  return (data as DocumentType[]) ?? [];
}

export interface DocTypeInput {
  name: string;
  category_id: string | null;
  reference_format: string;
  publishable: boolean;
  active: boolean;
  fields: FieldDef[];
}

export async function createDocumentType(orgId: string, input: DocTypeInput, sort: number): Promise<DocumentType> {
  const { data, error } = await supabase
    .from('document_types')
    .insert({ org_id: orgId, icon: 'doc', color: 'slate', sort, ...input })
    .select('*')
    .single();
  if (error) throw error;
  return data as DocumentType;
}

export async function updateDocumentType(id: string, patch: Partial<DocTypeInput>): Promise<void> {
  const { error } = await supabase.from('document_types').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteDocumentType(id: string): Promise<void> {
  const { error } = await supabase.from('document_types').delete().eq('id', id);
  if (error) throw error;
}

// ── Approval chain ───────────────────────────────────────────────────────────
export async function getChain(documentTypeId: string): Promise<ChainStep[]> {
  const { data } = await supabase
    .from('document_type_steps')
    .select('*, position:positions(name)')
    .eq('document_type_id', documentTypeId)
    .order('step_no');
  return (data as ChainStep[]) ?? [];
}

/** Replace the whole chain: delete existing steps, then insert positionIds in order. */
export async function setChain(orgId: string, documentTypeId: string, positionIds: string[]): Promise<void> {
  const { error: delErr } = await supabase.from('document_type_steps').delete().eq('document_type_id', documentTypeId);
  if (delErr) throw delErr;
  const clean = positionIds.filter(Boolean);
  if (!clean.length) return;
  const rows = clean.map((position_id, i) => ({ org_id: orgId, document_type_id: documentTypeId, step_no: i + 1, position_id }));
  const { error } = await supabase.from('document_type_steps').insert(rows);
  if (error) throw error;
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/docTypeAdmin.ts
git commit -m "feat(doctype-admin): categories, document types, and chain CRUD"
```

---

### Task 2: Categories dialog

**Files:**
- Create: `frontend/src/components/org/CategoriesDialog.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/org/CategoriesDialog.tsx`:

```tsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { createCategory, deleteCategory, listCategories, renameCategory } from '@/lib/docTypeAdmin';

export function CategoriesDialog({ open, onClose, orgId }: { open: boolean; onClose: () => void; orgId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const cats = useQuery({ queryKey: ['categories', orgId], queryFn: () => listCategories(orgId), enabled: open });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['categories', orgId] });
    qc.invalidateQueries({ queryKey: ['allDocTypes', orgId] });
  };

  const add = async () => {
    if (!name.trim()) return;
    try {
      await createCategory(orgId, name.trim(), cats.data?.length ?? 0);
      setName('');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage categories">
      <div className="mb-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} className="input" placeholder="New category (e.g. Memos & Reports)" />
        <button onClick={add} className="btn-primary shrink-0"><Plus size={16} /> Add</button>
      </div>
      {cats.isLoading ? (
        <div className="grid place-items-center py-6"><Spinner /></div>
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {(cats.data ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
              <input
                defaultValue={c.name}
                onBlur={async (e) => { if (e.target.value.trim() && e.target.value !== c.name) { await renameCategory(c.id, e.target.value.trim()); refresh(); } }}
                className="input !py-1.5 flex-1"
              />
              <button
                onClick={async () => { await deleteCategory(c.id); refresh(); }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                title="Delete category"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!cats.data?.length && <p className="py-4 text-center text-sm text-slate-400">No categories yet.</p>}
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/components/org/CategoriesDialog.tsx
git commit -m "feat(doctype-admin): manage categories dialog"
```

---

### Task 3: Document type editor (settings + fields + chain)

**Files:**
- Create: `frontend/src/components/org/DocTypeEditor.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/org/DocTypeEditor.tsx`:

```tsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { slug } from '@/lib/utils';
import { createDocumentType, deleteDocumentType, getChain, setChain, updateDocumentType, type Category } from '@/lib/docTypeAdmin';
import type { DocumentType, FieldDef, FieldType } from '@/lib/documentTypes';
import type { PositionWithHolders } from '@/lib/positions';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longtext', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'money', label: 'Money (₱)' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'yesno', label: 'Yes / No' },
];

export function DocTypeEditor({
  open,
  onClose,
  orgId,
  categories,
  positions,
  docType,
  typeCount,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  categories: Category[];
  positions: PositionWithHolders[];
  docType?: DocumentType;
  typeCount: number;
  onSaved: () => void;
}) {
  const editing = Boolean(docType);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [referenceFormat, setReferenceFormat] = useState('DOC-{YYYY}-{seq}');
  const [publishable, setPublishable] = useState(true);
  const [active, setActive] = useState(true);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(docType?.name ?? '');
    setCategoryId(docType?.category_id ?? categories[0]?.id ?? '');
    setReferenceFormat(docType?.reference_format ?? 'DOC-{YYYY}-{seq}');
    setPublishable(docType?.publishable ?? true);
    setActive(docType?.active ?? true);
    setFields(docType?.fields ? JSON.parse(JSON.stringify(docType.fields)) : []);
    if (docType) {
      getChain(docType.id).then((c) => setSteps(c.map((s) => s.position_id)));
    } else {
      setSteps([]);
    }
  }, [open, docType, categories]);

  const setField = (i: number, patch: Partial<FieldDef>) =>
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const n = [...s];
      const j = i + dir;
      if (j < 0 || j >= n.length) return n;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const save = async () => {
    if (!name.trim()) return toast.error('Name is required');
    if (!referenceFormat.includes('{seq}')) return toast.error('Reference format must include {seq}');
    // finalize field keys (generate stable keys for new fields)
    const used = new Set<string>();
    const finalFields: FieldDef[] = fields
      .filter((f) => f.label.trim())
      .map((f) => {
        let key = f.key || slug(f.label);
        if (!key) key = 'field';
        let k = key;
        let n = 1;
        while (used.has(k)) k = `${key}_${++n}`;
        used.add(k);
        return { key: k, label: f.label.trim(), type: f.type, required: f.required || undefined, options: f.type === 'dropdown' ? f.options ?? [] : undefined };
      });

    setBusy(true);
    try {
      const input = { name: name.trim(), category_id: categoryId || null, reference_format: referenceFormat.trim(), publishable, active, fields: finalFields };
      let id = docType?.id;
      if (editing) {
        await updateDocumentType(docType!.id, input);
      } else {
        const created = await createDocumentType(orgId, input, typeCount);
        id = created.id;
      }
      await setChain(orgId, id!, steps);
      toast.success(editing ? 'Document type updated' : 'Document type created');
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!docType) return;
    if (!confirm(`Delete "${docType.name}"? Existing files keep their data but lose this type.`)) return;
    setBusy(true);
    try {
      await deleteDocumentType(docType.id);
      toast.success('Document type deleted');
      onSaved();
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
      title={editing ? 'Edit document type' : 'New document type'}
      size="lg"
      footer={
        <>
          {editing && <button onClick={remove} className="btn-ghost mr-auto !text-rose-600">Delete</button>}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Save'}</button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Settings */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Grade Sheet" />
          </div>
          <div>
            <label className="label">Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
              <option value="">— none —</option>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Reference format</label>
            <input value={referenceFormat} onChange={(e) => setReferenceFormat(e.target.value)} className="input font-mono" placeholder="GRD-{YYYY}-{seq}" />
            <p className="mt-1 text-[11px] text-slate-400">Use <code>{'{YYYY}'}</code> and <code>{'{seq}'}</code>.</p>
          </div>
          <div className="flex flex-col justify-center gap-2 pt-5">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={publishable} onChange={(e) => setPublishable(e.target.checked)} className="h-4 w-4 accent-navy-700" />
              Can be released to the office feed
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-navy-700" />
              Active (shown when uploading)
            </label>
          </div>
        </div>

        {/* Fields builder */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Fields</p>
            <button onClick={() => setFields((f) => [...f, { key: '', label: '', type: 'text' }])} className="btn-outline !py-1 !text-xs"><Plus size={13} /> Add field</button>
          </div>
          <div className="space-y-2">
            {fields.length === 0 && <p className="text-xs text-slate-400">No fields. Add some so uploaders can capture key info.</p>}
            {fields.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-2.5 dark:border-white/10">
                <div className="flex flex-wrap items-center gap-2">
                  <input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} className="input !py-1.5 min-w-[140px] flex-1" placeholder="Field label" />
                  <select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })} className="input !py-1.5 !w-auto">
                    {FIELD_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={Boolean(f.required)} onChange={(e) => setField(i, { required: e.target.checked })} className="h-4 w-4 accent-navy-700" /> Required</label>
                  <button onClick={() => setFields((arr) => arr.filter((_, idx) => idx !== i))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 size={15} /></button>
                </div>
                {f.type === 'dropdown' && (
                  <input
                    value={(f.options ?? []).join(', ')}
                    onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                    className="input !py-1.5 mt-2"
                    placeholder="Options, comma-separated (e.g. 1st Semester, 2nd Semester, Summer)"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Chain builder */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Approval chain</p>
            <button onClick={() => setSteps((s) => [...s, positions[0]?.id ?? ''])} className="btn-outline !py-1 !text-xs"><Plus size={13} /> Add step</button>
          </div>
          {positions.length === 0 && <p className="text-xs text-amber-600 dark:text-amber-300">No positions defined. Add positions on the Positions page first.</p>}
          <div className="space-y-2">
            {steps.length === 0 && <p className="text-xs text-slate-400">No steps — documents of this type are approved in a single free-pick step.</p>}
            {steps.map((posId, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-navy-700 text-xs font-bold text-white">{i + 1}</span>
                <select value={posId} onChange={(e) => setSteps((s) => s.map((p, idx) => (idx === i ? e.target.value : p)))} className="input !py-1.5 flex-1">
                  <option value="">Select position…</option>
                  {positions.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
                <button onClick={() => moveStep(i, -1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><ArrowUp size={14} /></button>
                <button onClick={() => moveStep(i, 1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><ArrowDown size={14} /></button>
                <button onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/components/org/DocTypeEditor.tsx
git commit -m "feat(doctype-admin): document type editor with fields + chain builder"
```

---

### Task 4: Document Types settings page

**Files:**
- Create: `frontend/src/features/org/DocTypeSettingsPage.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/org/DocTypeSettingsPage.tsx`:

```tsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCog, FolderTree, Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DocTypeEditor } from '@/components/org/DocTypeEditor';
import { CategoriesDialog } from '@/components/org/CategoriesDialog';
import { listAllDocumentTypes, listCategories } from '@/lib/docTypeAdmin';
import { listPositions } from '@/lib/positions';
import { useAuth } from '@/store/auth';
import type { DocumentType } from '@/lib/documentTypes';

export function DocTypeSettingsPage() {
  const qc = useQueryClient();
  const { currentOrgId, role } = useAuth();
  const orgId = currentOrgId!;
  const isAdmin = role() === 'admin';

  const [editing, setEditing] = useState<DocumentType | null>(null);
  const [creating, setCreating] = useState(false);
  const [cats, setCats] = useState(false);

  const types = useQuery({ queryKey: ['allDocTypes', orgId], queryFn: () => listAllDocumentTypes(orgId), enabled: isAdmin });
  const categories = useQuery({ queryKey: ['categories', orgId], queryFn: () => listCategories(orgId), enabled: isAdmin });
  const positions = useQuery({ queryKey: ['positions', orgId], queryFn: () => listPositions(orgId), enabled: isAdmin });
  const refresh = () => qc.invalidateQueries({ queryKey: ['allDocTypes', orgId] });

  if (!isAdmin) return <EmptyState title="Admins only" description="Only the organization admin can manage document types." />;

  const grouped = new Map<string, DocumentType[]>();
  for (const t of types.data ?? []) {
    const cat = t.category?.name ?? 'Uncategorized';
    grouped.set(cat, [...(grouped.get(cat) ?? []), t]);
  }

  return (
    <div>
      <PageHeader
        title="Document Types & Approvals"
        subtitle="Define what documents this office handles, their fields, and how they're approved."
        icon={<FileCog size={22} />}
        actions={
          <>
            <button onClick={() => setCats(true)} className="btn-outline"><FolderTree size={16} /> Categories</button>
            <button onClick={() => setCreating(true)} className="btn-primary"><Plus size={17} /> New type</button>
          </>
        }
      />

      {types.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !types.data?.length ? (
        <EmptyState icon="/assets/icon-document.png" title="No document types yet" description="Add your first document type to get started." />
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([cat, list]) => (
            <div key={cat}>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{cat}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => (
                  <button key={t.id} onClick={() => setEditing(t)} className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-navy-900 dark:text-white">{t.name}</p>
                      {!t.active && <span className="chip bg-slate-100 text-slate-500 dark:bg-white/10">Inactive</span>}
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{t.reference_format}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {t.publishable ? <StatusBadge status="released" /> : <span className="chip bg-slate-100 text-slate-500 dark:bg-white/10">Confidential</span>}
                      <span className="chip bg-navy-50 text-navy-600 dark:bg-white/10 dark:text-slate-300">{t.fields.length} fields</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <DocTypeEditor
          open
          onClose={() => { setCreating(false); setEditing(null); }}
          orgId={orgId}
          categories={categories.data ?? []}
          positions={positions.data ?? []}
          docType={editing ?? undefined}
          typeCount={types.data?.length ?? 0}
          onSaved={refresh}
        />
      )}
      <CategoriesDialog open={cats} onClose={() => setCats(false)} orgId={orgId} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
```bash
git add frontend/src/features/org/DocTypeSettingsPage.tsx
git commit -m "feat(doctype-admin): document types settings page"
```

---

### Task 5: Route + nav

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add the route**

In `frontend/src/main.tsx`, add the import next to the other org-feature imports:

```ts
import { DocTypeSettingsPage } from '@/features/org/DocTypeSettingsPage';
```

Add this child route inside the `/app` children array, right after the `positions` route:

```tsx
          { path: 'doc-types', element: <DocTypeSettingsPage /> },
```

- [ ] **Step 2: Add the admin-only nav item**

In `frontend/src/components/layout/AppShell.tsx`, add `FileCog` to the existing `lucide-react` import. Then in the admin block, add the item after Positions:

```tsx
  if (currentRole === 'admin') {
    manageItems.push({ to: '/app/positions', label: 'Positions', icon: Briefcase });
    manageItems.push({ to: '/app/doc-types', label: 'Document Types', icon: FileCog });
    manageItems.push({ to: '/app/org', label: 'Organization', icon: Gauge });
  }
```

(Read the file first; replace the existing admin `if` block exactly, adding only the Document Types line + the import.)

- [ ] **Step 3: Type-check + build + commit**

Run: `cd frontend && npx tsc --noEmit && npm run build`
```bash
git add frontend/src/main.tsx frontend/src/components/layout/AppShell.tsx
git commit -m "feat(doctype-admin): route + admin nav item"
```

---

### Task 6: Build verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build`
Expected: succeeds, no TS errors.

- [ ] **Step 2: Manual check (on the running app, as an Org Admin)**

- Sidebar → Manage → **Document Types**. Existing types appear grouped by category with their reference format, publishable/confidential badge, and field count.
- Open a type → change its **publishable** flag, edit a **field** (add a dropdown with options), reorder its **approval chain** → Save. Re-open to confirm it persisted.
- **New type** → fill name, category, reference format, add fields + a chain → Save → it appears; uploading shows the new type with its fields; a request routes through its chain.
- **Categories** dialog → add/rename/delete a category.
- A non-admin does not see the nav item and `/app/doc-types` shows "Admins only."

---

## Self-review against the spec

**Spec coverage (Plan 5 portion):**
- Org Admin creates/renames/removes categories → Tasks 1, 2 ✅
- Org Admin creates/renames/removes document types; sets category, reference format, publishable, active → Tasks 1, 3, 4 ✅
- **Field-schema builder** (Phase 2): add/edit/remove/reorder fields incl. dropdown options + required → Task 3 ✅
- Edit approval chain (add/remove/reorder steps → positions) → Tasks 1, 3 ✅
- Admin-only; RLS already enforces writes server-side → Tasks 4, 5 ✅
- Stable field keys preserve existing file metadata; deleting a type sets files.document_type_id null (FK on delete set null) → Tasks 1, 3 ✅

**Placeholder scan:** none — all code concrete. Task 5 uses targeted edits the implementer reads first.

**Type consistency:** `Category`/`ChainStep`/`DocTypeInput` in `docTypeAdmin.ts`; `DocumentType`/`FieldDef`/`FieldType` reused from `documentTypes.ts`; `PositionWithHolders` reused from `positions.ts`. `setChain(orgId, docTypeId, positionIds)` and `createDocumentType(orgId, input, sort)` signatures match their callers in `DocTypeEditor`.

**Deferred (correct):** metadata search/filter = Plan 6.
```
