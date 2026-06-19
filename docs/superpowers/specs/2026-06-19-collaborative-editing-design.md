# Collaborative Editing & Universal Preview — Design Spec

**Date:** 2026-06-19
**Status:** Approved (brainstorming) — ready for implementation planning
**Project:** DYCI DMS

## Summary

Add in-organization collaboration to the document drive:

1. **Richer share permissions** — when sharing a file to an org member, the owner chooses a
   **View / Edit** access level plus independent **Allow download** and **Allow re-sharing** toggles.
2. **In-browser editing of Word/Excel/PowerPoint** via a self-hosted **OnlyOffice Docs** engine,
   embedded in the document details page (inline, with an expand-to-full-screen mode).
3. **Universal preview** — every file shows a preview pane in the details page; common types render
   inline, anything else falls back to a clean icon + download card.
4. **Save = new version** — when an editor saves, the result is stored as a new version of the document,
   reusing the existing versioning model.

## Goals

- Let members collaborate on documents without leaving the website.
- Preserve the integrity of the approval workflow: approved/released documents cannot be silently altered.
- Make every change additive — no rewrite of the drive, approvals, storage, or versioning systems.

## Non-Goals

- Editing arbitrary binary formats (only OOXML: `.docx`, `.xlsx`, `.pptx`).
- Rendering every conceivable file type inline (e.g. `.zip`, `.exe`, `.psd`, CAD): these get a graceful fallback.
- Changing the external email-sharing feature (`/share` route) — out of scope.
- Public/anonymous sharing — sharing remains org-member-only.

## Current State (verified in code)

- **`shares` table** (`supabase/schema.sql:199`): `permission text check (permission in ('view','download'))`.
  No edit level, no download/reshare flags. `Share` type at `frontend/src/lib/types.ts:168`.
- **In-app sharing** is performed client-side: `shareFileWithMember(orgId, fileId, uid, 'download')`
  called from `ShareDialog` (`frontend/src/components/drive/Dialogs.tsx:110`). Helper lives in `lib/org.ts`.
  `listSharedWithMe` (`frontend/src/lib/drive.ts:72`) reads back via the `shares` table.
- **Storage** is owner-locked: `documents_write` / `documents_modify` policies (`schema.sql:604-613`)
  only allow the file owner (`split_part(name,'/',2) = auth.uid()`) to write. `file_versions` insert
  RLS (`schema.sql:520`) only allows owner/org-admin.
- **Versioning** works via `uploadNewVersion` (`frontend/src/lib/drive.ts:164`): upload `v{next}` object,
  insert `file_versions` row, bump `files.current_version`.
- **Preview** is PDF-only today (`FileDetailPage.tsx:229-249`): iframe + signed URL; everything else says
  "download to view".
- **Backend** mounts routers in `backend/src/index.ts:51-56`; `supabaseAdmin` (service role) already used
  (`backend/src/routes/share.ts:3`). Tests use Vitest.
- `files.kind` already includes `docx | xlsx | gdoc | gsheet | pdf | other`.

## Design Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Editing engine | Self-hosted **OnlyOffice Docs Community** (free software) |
| OnlyOffice hosting | **Oracle Cloud Always-Free** tier recommended; Railway as paid fallback |
| Permission model | View / Edit + independent `can_download` + `can_reshare` toggles |
| Editable file kinds | `.docx`, `.xlsx`, `.pptx` |
| Edit vs approval | **Editing allowed only while status is `draft` or `rejected`**; otherwise view-only |
| Concurrent editing | OnlyOffice real-time co-editing enabled; one changed session → one new version |
| Re-share rules | A re-sharer (`can_reshare`) may grant **view only**; never edit, never cascade |
| Folder shares | Remain view/download (edit is file-level only) |
| Preview coverage | PDF, images, Office (docx/xlsx/pptx), text/CSV/Markdown render inline; all else = fallback card |
| Editor placement | **Inline** in details page (default) + **expand to full-screen** |

## Architecture

### Component 1 — Permission model (DB + types)

New migration `supabase/migrations/0011_share_edit_permissions.sql` (additive, safe to re-run):

- Drop and recreate the `shares.permission` CHECK to allow `('view','edit','download')`.
- Add `can_download boolean not null default true`.
- Add `can_reshare boolean not null default false`.
- Backfill: existing rows with `permission='download'` get `can_download=true`; otherwise unchanged.

> Note on `permission` semantics: `permission` becomes the **access level** (`view` or `edit`).
> `download` is retained as a legacy-compatible value treated as `view` + `can_download=true` during a
> transition; new writes use `view`/`edit` plus the boolean flags. Implementation may normalize legacy
> rows in the migration.

Update `Share` interface (`frontend/src/lib/types.ts:168`):
```ts
permission: 'view' | 'edit' | 'download';
can_download: boolean;
can_reshare: boolean;
```

RLS: no change required. `files_select` (`schema.sql:498`) already grants read to users with a matching
share. Storage write RLS stays owner-only — the editor save path uses the service role (see Component 3).

### Component 2 — Share dialog UI

Extend `shareFileWithMember` (in `lib/org.ts`) to accept `{ access: 'view'|'edit', canDownload: boolean, canReshare: boolean }`.

Extend `ShareDialog` (`frontend/src/components/drive/Dialogs.tsx:85`):
- **Access level** control: View / Edit. "Edit" is shown only when `isEditableKind(file)` is true.
- **Allow download** toggle (default on).
- **Allow re-sharing** toggle (default off).
- When the current user is a re-sharer (not owner) the dialog only offers **View**, and only if their own
  share has `can_reshare = true`.

`isEditableKind(file)` helper: true when `kind ∈ {docx, xlsx, pptx}` (resolved from kind/mime/extension).

### Component 3 — OnlyOffice integration (backend)

New router `backend/src/routes/onlyoffice.ts`, mounted at `/onlyoffice` in `index.ts`.

New env (`backend/src/lib/env.ts` + container): `ONLYOFFICE_URL`, `ONLYOFFICE_JWT_SECRET`.

**`POST /onlyoffice/config`** — *the security gate.*
1. `requireAuth`.
2. Load file; verify caller is **owner OR has an `edit` share**, file kind is editable, status ∈ {draft, rejected}.
   (View mode: caller is owner OR has any share OR file is released OR org admin.)
3. Create a short-lived signed Supabase URL for the current version's storage object.
4. Build an OnlyOffice config:
   - `document.fileType`, `document.title`, `document.url` = signed URL,
   - `document.key` = `${fileId}-v${current_version}` (changes when content changes → no stale cache),
   - `editorConfig.mode` = `edit` | `view`,
   - `editorConfig.user` = caller id + name,
   - `editorConfig.callbackUrl` = `${BACKEND_URL}/onlyoffice/callback?fileId=...`,
   - `permissions.download` / `permissions.print` derived from `can_download`.
5. Sign the config with `ONLYOFFICE_JWT_SECRET`; return `{ config, scriptUrl }`.

**`POST /onlyoffice/callback`** — called server-to-server by OnlyOffice.
1. Validate the inbound JWT (`ONLYOFFICE_JWT_SECRET`).
2. On `status = 2` (or `6` force-save): download the edited file from OnlyOffice's `url`.
3. Re-verify the editing was permitted (status still draft/rejected; abort + log if changed).
4. Using `supabaseAdmin` (service role), write a new version — **server-side port of `uploadNewVersion`**:
   upload `{org}/{owner}/{fileId}/v{next}.{ext}`, insert `file_versions` (`uploaded_by` = the editing user
   from the callback payload, `note` = "Edited in browser"), bump `files.current_version`, `size_bytes`, `mime`.
5. Write an `activity_log` row. Respond `{ error: 0 }`.

Security notes:
- The callback is unauthenticated at the HTTP layer (OnlyOffice has no Supabase session) but **JWT-verified**;
  reject any request without a valid token. Keep it under the existing rate limiter.
- The browser can never obtain an `edit` config without a valid edit share — permission lives in `/config`,
  not the client.

### Component 4 — Editor UI (frontend)

New `frontend/src/components/drive/OnlyOfficeEditor.tsx`:
- Loads the OnlyOffice `DocsAPI` script from `ONLYOFFICE_URL`, instantiates `DocEditor` in a container with
  the config returned by `/onlyoffice/config`.
- Props: `fileId`, `mode`, `onSaved` (invalidates `['file', id]` + `['versions', id]` queries).

Wire into `FileDetailPage` (`frontend/src/features/drive/FileDetailPage.tsx`):
- An **Edit** button (enabled only when editing is permitted) toggles inline edit mode in the preview card
  (layout A). An **expand ⤢** control opens a full-screen editor (layout B) — a modal/overlay or dedicated
  route `/app/file/:id/edit`.
- Closing the editor returns to the details view; version history reflects any new version.

### Component 5 — Universal preview (frontend)

New `frontend/src/components/drive/FilePreview.tsx`, replacing the PDF-only block at
`FileDetailPage.tsx:229-249`. Switches on resolved kind/mime:

| Type | Renderer |
|---|---|
| PDF | existing iframe + signed URL |
| Image (png/jpg/gif/webp/svg) | `<img>` with signed URL |
| Office (docx/xlsx/pptx) | OnlyOffice viewer (`mode=view`, no callback) |
| Text / CSV / Markdown | fetch signed URL, render text (CSV → simple table, MD → rendered) |
| Everything else | icon + filename + size + Download button (clean fallback) |

Preview respects `can_download`: when a viewer lacks download permission, hide the download affordance and
pass `permissions.download=false` to the OnlyOffice viewer.

## Data Flow — editing → new version

```
1. User clicks Edit (editable kind + draft/rejected + owner or edit-share)
2. Frontend  -> POST /onlyoffice/config        (backend verifies permission)
3. Backend   -> signed Supabase URL + JWT-signed OnlyOffice config
4. Browser   -> loads OnlyOffice editor iframe; OnlyOffice fetches the file
5. Users edit (live co-editing). Last editor closes.
6. OnlyOffice -> POST /onlyoffice/callback (status=2, link to edited file)
7. Backend   -> validate JWT, download edited file, write v{next} via service role
8. Frontend  -> refetch; new version appears in history (editor recorded as uploader)
```

The browser never writes storage; the trusted backend does. Owner-only storage RLS is unchanged.

## What does NOT change

Drive listing, folders, the multi-step approvals engine, release/archive/bin lifecycle and its trigger,
storage RLS, the external email-share route, and the existing "New version" upload button all remain intact.

## Testing

**Backend (Vitest):**
- `/onlyoffice/config` permission gate: owner edit ✓; edit-share ✓; view-only share ✗; non-member ✗;
  wrong status (approved/released) ✗ for edit.
- `/onlyoffice/callback`: rejects missing/invalid JWT; on valid `status=2`, writes a new `file_versions`
  row and bumps `current_version`; aborts if status changed away from draft/rejected.

**Manual / integration:**
- Share a draft with Edit → second member edits → confirm a new version appears, attributed to the editor.
- Approved file → Edit hidden / disabled (view-only).
- `can_download` off → no download affordance for that share; OnlyOffice download/print disabled.
- `can_reshare` on → recipient can share view-only; off → cannot re-share.
- Preview renders for PDF, image, docx/xlsx/pptx, txt/csv/md; unknown type shows fallback card.

## Deployment

- Provision OnlyOffice Docs Community (Docker) on Oracle Cloud Always-Free (recommended) or Railway.
  Set the same `ONLYOFFICE_JWT_SECRET` on the container and the backend; set `ONLYOFFICE_URL` on the backend
  and expose it to the frontend (editor script origin).
- Document setup in `docs/SETUP_ONLYOFFICE.md` (install, JWT, reverse proxy/HTTPS, env wiring).
- Apply migration `0011` in Supabase.

## Phasing (one spec, staged implementation plans)

1. **Permissions** — migration `0011` + `Share` type + `shareFileWithMember` + Share dialog UI.
2. **Universal preview** — `FilePreview` component (independent; ships value without OnlyOffice for
   PDF/image/text; Office preview lights up once OnlyOffice exists).
3. **OnlyOffice editing** — infra + `/onlyoffice` routes + `OnlyOfficeEditor` + inline/full-screen wiring +
   save-as-version + setup docs.

## Open Risks

- **OnlyOffice fetch reachability:** the OnlyOffice server must be able to reach the signed Supabase URL,
  and the backend must reach OnlyOffice's callback download URL. Both are server-to-server; verify network
  egress in the chosen host.
- **Signed URL lifetime** must exceed OnlyOffice's fetch window (use a comfortable TTL).
- **Resource use:** the Document Server is memory-hungry; confirm the host meets its minimum before relying on it.
