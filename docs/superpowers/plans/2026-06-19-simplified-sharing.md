# Simplified Sharing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the share permission model with three tiers (View/Download/Edit), add client-side read-only viewing for Word/Excel, let Edit recipients upload a new version via a backend endpoint, and remove all OnlyOffice remnants.

**Architecture:** `permission` column alone encodes the tier. Read-only office viewing via `docx-preview` + SheetJS (client-side). Non-owner version upload via a service-role backend endpoint. No DB RLS changes.

**Tech Stack:** Supabase (SQL), React+TS+Tailwind, Express+TS (multer, Vitest).

**Spec:** `docs/superpowers/specs/2026-06-19-simplified-sharing-design.md`.

---

### Task 1: Cleanup + permission model

**Files:** create `supabase/migrations/0012_simplify_share_permissions.sql`; modify `supabase/schema.sql`, `frontend/src/lib/types.ts`, `frontend/src/lib/org.ts`; delete `docs/superpowers/plans/2026-06-19-collab-3-onlyoffice-editing.md`.

- [ ] **Step 1: Migration**
```sql
-- 0012_simplify_share_permissions.sql
-- Three-tier sharing: permission alone encodes view/download/edit.
-- Drops the now-redundant per-share boolean flags. Safe to re-run.
alter table public.shares drop column if exists can_download;
alter table public.shares drop column if exists can_reshare;
-- permission CHECK ('view','download','edit') already exists from 0011.
```
- [ ] **Step 2: schema.sql** — in the `shares` table, remove the `can_download` and `can_reshare` column lines (keep `permission text not null default 'view' check (permission in ('view','edit','download'))`).
- [ ] **Step 3: types.ts** — `Share` interface: remove `can_download` and `can_reshare`; keep `permission: 'view' | 'download' | 'edit'`. Replace `ShareOptions` usage: delete the `ShareOptions` interface (sharing now passes a single `permission`). Change `SharedFileItem` to `FileItem & { _share?: { permission: string } }`.
- [ ] **Step 4: org.ts** — change `shareFileWithMember` to:
```ts
export async function shareFileWithMember(
  orgId: string,
  fileId: string,
  targetUserId: string,
  permission: 'view' | 'download' | 'edit',
) {
  const { error } = await supabase.from('shares').insert({
    org_id: orgId,
    target_type: 'file',
    target_id: fileId,
    shared_by: (await supabase.auth.getUser()).data.user?.id,
    shared_with_user_id: targetUserId,
    permission,
  });
  if (error) throw error;
}
```
Remove the `ShareOptions` import if present.
- [ ] **Step 5:** `git rm docs/superpowers/plans/2026-06-19-collab-3-onlyoffice-editing.md`.
- [ ] **Step 6:** `cd frontend && npx tsc --noEmit` — expect errors only in `Dialogs.tsx`/`SharedPage.tsx`/`FileDetailPage.tsx`/`drive.ts` (fixed in later tasks). Apply migration 0012 in Supabase. Commit: `feat(share): 3-tier permission model + migration 0012; drop reshare/download flags`.

---

### Task 2: Simplified share dialog

**Files:** `frontend/src/components/drive/Dialogs.tsx`.

- [ ] **Step 1:** In `ShareDialog`, remove: `access`/`canDownload`/`grantReshare` state, `editable`, the `myShare` query, `mayReshareFile`, `canGrantEdit`, and the `isEditableKind` import if now unused. Add a single state: `const [tier, setTier] = useState<'view' | 'download' | 'edit'>('view');`
- [ ] **Step 2:** Replace the members-tab access controls block with a 3-option selector:
```tsx
<div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-white/10">
  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recipient access</p>
  {([
    ['view', 'View only', 'Can open and read it in the browser. No download.'],
    ['download', 'Download', 'Can view and download. Cannot upload a new version.'],
    ['edit', 'Edit', 'Can download and upload a new version (saved to your document).'],
  ] as const).map(([val, label, desc]) => (
    <label key={val} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 dark:border-white/10">
      <input type="radio" name="tier" className="mt-1 accent-navy-700" checked={tier === val} onChange={() => setTier(val)} />
      <span><span className="block text-sm font-medium text-navy-900 dark:text-white">{label}</span><span className="block text-[11px] text-slate-400">{desc}</span></span>
    </label>
  ))}
</div>
```
- [ ] **Step 3:** In `shareWithSelected`, change the share loop to `await shareFileWithMember(orgId, file.id, uid, tier);` and reset `setTier('view')` alongside `setSelected(new Set())`. Remove any `mayReshareFile` wrapping (the members tab always renders for the owner-driven dialog; the dialog is opened from the owner's file).
- [ ] **Step 4:** `cd frontend && npx tsc --noEmit` (Dialogs.tsx clean). Manual: open Share → three radio tiers render, default View only. Commit: `feat(share): simplified 3-tier share dialog`.

---

### Task 3: Read-only Word/Excel viewing

**Files:** `frontend/src/lib/utils.ts`, `frontend/src/components/drive/FilePreview.tsx`; add deps `docx-preview`, `xlsx`.

- [ ] **Step 1:** `cd frontend && npm install docx-preview xlsx`.
- [ ] **Step 2: utils.ts** — extend `previewCategory` return type to `'pdf' | 'image' | 'word' | 'excel' | 'text' | 'none'`. Logic: pdf→`pdf`; images→`image`; `docx`/`doc`→`word`; `xlsx`/`xls`→`excel`; text/csv/md/json/log→`text`; else `none`. (Keep `.csv` in the text set so it uses the CSV table renderer.)
- [ ] **Step 3: FilePreview.tsx** — add two render branches before the fallback:
  - **Word** (`category === 'word'`): fetch the signed URL as ArrayBuffer; use `renderAsync` from `docx-preview` to render into a ref'd `<div>`:
```tsx
// inside the component
const wordRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (category !== 'word') return;
  let active = true;
  signedUrlForVersion(file.id, file.current_version)
    .then((u) => fetch(u))
    .then((r) => r.arrayBuffer())
    .then(async (buf) => { if (active && wordRef.current) { const { renderAsync } = await import('docx-preview'); wordRef.current.innerHTML = ''; await renderAsync(buf, wordRef.current); } })
    .catch((e) => toast.error((e as Error).message));
  return () => { active = false; };
}, [file.id, file.current_version, category]);
// render: if (category === 'word') return <div ref={wordRef} className="max-h-[560px] overflow-auto bg-white p-4" />;
```
  - **Excel** (`category === 'excel'`): fetch ArrayBuffer; `import('xlsx')`, `read(buf)`, render the first sheet via `utils.sheet_to_html` into a ref'd div (with a sheet-name selector if `workbook.SheetNames.length > 1`).
  - **PowerPoint/unknown** (`category === 'none'`): existing fallback card.
- [ ] **Step 4:** `cd frontend && npx tsc --noEmit` && `npm run build`. Manual: docx renders, xlsx renders a table, pptx shows fallback. Commit: `feat(preview): client-side Word + Excel read-only rendering`.

---

### Task 4: Edit-tier upload-new-version (backend + wiring)

**Files:** create `backend/src/routes/files.ts`; modify `backend/src/index.ts`; add deps `multer`, `@types/multer`; `frontend/src/lib/drive.ts`, `frontend/src/lib/api.ts`, `frontend/src/features/drive/FileDetailPage.tsx`, `frontend/src/features/shared/SharedPage.tsx`. Test: `backend/src/routes/files.test.ts` (pure permission helper).

- [ ] **Step 1:** `cd backend && npm install multer && npm install -D @types/multer`.
- [ ] **Step 2 (TDD): pure permission helper** — in `backend/src/routes/files.ts` export a pure `canUploadVersion({ isOwner, sharePermission, status })` returning boolean: true iff (isOwner || sharePermission === 'edit') && (status === 'draft' || status === 'rejected'). Write `backend/src/routes/files.test.ts` covering owner-draft✓, edit-share-draft✓, download-share✗, view-share✗, stranger✗, owner-approved✗. Run vitest → fail → implement → pass.
- [ ] **Step 3: route** — `filesRouter.post('/:fileId/version', requireAuth, upload.single('file'), ...)` using `multer({ storage: memoryStorage(), limits: { fileSize: 50*1024*1024 } })`:
  load file; look up caller membership + share; compute `canUploadVersion`; 403 if not allowed; 409 if status not draft/rejected; write new version via `supabaseAdmin` (upload `{org}/{owner}/{fileId}/v{next}.{ext}` from `req.file.buffer`, insert `file_versions` with `uploaded_by`=caller and `note`=`Uploaded by <name>`, bump `files`); insert a `notifications` row for the owner and an `activity_log` row; return `{ version: next }`. Ext from original filename or file.kind.
- [ ] **Step 4: mount** — in `backend/src/index.ts` import `filesRouter` and `app.use('/files', filesRouter);`.
- [ ] **Step 5:** `cd backend && npx tsc --noEmit && npm test` (new tests pass). Commit: `feat(files): backend endpoint for edit-recipient version upload (tested)`.
- [ ] **Step 6: frontend api + drive** — in `frontend/src/lib/api.ts` add `uploadVersion(fileId, file)` that POSTs multipart (FormData) to `/files/:fileId/version` with the auth header (do NOT set content-type; let the browser set the multipart boundary). In `frontend/src/lib/drive.ts` change `myShareForFile` to select/return `{ permission }` only.
- [ ] **Step 7: FileDetailPage** — fetch the viewer's share permission (owner short-circuits). Show **Download** when owner or permission∈(download,edit). Show **Upload new version** when owner (existing client-side `uploadNewVersion`) or permission==='edit' (calls `api.uploadVersion`), enabled only when status draft/rejected. Pass `canDownload` to `<FilePreview>`. On success, `refresh()`.
- [ ] **Step 8: SharedPage** — Download action only when `_share?.permission !== 'view'`.
- [ ] **Step 9:** `cd frontend && npx tsc --noEmit && npm run build`. Manual end-to-end per spec testing. Commit: `feat(share): edit recipients can upload a new version; tier-based download gating`.

---

## Self-Review
- `permission` is the single source of tier truth; `can_download`/`can_reshare` fully removed.
- Owner upload path unchanged (client-side); only non-owner edit uses the backend endpoint.
- Download gating is UI-level (documented caveat); preview fetches bytes to render.
- pptx intentionally has no renderer (download card).
