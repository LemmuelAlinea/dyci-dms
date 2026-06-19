# Simplified Sharing (no in-browser editor) — Design Spec

**Date:** 2026-06-19
**Status:** Approved (brainstorming) — ready for implementation planning
**Project:** DYCI DMS
**Supersedes:** the in-browser editing approach in `2026-06-19-collaborative-editing-design.md` (OnlyOffice). The OnlyOffice work was never merged to `main`; this spec replaces it.

## Summary

Simplify document sharing into three clear permission tiers and drop the in-browser
editor entirely. Editing happens externally (download → edit in Word/Google Docs →
optionally upload a new version). Read-only viewing of common file types is rendered
client-side (no server). The three tiers:

| Tier | View in browser | Download | Upload a new version |
|---|---|---|---|
| **View only** | ✅ | ❌ | ❌ |
| **Download** | ✅ | ✅ | ❌ |
| **Edit** | ✅ | ✅ | ✅ (saved to the owner's document) |

## Goals

- Make the share dialog dead simple: one choice of three tiers.
- Let an "Edit" recipient upload a new version that becomes a real version of the owner's document.
- Render read-only previews for PDF, images, text/CSV, Word, and Excel in the browser, privately.
- Remove all OnlyOffice infrastructure and the editor UI.

## Non-Goals

- In-browser editing (removed).
- PowerPoint (.pptx) in-browser rendering — falls back to a download card.
- Cryptographic download prevention — "View only" gating is UI-level (see Caveat).
- Re-sharing by recipients (removed).

## Current State (verified)

- `main` has **no** OnlyOffice code — only a Plan 3 planning doc. The editor lives only on
  branch `feat/onlyoffice-editing` (to be abandoned/deleted).
- `main`'s `shares` table (migration 0011): `permission` (`view`|`edit`|`download`),
  `can_download`, `can_reshare`. `Share` type at `frontend/src/lib/types.ts`.
- Share dialog (`frontend/src/components/drive/Dialogs.tsx`) has an access radio + download/
  re-share toggles + re-sharer gating (`myShareForFile`).
- `FilePreview` (`frontend/src/components/drive/FilePreview.tsx`) renders pdf/image/text and a
  download fallback for office and unknown types.
- New-version upload (`uploadNewVersion` in `frontend/src/lib/drive.ts`) is owner-only; storage
  write RLS (`supabase/schema.sql:604`) and `file_versions` insert RLS (`:520`) are owner/admin-only.
- Backend mounts routers in `backend/src/index.ts`; `supabaseAdmin` (service role) is in
  `backend/src/lib/supabaseAdmin.ts`; auth via `requireAuth` (`backend/src/middleware/auth.ts`).

## Design Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Permission tiers | View / Download / Edit (single selector) |
| Re-sharing | Removed entirely |
| In-browser editing | Removed (OnlyOffice abandoned) |
| Read-only viewing | Client-side: `docx-preview` (Word) + `SheetJS` (Excel) + existing pdf/image/text; pptx → download card |
| Edit-tier upload | Backend endpoint (service role) writes a new version for the owner |
| Upload allowed when | Document status is `draft` or `rejected` only (confirmed) |
| Owner notification | In-app notification when a recipient uploads a new version (confirmed) |
| Download gating | UI-level (no download affordance for View only) |

## Architecture

### Component 1 — Permission model (DB + types)

Migration `supabase/migrations/0012_simplify_share_permissions.sql` (additive/safe):
- `alter table public.shares drop column if exists can_download;`
- `alter table public.shares drop column if exists can_reshare;`
- Keep the `permission` CHECK as `('view','download','edit')` (already present from 0011).
- `permission` now fully encodes the tier: `view` (view only), `download` (view+download),
  `edit` (view+download+upload).

Also update `supabase/schema.sql` `shares` table to drop the two columns (keep snapshot in sync).

`Share` type (`frontend/src/lib/types.ts`): remove `can_download` and `can_reshare`; keep
`permission: 'view' | 'download' | 'edit'`. Remove `ShareOptions` booleans — sharing now takes a
single `permission`. `SharedFileItem` becomes `FileItem & { _share?: { permission: string } }`.

RLS: no change. `files_select` already grants read to any user with a matching share. The new
upload path uses the service role (Component 4), so storage RLS stays owner-only.

### Component 2 — Share dialog (simplified)

`shareFileWithMember(orgId, fileId, targetUserId, permission)` in `frontend/src/lib/org.ts` —
signature changes from the options object to a single `permission: 'view'|'download'|'edit'`.

`ShareDialog` (`frontend/src/components/drive/Dialogs.tsx`):
- Replace the access radio + two toggles + re-sharer gating with **one tier selector**
  (three options: View only / Download / Edit) with a one-line description under each.
- Delete: the `canDownload`/`grantReshare` state, the re-share checkbox, the `myShare`/
  `mayReshareFile`/`canGrantEdit` gating, and the `isEditableKind`-based "edit only for office"
  restriction (all three tiers apply to any file type).
- Default tier: View only.

### Component 3 — Read-only viewing (client-side)

Add dependencies `docx-preview` and `xlsx` (SheetJS) to the frontend.

Extend `FilePreview` (`frontend/src/components/drive/FilePreview.tsx`):
- Reorder/extend `previewCategory` so Word (`docx`/`doc`) → `office-word`, Excel
  (`xlsx`/`xls`/`csv`) → `office-cell`, PowerPoint (`pptx`/`ppt`) → `office-none`.
  (CSV may continue to use the existing text/CSV renderer; spreadsheets use SheetJS.)
- New render branches:
  - **Word**: fetch the signed URL as an ArrayBuffer, render with `docx-preview` into a
    scrollable container.
  - **Excel**: fetch as ArrayBuffer, parse with SheetJS, render the first sheet (with a sheet
    switcher if multiple) as an HTML table.
  - **PowerPoint / unknown**: existing download-fallback card.
- The preview itself does not gate download; the surrounding page passes `canDownload`.

### Component 4 — Edit-tier: upload a new version (backend)

New backend route `backend/src/routes/files.ts` mounted at `/files`:

**`POST /files/:fileId/version`** (`requireAuth`, multipart via `multer` memory storage):
1. Load the file; verify the caller is the **owner** OR has a share with `permission = 'edit'`.
2. Verify status is `draft` or `rejected` (else 409 — protects approved/released docs).
3. Size guard (reuse a sane cap, e.g. 50 MB).
4. Using `supabaseAdmin` (service role), write a new version (server-side port of
   `uploadNewVersion`): upload `{org}/{owner}/{fileId}/v{next}.{ext}`, insert `file_versions`
   (`uploaded_by` = caller, `note` = "Uploaded by <name>"), bump `files.current_version`,
   `size_bytes`, `mime`.
5. Insert a `notifications` row for the owner ("<name> uploaded a new version of <file>") and an
   `activity_log` row.
6. Return the new version number.

Add `multer` (+ `@types/multer`) to backend deps.

> The owner's own "New version" button keeps using the existing client-side `uploadNewVersion`
> (storage RLS already permits the owner). Only the non-owner edit path needs the backend.

### Component 5 — File detail + shared page wiring

`frontend/src/lib/drive.ts`:
- `myShareForFile(fileId, userId)` returns `{ permission } | null` (drop `can_reshare`).
- Add `uploadNewVersionViaApi(fileId, file)` calling the backend endpoint (multipart) for sharees.

`FileDetailPage` (`frontend/src/features/drive/FileDetailPage.tsx`):
- Determine the viewer's access: owner, or their share `permission`.
- **Download** button: shown for owner, or share `permission` in (`download`,`edit`).
- **Upload new version** button: shown for owner (existing flow) or share `permission = 'edit'`
  (calls `uploadNewVersionViaApi`), enabled only when status is `draft`/`rejected`.
- Pass `canDownload` to `FilePreview` accordingly.

`SharedPage` (`frontend/src/features/shared/SharedPage.tsx`): Download action shown only when
`_share.permission !== 'view'`.

### Caveat — "View only = no download"

Enforced at the UI level (no download button/affordance). Because the browser must fetch the
file bytes to render a preview, a technical user could still extract them via dev tools. True
download prevention is out of scope.

## What gets removed

- Branch `feat/onlyoffice-editing` (deleted, local + remote).
- `docs/superpowers/plans/2026-06-19-collab-3-onlyoffice-editing.md` (obsolete plan).
- The `can_download` / `can_reshare` columns, the re-share toggle, and re-sharer gating.

## Testing

**Backend (Vitest):**
- `POST /files/:id/version` permission: owner ✓, edit-share ✓, download-share ✗ (403),
  view-share ✗, non-member ✗; wrong status (approved) ✗ (409); size over cap ✗.
- Version write increments `current_version` and inserts a `file_versions` row + owner notification.

**Manual:**
- Share a draft with each tier to a second member; verify: View only = no download/no upload;
  Download = download yes, no upload; Edit = download + upload-new-version, owner sees it + notification.
- Preview renders for pdf, image, txt/csv, docx (docx-preview), xlsx (SheetJS); pptx → download card.

## Phasing (single plan, ordered tasks)

1. **Cleanup + model**: delete OnlyOffice branch/doc; migration 0012; `Share`/`ShareOptions`/
   `SharedFileItem` types; `shareFileWithMember` signature.
2. **Share dialog**: simplified 3-tier selector; remove toggles/gating.
3. **Read-only viewing**: `docx-preview` + SheetJS branches in `FilePreview`.
4. **Edit upload**: backend `/files/:id/version` (+ multer) with tests; `uploadNewVersionViaApi`;
   detail-page Download/Upload wiring; SharedPage download gating.
