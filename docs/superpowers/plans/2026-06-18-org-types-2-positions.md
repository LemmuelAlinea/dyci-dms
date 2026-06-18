# Office Org Types — Plan 2: Positions & Member Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Org Admin a screen to manage **positions** (already seeded by the template) and **assign members to them** — the data approval chains resolve against in Plan 4.

**Architecture:** Pure frontend on top of the `positions` and `member_positions` tables created in Plan 1. All reads/writes go directly through Supabase; RLS already restricts writes to the org admin (`is_org_admin(org_id)`) and reads to org members. A new admin-only **Positions** page is added to the org management nav.

**Tech Stack:** React + Vite + TypeScript + Tailwind, TanStack Query, Supabase JS, react-hot-toast.

**Spec:** `docs/superpowers/specs/2026-06-18-office-org-types-design.md` · **Depends on:** Plan 1 (merged).

**Testing note:** The frontend has no unit-test runner and this plan is UI + Supabase calls (no pure logic worth isolating), so verification is `npx tsc --noEmit` (hard gate) plus manual check on the running app. This matches how Plan 1's frontend task was verified.

---

## File structure (Plan 2)

- `frontend/src/lib/positions.ts` — **create**: position CRUD + member assignment (Supabase calls + the `Position`/`PositionWithHolders` types).
- `frontend/src/features/org/PositionsPage.tsx` — **create**: the admin Positions management page.
- `frontend/src/components/layout/AppShell.tsx` — **modify**: add the admin-only "Positions" nav item.
- `frontend/src/main.tsx` — **modify**: add the `/app/positions` route.

---

### Task 1: Positions data layer

**Files:**
- Create: `frontend/src/lib/positions.ts`

- [ ] **Step 1: Create the lib**

Create `frontend/src/lib/positions.ts`:

```ts
import { supabase } from './supabase';
import type { Profile } from './types';

export interface Position {
  id: string;
  org_id: string;
  name: string;
  sort: number;
}

export interface PositionWithHolders extends Position {
  holders: Profile[];
}

/** Positions in an org, each with the members who hold it. */
export async function listPositions(orgId: string): Promise<PositionWithHolders[]> {
  const [{ data: positions }, { data: holders }] = await Promise.all([
    supabase.from('positions').select('*').eq('org_id', orgId).order('sort'),
    supabase.from('member_positions').select('position_id, profiles(*)').eq('org_id', orgId),
  ]);
  const byPos = new Map<string, Profile[]>();
  (holders ?? []).forEach((h: { position_id: string; profiles: Profile | null }) => {
    const arr = byPos.get(h.position_id) ?? [];
    if (h.profiles) arr.push(h.profiles);
    byPos.set(h.position_id, arr);
  });
  return (positions ?? []).map((p) => ({ ...(p as Position), holders: byPos.get(p.id) ?? [] }));
}

export async function createPosition(orgId: string, name: string, sort: number): Promise<void> {
  const { error } = await supabase.from('positions').insert({ org_id: orgId, name, sort });
  if (error) throw error;
}

export async function renamePosition(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('positions').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deletePosition(id: string): Promise<void> {
  const { error } = await supabase.from('positions').delete().eq('id', id);
  if (error) throw error;
}

export async function assignMemberToPosition(orgId: string, positionId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('member_positions').insert({ org_id: orgId, position_id: positionId, user_id: userId });
  if (error) throw error;
}

export async function unassignMemberFromPosition(positionId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('member_positions').delete().eq('position_id', positionId).eq('user_id', userId);
  if (error) throw error;
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/positions.ts
git commit -m "feat(positions): data layer for positions and member assignment"
```

---

### Task 2: Positions management page

**Files:**
- Create: `frontend/src/features/org/PositionsPage.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/features/org/PositionsPage.tsx`:

```tsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Briefcase, Plus, UserPlus, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/drive/Dialogs';
import { listMembers } from '@/lib/org';
import {
  assignMemberToPosition,
  createPosition,
  deletePosition,
  listPositions,
  renamePosition,
  unassignMemberFromPosition,
  type PositionWithHolders,
} from '@/lib/positions';
import { useAuth } from '@/store/auth';

export function PositionsPage() {
  const qc = useQueryClient();
  const { currentOrgId, role } = useAuth();
  const orgId = currentOrgId!;
  const isAdmin = role() === 'admin';

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<PositionWithHolders | null>(null);
  const [renameTarget, setRenameTarget] = useState<PositionWithHolders | null>(null);

  const positions = useQuery({ queryKey: ['positions', orgId], queryFn: () => listPositions(orgId), enabled: isAdmin });
  const members = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId), enabled: isAdmin });
  const refresh = () => qc.invalidateQueries({ queryKey: ['positions', orgId] });

  if (!isAdmin) {
    return <EmptyState title="Admins only" description="Only the organization admin can manage positions." />;
  }

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await createPosition(orgId, newName.trim(), positions.data?.length ?? 0);
      setNewName('');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const assign = async (positionId: string, userId: string) => {
    try {
      await assignMemberToPosition(orgId, positionId, userId);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const unassign = async (positionId: string, userId: string) => {
    await unassignMemberFromPosition(positionId, userId);
    refresh();
  };

  return (
    <div>
      <PageHeader
        title="Positions"
        subtitle="Define the approval positions in this office and assign members to them."
        icon={<Briefcase size={22} />}
      />

      <div className="mb-6 flex max-w-md gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="input"
          placeholder="New position (e.g. Dean)"
        />
        <button onClick={add} disabled={busy} className="btn-primary shrink-0"><Plus size={17} /> Add</button>
      </div>

      {positions.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !positions.data?.length ? (
        <EmptyState icon="/assets/icon-person.png" title="No positions yet" description="Add positions like Dean, Program Chair, or Finance Head — approval steps route to these." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {positions.data.map((p) => {
            const holderIds = new Set(p.holders.map((h) => h.id));
            const available = (members.data ?? []).filter((m) => m.profiles && !holderIds.has(m.user_id));
            return (
              <div key={p.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-navy-900 dark:text-white">{p.name}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => setRenameTarget(p)} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">Rename</button>
                    <button onClick={() => setDel(p)} className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">Delete</button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {p.holders.length === 0 && <span className="text-xs text-slate-400">No members assigned</span>}
                  {p.holders.map((h) => (
                    <span key={h.id} className="chip bg-navy-50 text-navy-700 dark:bg-white/10 dark:text-slate-200">
                      <Avatar name={h.full_name} url={h.avatar_url} size={18} /> {h.full_name}
                      <button onClick={() => unassign(p.id, h.id)} className="ml-0.5"><X size={13} /></button>
                    </span>
                  ))}
                </div>

                {available.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <UserPlus size={15} className="text-slate-400" />
                    <select value="" onChange={(e) => e.target.value && assign(p.id, e.target.value)} className="input !py-1.5 !text-sm">
                      <option value="">Assign a member…</option>
                      {available.map((m) => (
                        <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {del && (
        <ConfirmDialog
          open
          onClose={() => setDel(null)}
          title={`Delete "${del.name}"?`}
          description="Members lose this position. Approval chains that used it will need a different position. This cannot be undone."
          danger
          confirmLabel="Delete position"
          onConfirm={async () => { await deletePosition(del.id); toast.success('Position deleted'); refresh(); }}
        />
      )}
      {renameTarget && <RenamePositionDialog position={renameTarget} onClose={() => setRenameTarget(null)} onDone={refresh} />}
    </div>
  );
}

function RenamePositionDialog({ position, onClose, onDone }: { position: PositionWithHolders; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(position.name);
  const submit = async () => {
    await renamePosition(position.id, name.trim());
    toast.success('Renamed');
    onDone();
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Rename position" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Save</button></>}>
      <label className="label">Name</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="input" />
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/org/PositionsPage.tsx
git commit -m "feat(positions): admin positions management page"
```

---

### Task 3: Route + nav item

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add the route**

In `frontend/src/main.tsx`, add the import (next to the other feature-page imports):

```ts
import { PositionsPage } from '@/features/org/PositionsPage';
```

And add this child route inside the `/app` children array, right after the `members` route:

```tsx
          { path: 'positions', element: <PositionsPage /> },
```

- [ ] **Step 2: Add the admin-only nav item**

In `frontend/src/components/layout/AppShell.tsx`:

Add `Briefcase` to the existing `lucide-react` import (append it to the list of imported icons).

Then, inside the block that builds `manageItems` for admins, add the Positions item. Find:

```tsx
  if (currentRole === 'admin') {
    manageItems.push({ to: '/app/org', label: 'Organization', icon: Gauge });
  }
```

Replace it with:

```tsx
  if (currentRole === 'admin') {
    manageItems.push({ to: '/app/positions', label: 'Positions', icon: Briefcase });
    manageItems.push({ to: '/app/org', label: 'Organization', icon: Gauge });
  }
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.tsx frontend/src/components/layout/AppShell.tsx
git commit -m "feat(positions): route + admin nav item"
```

---

### Task 4: Build verification

**Files:** none (verification only)

- [ ] **Step 1: Full frontend build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 2: Manual check (on the running app, by the user/reviewer)**

As an Org Admin (e.g. CCS admin), open **Positions** in the sidebar (under "Manage"). Confirm:
- Seeded positions appear (for a College org: Faculty, Program Chair, Dean).
- Adding a position works; renaming and deleting work.
- "Assign a member…" lists org members and assigning shows them as a chip; the × removes them.
- A non-admin (staff) account does **not** see the Positions nav item and visiting `/app/positions` shows "Admins only."

---

## Self-review against the spec

**Spec coverage (Plan 2 portion):**
- Org Admin defines positions → Tasks 1, 2 ✅
- Org Admin assigns members to positions (a member can hold several) → Tasks 1, 2 (member_positions, unique(position_id,user_id) allows multiple positions per member) ✅
- Admin-only access → Task 2 (`isAdmin` gate) + Task 3 (nav only for admin); RLS already enforces writes server-side ✅
- Positions feed approval routing later → data shape ready for Plan 4 ✅

**Placeholder scan:** none — all code is concrete.

**Type consistency:** `PositionWithHolders` defined in `positions.ts` and imported in `PositionsPage.tsx`. Function names (`listPositions`, `createPosition`, `renamePosition`, `deletePosition`, `assignMemberToPosition`, `unassignMemberFromPosition`) match between definition and usage. `listMembers` reused from `@/lib/org` (returns `OrgMembership` with `profiles`), accessed as `m.user_id` / `m.profiles`.

**Deferred (correct):** editing approval chains that use positions = Plan 5; routing approvals to position holders = Plan 4.
