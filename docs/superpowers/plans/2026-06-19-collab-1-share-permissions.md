# Collaborative Editing — Plan 1: Share Permissions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend in-org file sharing so the owner can grant View or Edit access plus independent "allow download" and "allow re-sharing" toggles.

**Architecture:** Additive DB migration on the existing `shares` table; extend the `Share` type, the `shareFileWithMember` helper, and the `ShareDialog` UI. No RLS changes. This plan ships value on its own (richer sharing) even before the editor exists — "Edit" simply grants read access until Plan 3 wires the editor.

**Tech Stack:** Supabase Postgres (SQL migration), React + TypeScript, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-19-collaborative-editing-design.md` (Components 1 & 2).

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0011_share_edit_permissions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0011_share_edit_permissions.sql
-- Adds an 'edit' access level plus per-share download/reshare flags to shares.
-- Safe to re-run.

alter table public.shares
  add column if not exists can_download boolean not null default true,
  add column if not exists can_reshare  boolean not null default false;

-- Widen the permission CHECK to include 'edit'.
-- (The inline CHECK from schema.sql is auto-named shares_permission_check.)
alter table public.shares drop constraint if exists shares_permission_check;
alter table public.shares
  add constraint shares_permission_check check (permission in ('view','edit','download'));

-- Normalize any legacy 'download' rows to access level 'view' + can_download=true.
update public.shares
  set can_download = true, permission = 'view'
  where permission = 'download';
```

- [ ] **Step 2: Apply it**

Run the file's contents in the Supabase SQL editor (same workflow as migrations 0001–0010).
Expected: "Success. No rows returned." Verify with:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'shares' and column_name in ('can_download','can_reshare');
```
Expected: two rows (`can_download boolean`, `can_reshare boolean`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_share_edit_permissions.sql
git commit -m "feat(db): add edit access level + download/reshare flags to shares"
```

---

### Task 2: Extend the `Share` type

**Files:**
- Modify: `frontend/src/lib/types.ts:168-177`

- [ ] **Step 1: Update the interface**

Replace the `Share` interface body so it reads:

```ts
export interface Share {
  id: string;
  org_id: string;
  target_type: 'file' | 'folder';
  target_id: string;
  shared_by: string;
  shared_with_user_id: string | null;
  permission: 'view' | 'edit' | 'download';
  can_download: boolean;
  can_reshare: boolean;
  created_at: string;
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no errors from this change; callers updated in later tasks).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(types): add edit/download/reshare fields to Share"
```

---

### Task 3: Add `isEditableKind` + map PowerPoint

**Files:**
- Modify: `frontend/src/lib/utils.ts:39-57`

- [ ] **Step 1: Add ppt/pptx to KIND_BY_EXT and add the helper**

In `KIND_BY_EXT` (line 39) add two entries:

```ts
  ppt: 'pptx',
  pptx: 'pptx',
```

Below `kindFromFile` (after line 57) add:

```ts
/** File kinds that OnlyOffice can edit in-browser. */
export const EDITABLE_KINDS = ['docx', 'xlsx', 'pptx'] as const;

export function isEditableKind(kind: string): boolean {
  return (EDITABLE_KINDS as readonly string[]).includes(kind);
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/utils.ts
git commit -m "feat(utils): map pptx kind + add isEditableKind helper"
```

---

### Task 4: Extend `shareFileWithMember`

**Files:**
- Modify: `frontend/src/lib/org.ts:26-41`

- [ ] **Step 1: Replace the function with an options-based signature**

```ts
export interface ShareOptions {
  access: 'view' | 'edit';
  canDownload: boolean;
  canReshare: boolean;
}

export async function shareFileWithMember(
  orgId: string,
  fileId: string,
  targetUserId: string,
  opts: ShareOptions,
) {
  const { error } = await supabase.from('shares').insert({
    org_id: orgId,
    target_type: 'file',
    target_id: fileId,
    shared_by: (await supabase.auth.getUser()).data.user?.id,
    shared_with_user_id: targetUserId,
    permission: opts.access,
    can_download: opts.canDownload,
    can_reshare: opts.canReshare,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Type-check (expect a known break in ShareDialog)**

Run: `cd frontend && npx tsc --noEmit`
Expected: FAIL only at `Dialogs.tsx:110` (old call `shareFileWithMember(orgId, file.id, uid, 'download')`). Fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/org.ts
git commit -m "feat(share): options-based shareFileWithMember (access + flags)"
```

---

### Task 5: Share dialog UI

**Files:**
- Modify: `frontend/src/components/drive/Dialogs.tsx` (ShareDialog, lines 85-125 and the members-tab JSX)

- [ ] **Step 1: Add state for the new controls**

In `ShareDialog`, below the existing `const [selected, setSelected] = useState<Set<string>>(new Set());` (line 91) add:

```ts
  const [access, setAccess] = useState<'view' | 'edit'>('view');
  const [canDownload, setCanDownload] = useState(true);
  const [canReshare, setCanReshare] = useState(false);
  const editable = isEditableKind(file.kind);
```

Add the import at the top of the file:

```ts
import { isEditableKind } from '@/lib/utils';
```

- [ ] **Step 2: Pass the options when sharing**

Replace the loop body inside `shareWithSelected` (line 110):

```ts
      for (const uid of selected)
        await shareFileWithMember(orgId, file.id, uid, {
          access: editable ? access : 'view',
          canDownload,
          canReshare,
        });
```

- [ ] **Step 3: Render the controls in the members tab**

In the members-tab JSX (the block shown when `tab === 'members'`), directly above the Share button, insert:

```tsx
<div className="mt-4 space-y-3 border-t border-slate-100 pt-3 dark:border-white/10">
  <div>
    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Access level</p>
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setAccess('view')}
        className={access === 'view' ? 'btn-primary flex-1' : 'btn-outline flex-1'}
      >
        Can view
      </button>
      <button
        type="button"
        disabled={!editable}
        onClick={() => setAccess('edit')}
        title={editable ? '' : 'Editing is available for Word, Excel and PowerPoint files only'}
        className={`flex-1 ${access === 'edit' ? 'btn-primary' : 'btn-outline'} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        Can edit
      </button>
    </div>
    {!editable && (
      <p className="mt-1 text-[11px] text-slate-400">Editing is available for Word, Excel and PowerPoint files only.</p>
    )}
  </div>

  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={canDownload} onChange={(e) => setCanDownload(e.target.checked)} />
    Allow download
  </label>
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={canReshare} onChange={(e) => setCanReshare(e.target.checked)} />
    Allow re-sharing with other members
  </label>
</div>
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `cd frontend && npm run dev`. Open a file's detail page → Share → Members tab.
Expected:
- For a `.xlsx`/`.docx`/`.pptx` file: "Can edit" is clickable; for a `.pdf`/image it is disabled with the helper note.
- Toggles render; default download=on, reshare=off.
- Sharing a file inserts a `shares` row with the chosen `permission`, `can_download`, `can_reshare` (check in Supabase table editor).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/drive/Dialogs.tsx
git commit -m "feat(share): access level + download/reshare controls in ShareDialog"
```

---

### Task 6: Show access level on "Shared with me"

**Files:**
- Modify: `frontend/src/features/shared/SharedPage.tsx`
- Modify: `frontend/src/lib/drive.ts:72-82` (`listSharedWithMe`)

- [ ] **Step 1: Return the share access alongside the file**

Replace `listSharedWithMe` so each file carries its grant:

```ts
export async function listSharedWithMe(userId: string): Promise<(FileItem & { _share?: { permission: string; can_download: boolean } })[]> {
  const { data: shares } = await supabase
    .from('shares')
    .select('target_id, permission, can_download')
    .eq('target_type', 'file')
    .eq('shared_with_user_id', userId);
  const rows = shares ?? [];
  const ids = rows.map((s) => s.target_id);
  if (!ids.length) return [];
  const byId = new Map(rows.map((s) => [s.target_id, s]));
  const { data } = await supabase.from('files').select(`*, ${OWNER}, ${APPROVER}`).in('id', ids);
  return ((data as FileItem[]) ?? []).map((f) => ({
    ...f,
    _share: byId.get(f.id) ? { permission: byId.get(f.id)!.permission, can_download: byId.get(f.id)!.can_download } : undefined,
  }));
}
```

- [ ] **Step 2: Render a small access badge + gate download in SharedPage**

In `SharedPage.tsx`, change the `actions` builder so Download only appears when allowed:

```tsx
  const actions = (file: FileItem & { _share?: { permission: string; can_download: boolean } }): ActionItem[] => [
    { label: 'Details', icon: Info, onClick: () => navigate(`/app/file/${file.id}`) },
    ...(file._share?.can_download !== false
      ? [{ label: 'Download', icon: Download, onClick: async () => window.open(await signedUrlForVersion(file.id, file.current_version, true), '_blank') }]
      : []),
  ];
```

- [ ] **Step 3: Type-check + manual verify**

Run: `cd frontend && npx tsc --noEmit` → PASS.
Run dev; share a file with download OFF to a second account → that account sees no Download action on the Shared page.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/shared/SharedPage.tsx frontend/src/lib/drive.ts
git commit -m "feat(shared): surface access level and gate download by can_download"
```

---

### Task 7: Re-sharer gating (non-owners can grant view-only)

Per the spec, a non-owner may open the Share dialog only if their own share has
`can_reshare = true`, and may grant **view only** (never edit, never re-grant re-sharing).

**Files:**
- Modify: `frontend/src/lib/drive.ts` (add a tiny helper)
- Modify: `frontend/src/components/drive/Dialogs.tsx` (ShareDialog)
- Modify: `frontend/src/features/drive/FileDetailPage.tsx` (gate the Share button label/visibility)

- [ ] **Step 1: Helper to fetch the current user's share on a file**

Append to `frontend/src/lib/drive.ts`:

```ts
export async function myShareForFile(fileId: string, userId: string): Promise<{ permission: string; can_reshare: boolean } | null> {
  const { data } = await supabase
    .from('shares')
    .select('permission, can_reshare')
    .eq('target_type', 'file')
    .eq('target_id', fileId)
    .eq('shared_with_user_id', userId)
    .maybeSingle();
  return data ?? null;
}
```

- [ ] **Step 2: Restrict the dialog for non-owners**

In `ShareDialog` add (below the existing state):

```ts
  const isOwner = file.owner_id === userId;
  const { data: myShare } = useQuery({
    queryKey: ['myShare', file.id, userId],
    queryFn: () => myShareForFile(file.id, userId!),
    enabled: open && !isOwner && !!userId,
  });
  const canReshare = isOwner || myShare?.can_reshare === true;
  const canGrantEdit = isOwner; // re-sharers grant view only
```

Add the import:

```ts
import { myShareForFile } from '@/lib/drive';
```

Then:
- In the access control (Task 5 Step 3), replace the "Can edit" button's `disabled={!editable}` with `disabled={!editable || !canGrantEdit}` and force `access` to `'view'` when `!canGrantEdit`.
- In `shareWithSelected` (Task 5 Step 2), pass `canReshare: isOwner ? canReshare : false` so re-sharers cannot re-grant re-sharing.
- Wrap the whole members tab in `canReshare ? (...) : (<p className="text-sm text-slate-500">You don't have permission to share this file with others.</p>)`.

- [ ] **Step 3: Type-check + manual verify**

Run: `cd frontend && npx tsc --noEmit` → PASS.
Manual: as a member with a `can_reshare=true` view share, open Share → only "Can view" is selectable, the re-sharing toggle is hidden; sharing creates a `view` share with `can_reshare=false`. As a member without `can_reshare`, the members tab shows the "no permission" message.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/drive.ts frontend/src/components/drive/Dialogs.tsx frontend/src/features/drive/FileDetailPage.tsx
git commit -m "feat(share): re-sharers can grant view-only, gated by can_reshare"
```

---

## Self-Review Notes (for the implementer)
- `csv` maps to kind `xlsx` (pre-existing), so a `.csv` counts as editable and will open in the spreadsheet editor — acceptable.
- No RLS change: `files_select` already grants read to any user with a matching share row; "edit" grants read here and becomes functional in Plan 3.
- Download gating in this plan is UI-level (defense-in-depth). Storage signed URLs remain reachable by anyone with the file row; true download blocking is out of scope and noted as a non-goal.
