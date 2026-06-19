# Collaborative Editing — Plan 3: OnlyOffice Editing + Save-as-Version

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members edit Word/Excel/PowerPoint files in-browser via a self-hosted OnlyOffice Docs server; when an editing session ends, the result is saved as a new version of the document. Office files also gain inline preview.

**Architecture:** A new backend router `/onlyoffice` with two endpoints — `config` (permission gate; returns a JWT-signed editor config) and `callback` (server-to-server save → writes a new version with the service-role key). A frontend `OnlyOfficeEditor` component embeds the editor. The browser never writes storage; the backend does. Owner-only storage RLS is unchanged.

**Tech Stack:** Express + TypeScript, `jsonwebtoken`, Supabase service role, OnlyOffice Docs Community (Docker), React.

**Spec:** `docs/superpowers/specs/2026-06-19-collaborative-editing-design.md` (Components 3 & 4).

**Depends on:** Plan 1 (`shares.permission='edit'`), Plan 2 (`FilePreview` — its `'office'` branch is replaced here).

---

### Task 0: Stand up OnlyOffice + setup doc (human infra)

**Files:**
- Create: `docs/SETUP_ONLYOFFICE.md`

- [ ] **Step 1: Write the setup guide**

```markdown
# OnlyOffice Docs — Setup

DYCI DMS edits Word/Excel/PowerPoint files using a self-hosted **OnlyOffice Docs
Community** server (free). It runs as a Docker container, separate from the
frontend (Vercel) and backend (Railway).

## 1. Provision a host
- Recommended: an Oracle Cloud **Always-Free** ARM VM (Ubuntu 22.04, 4 GB+ RAM).
- Open inbound ports 80 and 443.

## 2. Pick a JWT secret
Generate one and keep it — you'll use the SAME value on the container and the backend:
    openssl rand -hex 32

## 3. Run the container
    docker run -i -t -d -p 8080:80 \
      -e JWT_ENABLED=true \
      -e JWT_SECRET=PASTE_YOUR_SECRET \
      --restart=always \
      --name onlyoffice onlyoffice/documentserver

## 4. Put it behind HTTPS (required — browsers block HTTP editors on HTTPS pages)
Point a subdomain (e.g. office.example.com) at the VM, then use Caddy:
    # /etc/caddy/Caddyfile
    office.example.com {
        reverse_proxy localhost:8080
    }
Caddy auto-provisions a Let's Encrypt certificate. Confirm
https://office.example.com/welcome loads.

## 5. Wire environment variables
Backend (Railway):
    ONLYOFFICE_URL=https://office.example.com
    ONLYOFFICE_JWT_SECRET=PASTE_YOUR_SECRET
    BACKEND_PUBLIC_URL=https://<your-backend>.up.railway.app
Frontend (Vercel):
    VITE_ONLYOFFICE_URL=https://office.example.com

## 6. Connectivity checklist
- The OnlyOffice VM can reach your Supabase project URL (outbound HTTPS).
- Your backend can reach https://office.example.com (for callback file download).
- Your browser can reach https://office.example.com over HTTPS.
```

- [ ] **Step 2: Commit**

```bash
git add docs/SETUP_ONLYOFFICE.md
git commit -m "docs: OnlyOffice Docs setup guide"
```

> The actual provisioning (VM, DNS, Docker, HTTPS) is performed by the operator following this guide. Code tasks below assume `ONLYOFFICE_URL`, `ONLYOFFICE_JWT_SECRET`, `BACKEND_PUBLIC_URL`, and `VITE_ONLYOFFICE_URL` are set.

---

### Task 1: Add the JWT dependency + backend env

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/lib/env.ts:12-24`

- [ ] **Step 1: Install jsonwebtoken**

Run: `cd backend && npm install jsonwebtoken && npm install -D @types/jsonwebtoken`
Expected: both added to `package.json`.

- [ ] **Step 2: Add env fields**

In `env.ts`, inside the `env` object (after `appUrl`, line 18) add:

```ts
  backendPublicUrl: process.env.BACKEND_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  onlyofficeUrl: process.env.ONLYOFFICE_URL ?? '',
  onlyofficeJwtSecret: process.env.ONLYOFFICE_JWT_SECRET ?? '',
```

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/lib/env.ts
git commit -m "feat(onlyoffice): add jsonwebtoken dep + env config"
```

---

### Task 2: OnlyOffice helper library (pure, tested)

**Files:**
- Create: `backend/src/lib/onlyoffice.ts`
- Test: `backend/src/lib/onlyoffice.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { decideAccess, docTypeFor, buildEditorConfig, signConfig, verifyCallbackToken } from './onlyoffice.js';

describe('decideAccess', () => {
  const base = { isOwner: false, isOrgAdmin: false, status: 'draft', kind: 'docx', sharePermission: null as string | null, released: false };

  it('owner editing a draft docx -> edit', () => {
    expect(decideAccess({ ...base, isOwner: true })).toBe('edit');
  });
  it('edit-share on a draft xlsx -> edit', () => {
    expect(decideAccess({ ...base, kind: 'xlsx', sharePermission: 'edit' })).toBe('edit');
  });
  it('approved file is never edit -> view for owner', () => {
    expect(decideAccess({ ...base, isOwner: true, status: 'approved' })).toBe('view');
  });
  it('non-editable kind is never edit', () => {
    expect(decideAccess({ ...base, isOwner: true, kind: 'pdf' })).toBe('view');
  });
  it('view-share -> view', () => {
    expect(decideAccess({ ...base, sharePermission: 'view' })).toBe('view');
  });
  it('released file -> view for anyone', () => {
    expect(decideAccess({ ...base, status: 'released', released: true })).toBe('view');
  });
  it('stranger with no share/owner/admin -> none', () => {
    expect(decideAccess(base)).toBe('none');
  });
});

describe('docTypeFor', () => {
  it('maps office kinds', () => {
    expect(docTypeFor('xlsx')).toBe('cell');
    expect(docTypeFor('pptx')).toBe('slide');
    expect(docTypeFor('docx')).toBe('word');
  });
});

describe('buildEditorConfig', () => {
  it('builds an edit config', () => {
    const c = buildEditorConfig({
      fileId: 'f1', title: 'X.docx', fileType: 'docx', documentUrl: 'https://s/u',
      versionKey: 'f1-v2', mode: 'edit', user: { id: 'u1', name: 'Ana' },
      callbackUrl: 'https://b/cb', allowDownload: true,
    });
    expect(c.document.key).toBe('f1-v2');
    expect(c.documentType).toBe('word');
    expect(c.editorConfig.mode).toBe('edit');
    expect(c.document.permissions.edit).toBe(true);
  });
});

describe('signConfig/verifyCallbackToken', () => {
  it('round-trips with a secret', () => {
    const token = signConfig({ a: 1 }, 'secret');
    expect(verifyCallbackToken(token, 'secret')).toMatchObject({ a: 1 });
  });
  it('rejects a bad secret', () => {
    const token = signConfig({ a: 1 }, 'secret');
    expect(() => verifyCallbackToken(token, 'wrong')).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/lib/onlyoffice.test.ts`
Expected: FAIL ("Cannot find module './onlyoffice.js'").

- [ ] **Step 3: Implement the helper**

```ts
import jwt from 'jsonwebtoken';
import { env } from './env.js';

export type AccessLevel = 'edit' | 'view' | 'none';

const EDITABLE_KINDS = ['docx', 'xlsx', 'pptx'];

/** Pure access decision used by the /onlyoffice/config gate. */
export function decideAccess(p: {
  isOwner: boolean;
  isOrgAdmin: boolean;
  status: string;
  kind: string;
  sharePermission: string | null;
  released: boolean;
}): AccessLevel {
  const editableKind = EDITABLE_KINDS.includes(p.kind);
  const editableStatus = p.status === 'draft' || p.status === 'rejected';
  if (editableKind && editableStatus && (p.isOwner || p.sharePermission === 'edit')) return 'edit';
  if (p.isOwner || p.isOrgAdmin || p.released || p.sharePermission != null) return 'view';
  return 'none';
}

export function docTypeFor(fileType: string): 'word' | 'cell' | 'slide' {
  if (fileType === 'xlsx') return 'cell';
  if (fileType === 'pptx') return 'slide';
  return 'word';
}

export interface EditorConfigParams {
  fileId: string;
  title: string;
  fileType: string;
  documentUrl: string;
  versionKey: string;
  mode: 'edit' | 'view';
  user: { id: string; name: string };
  callbackUrl: string;
  allowDownload: boolean;
}

export function buildEditorConfig(p: EditorConfigParams) {
  return {
    document: {
      fileType: p.fileType,
      key: p.versionKey,
      title: p.title,
      url: p.documentUrl,
      permissions: { download: p.allowDownload, print: p.allowDownload, edit: p.mode === 'edit' },
    },
    documentType: docTypeFor(p.fileType),
    editorConfig: {
      mode: p.mode,
      callbackUrl: p.callbackUrl,
      user: { id: p.user.id, name: p.user.name },
      customization: { forcesave: true, autosave: true },
    },
  };
}

export function signConfig(config: object, secret: string = env.onlyofficeJwtSecret): string {
  return jwt.sign(config, secret);
}

export function verifyCallbackToken(token: string, secret: string = env.onlyofficeJwtSecret): unknown {
  return jwt.verify(token, secret);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/lib/onlyoffice.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/onlyoffice.ts backend/src/lib/onlyoffice.test.ts
git commit -m "feat(onlyoffice): access decision + config builder + jwt helpers (tested)"
```

---

### Task 3: `/onlyoffice/config` route (permission gate)

**Files:**
- Create: `backend/src/routes/onlyoffice.ts`

- [ ] **Step 1: Implement the config endpoint**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { buildEditorConfig, decideAccess, signConfig, verifyCallbackToken } from '../lib/onlyoffice.js';

export const onlyofficeRouter = Router();

const BUCKET = 'documents';
const OFFICE_KINDS = ['docx', 'xlsx', 'pptx'];

const configSchema = z.object({ fileId: z.string().uuid() });

onlyofficeRouter.post('/config', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'fileId required' });
  const userId = req.user!.id;
  const { fileId } = parsed.data;

  try {
    const { data: file } = await supabaseAdmin
      .from('files')
      .select('id, org_id, owner_id, name, kind, mime, status, current_version, released_at')
      .eq('id', fileId)
      .single();
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (!OFFICE_KINDS.includes(file.kind)) return res.status(400).json({ error: 'Not an editable office file' });

    const [{ data: membership }, { data: share }] = await Promise.all([
      supabaseAdmin.from('organization_members').select('role').eq('org_id', file.org_id).eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('shares').select('permission, can_download').eq('target_type', 'file').eq('target_id', fileId).eq('shared_with_user_id', userId).maybeSingle(),
    ]);

    const access = decideAccess({
      isOwner: file.owner_id === userId,
      isOrgAdmin: membership?.role === 'admin',
      status: file.status,
      kind: file.kind,
      sharePermission: share?.permission ?? null,
      released: !!file.released_at,
    });
    if (access === 'none') return res.status(403).json({ error: 'You do not have access to this file' });

    const { data: version } = await supabaseAdmin
      .from('file_versions')
      .select('storage_path')
      .eq('file_id', fileId)
      .eq('version_no', file.current_version)
      .single();
    if (!version) return res.status(404).json({ error: 'Version not found' });

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(version.storage_path, 3600);
    if (signErr || !signed) return res.status(500).json({ error: 'Could not sign document URL' });

    const allowDownload = file.owner_id === userId || share?.can_download !== false;
    const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', userId).single();

    const config = buildEditorConfig({
      fileId,
      title: file.name,
      fileType: file.kind,
      documentUrl: signed.signedUrl,
      versionKey: `${fileId}-v${file.current_version}`,
      mode: access === 'edit' ? 'edit' : 'view',
      user: { id: userId, name: profile?.full_name ?? 'User' },
      callbackUrl: `${env.backendPublicUrl}/onlyoffice/callback?fileId=${fileId}&userId=${userId}`,
      allowDownload,
    });
    const token = signConfig(config);

    return res.json({
      config: { ...config, token },
      scriptUrl: `${env.onlyofficeUrl}/web-apps/apps/api/documents/api.js`,
      mode: config.editorConfig.mode,
    });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

// The /callback handler is appended to this same file in Task 4.
// `verifyCallbackToken` is already imported at the top and used there.
```

- [ ] **Step 2: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/onlyoffice.ts
git commit -m "feat(onlyoffice): /config permission gate returning signed editor config"
```

---

### Task 4: `/onlyoffice/callback` route (save as new version)

**Files:**
- Modify: `backend/src/routes/onlyoffice.ts` (append the callback handler before the final `export`)

- [ ] **Step 1: Add the callback handler**

No new imports are needed (Node 20+ provides a global `fetch`). Append this inside the file, after the `/config` handler:

```ts
const EXT_BY_KIND: Record<string, string> = { docx: 'docx', xlsx: 'xlsx', pptx: 'pptx' };

/**
 * Server-to-server callback from OnlyOffice. On status 2 (all editors closed,
 * changes present) we download the edited file and store it as a NEW version.
 * Auth is the JWT in the body's `token` (or Authorization header).
 */
onlyofficeRouter.post('/callback', async (req, res) => {
  try {
    const token = (req.body?.token as string | undefined) ?? (req.headers.authorization ?? '').replace('Bearer ', '');
    let payload: any;
    try {
      payload = verifyCallbackToken(token);
    } catch {
      return res.status(401).json({ error: 1 });
    }
    // OnlyOffice nests the real fields under the verified token.
    const status: number = payload.status ?? req.body.status;
    const downloadUrl: string | undefined = payload.url ?? req.body.url;
    const fileId = String(req.query.fileId ?? '');
    const userId = String(req.query.userId ?? '');

    // status 2 = ready to save; 6 = force-saved while editing. Others: no-op.
    if (status !== 2 && status !== 6) return res.json({ error: 0 });
    if (!downloadUrl || !fileId) return res.json({ error: 0 });

    const { data: file } = await supabaseAdmin
      .from('files')
      .select('id, org_id, owner_id, name, kind, status, current_version')
      .eq('id', fileId)
      .single();
    if (!file) return res.json({ error: 0 });

    // Safety: only persist if the file is still editable (draft/rejected).
    if (file.status !== 'draft' && file.status !== 'rejected') {
      console.warn(`[onlyoffice] skipped save for ${fileId}: status is ${file.status}`);
      return res.json({ error: 0 });
    }

    const resp = await fetch(downloadUrl);
    if (!resp.ok) return res.json({ error: 0 });
    const buffer = Buffer.from(await resp.arrayBuffer());

    const next = file.current_version + 1;
    const ext = EXT_BY_KIND[file.kind] ?? 'bin';
    const path = `${file.org_id}/${file.owner_id}/${file.id}/v${next}.${ext}`;
    const contentType =
      file.kind === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : file.kind === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (upErr) return res.json({ error: 0 });

    await supabaseAdmin.from('file_versions').insert({
      file_id: file.id,
      version_no: next,
      storage_path: path,
      size_bytes: buffer.length,
      mime: contentType,
      uploaded_by: userId || file.owner_id,
      note: 'Edited in browser (OnlyOffice)',
    });
    await supabaseAdmin.from('files').update({ current_version: next, size_bytes: buffer.length, mime: contentType }).eq('id', file.id);
    await supabaseAdmin.from('activity_log').insert({
      org_id: file.org_id,
      actor_id: userId || file.owner_id,
      action: 'file.edited',
      entity: 'file',
      entity_id: file.id,
      meta: { version: next },
    });

    return res.json({ error: 0 });
  } catch (e) {
    console.error('[onlyoffice callback]', e);
    return res.json({ error: 0 });
  }
});
```

- [ ] **Step 2: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS. (If `any` triggers lint errors, add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above the `payload`/`status` lines, matching the codebase's existing eslint-disable usage.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/onlyoffice.ts
git commit -m "feat(onlyoffice): /callback saves edited file as a new version"
```

---

### Task 5: Mount the router

**Files:**
- Modify: `backend/src/index.ts:11` (import) and `:56` (mount)

- [ ] **Step 1: Import and mount**

Add the import after the other route imports (line 11):

```ts
import { onlyofficeRouter } from './routes/onlyoffice.js';
```

Add the mount after `app.use('/reports', reportsRouter);` (line 56):

```ts
app.use('/onlyoffice', onlyofficeRouter);
```

- [ ] **Step 2: Type-check + boot**

Run: `cd backend && npx tsc --noEmit` → PASS.
Run: `cd backend && npm run dev`, then `curl -s localhost:8787/healthz` → `{"ok":true,...}`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(onlyoffice): mount /onlyoffice router"
```

---

### Task 6: Frontend API + editor component

**Files:**
- Modify: `frontend/src/lib/api.ts:44-93` (add method)
- Create: `frontend/src/components/drive/OnlyOfficeEditor.tsx`

- [ ] **Step 1: Add the API method**

Inside the `api` object (e.g. after `shareToEmail`), add:

```ts
  onlyofficeConfig: (fileId: string) =>
    post<{ config: Record<string, unknown>; scriptUrl: string; mode: 'edit' | 'view' }>('/onlyoffice/config', { fileId }),
```

- [ ] **Step 2: Create the editor component**

```tsx
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: unknown) => { destroyEditor: () => void } };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(src: string): Promise<void> {
  if (window.DocsAPI) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load the OnlyOffice editor script'));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Embeds the OnlyOffice editor for a file. Saving is handled by the backend
 * callback; `onClosed` fires when the editor is torn down so the parent can
 * refresh version history.
 */
export function OnlyOfficeEditor({ fileId, onClosed, className }: { fileId: string; onClosed?: () => void; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<{ destroyEditor: () => void } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const containerId = `onlyoffice-${fileId}`;
    (async () => {
      try {
        const { config, scriptUrl } = await api.onlyofficeConfig(fileId);
        await loadScript(scriptUrl);
        if (cancelled || !window.DocsAPI || !containerRef.current) return;
        containerRef.current.id = containerId;
        editorRef.current = new window.DocsAPI.DocEditor(containerId, {
          ...config,
          events: { onAppReady: () => setLoading(false) },
          height: '100%',
          width: '100%',
        });
      } catch (e) {
        if (!cancelled) {
          toast.error((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      try {
        editorRef.current?.destroyEditor();
      } catch {
        /* already gone */
      }
      onClosed?.();
    };
  }, [fileId, onClosed]);

  return (
    <div className={className ?? 'relative h-[620px] w-full'}>
      {loading && (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner className="h-7 w-7" />
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/drive/OnlyOfficeEditor.tsx
git commit -m "feat(onlyoffice): frontend editor component + config API"
```

---

### Task 7: Office preview via OnlyOffice + Edit button in detail page

**Files:**
- Modify: `frontend/src/components/drive/FilePreview.tsx` (replace the office fallback)
- Modify: `frontend/src/features/drive/FileDetailPage.tsx` (Edit button + inline/full-screen editor)

- [ ] **Step 1: Render office files with the OnlyOffice viewer**

In `FilePreview.tsx`, add the import:

```ts
import { OnlyOfficeEditor } from '@/components/drive/OnlyOfficeEditor';
```

Before the final fallback `return`, add an office branch:

```tsx
  if (category === 'office') {
    return <OnlyOfficeEditor fileId={file.id} className="h-[620px] w-full" />;
  }
```

(The backend returns `mode: 'view'` for non-editors, so this safely doubles as a viewer.)

- [ ] **Step 2: Add an Edit action + full-screen mode in the detail page**

In `FileDetailPage.tsx`:

Add imports:

```ts
import { Pencil, Maximize2, X } from 'lucide-react';
import { OnlyOfficeEditor } from '@/components/drive/OnlyOfficeEditor';
import { isEditableKind } from '@/lib/utils';
```

Add state near the other `useState` calls:

```ts
  const [fullscreen, setFullscreen] = useState(false);
```

Compute, after `const isOwner = file.owner_id === userId;`:

```ts
  const canEditInline = isEditableKind(file.kind) && (file.status === 'draft' || file.status === 'rejected') && isOwner;
```

In the Actions row (after the "New version" button block), add a full-screen edit launcher for editable files:

```tsx
              {canEditInline && (
                <button onClick={() => setFullscreen(true)} className="btn-primary">
                  <Pencil size={16} /> Edit
                </button>
              )}
```

At the end of the component's returned JSX (just before the final closing `</div>` that wraps everything, alongside the dialog renders), add the full-screen overlay:

```tsx
      {fullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-navy-950">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-white/10">
            <span className="truncate font-semibold text-navy-900 dark:text-white">{file.name} — Editing</span>
            <button
              onClick={() => {
                setFullscreen(false);
                refresh();
              }}
              className="btn-ghost"
            >
              <X size={18} /> Close
            </button>
          </div>
          <div className="flex-1">
            <OnlyOfficeEditor fileId={file.id} className="h-full w-full" onClosed={refresh} />
          </div>
        </div>
      )}
```

> Note: office files already show inline in the Preview card via `FilePreview` (Step 1). The "Edit" button opens the full-screen editor (layout B). The inline card serves as layout A (it opens in edit mode automatically when the viewer has edit access).

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/drive/FilePreview.tsx frontend/src/features/drive/FileDetailPage.tsx
git commit -m "feat(onlyoffice): office preview + inline/full-screen editing in detail page"
```

---

### Task 8: End-to-end manual verification

Prerequisite: Task 0 infra is live; all env vars set; backend + frontend deployed (or running locally with a reachable OnlyOffice server).

- [ ] **Step 1: Owner edits a draft**
Upload a `.docx` (status draft) → open detail → the Preview card shows the editor with the Word toolbar. Type a change, then click **Edit** for full-screen, make a change, **Close**.
Expected: a new version appears in Version history within a few seconds, attributed to you, note "Edited in browser (OnlyOffice)".

- [ ] **Step 2: Shared editor flow**
As the owner, Share the draft to a second member with **Can edit**. Sign in as that member → open the file → editor loads in edit mode → make a change → close.
Expected: new version recorded, `uploaded_by` = the editor.

- [ ] **Step 3: Approved file is view-only**
Take a file to `approved`/`released` → open it → the editor loads read-only; the **Edit** button is absent.
Expected: no new version can be created.

- [ ] **Step 4: View-only share**
Share with **Can view** → second member opens → editor is read-only.
Expected: cannot edit; no new version.

- [ ] **Step 5: Security spot-check**
Sign in as a member with no share on a draft and POST `/onlyoffice/config` with that fileId.
Expected: HTTP 403.

- [ ] **Step 6: Commit any fixes, then run the backend test suite**

Run: `cd backend && npm test`
Expected: PASS (includes `onlyoffice.test.ts`).

---

## Self-Review Notes (for the implementer)
- **`forcesave`/`autosave`** are enabled so an unexpectedly long session still persists (status 6); the no-op guard makes duplicate callbacks harmless.
- **`document.key`** is `${fileId}-v${version}`; after each save the version bumps, so re-opening uses a fresh key and OnlyOffice won't serve a stale cached copy.
- **Concurrency:** OnlyOffice co-editing is automatic; the single status-2 callback per closed session yields one new version per changed session.
- **Status race:** the callback re-checks `status ∈ {draft,rejected}` before writing, so a file approved mid-session won't be overwritten.
- **`any` in the callback:** OnlyOffice's payload is loosely typed; the explicit `any` + eslint-disable matches the existing pattern in `index.ts`.
- **Inline (layout A) vs full-screen (layout B):** the Preview card is layout A (auto edit/view by access); the Edit button is layout B. If you prefer A to be view-only with an explicit "Edit here" toggle, gate the `FilePreview` office branch on a prop — out of scope for the first pass.
