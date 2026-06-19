# Multi-file Doc Types + Notification Deep-Links + Rejected Revise — Design

**Date:** 2026-06-20 · **Status:** Approved (brainstorming) · **Project:** DYCI DMS

Three independent features in one spec.

## Decisions (interview)
- **Multi-file:** ON → one document holds many **flat attachments** (add/remove, no per-attachment versions). OFF → one file. Approval/share/preview act on the whole document.
- **Notifications:** clicking navigates to the subject; approval → the request detail; others → file detail.
- **Rejected:** already stays in My Drive + re-requestable; add a clear "Revise & resubmit" path and verify both approval flows.

## Feature 1 — Multi-file document types

### DB (migration `0015_multifile.sql`)
- `alter table public.document_types add column if not exists allow_multiple boolean not null default false;`
- New table:
```sql
create table if not exists public.file_attachments (
  id uuid primary key default uuid_generate_v4(),
  file_id uuid not null references public.files(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  storage_path text not null,
  size_bytes bigint not null default 0,
  mime text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_file_attachments_file on public.file_attachments(file_id);
alter table public.file_attachments enable row level security;
```
- RLS:
  - select: `exists (select 1 from public.files f where f.id = file_attachments.file_id)` (file visibility gates it).
  - insert/delete: file owner or org admin (`exists (... f where f.id=file_id and (f.owner_id=auth.uid() or public.is_org_admin(f.org_id)))`).
- Update `supabase/schema.sql` to match (column + table + RLS).

### Model
Document = existing `files` row + `file_versions` (primary, versioned). Extra files = `file_attachments` rows (flat). Storage path: `{org}/{owner}/{file_id}/att-{uuid}.{ext}` in `documents` bucket.

### Frontend
- `lib/documentTypes.ts`: `DocumentType.allow_multiple: boolean`; include in create/update payloads.
- `components/org/DocTypeEditor.tsx`: a checkbox "Accept multiple file uploads" (create + edit), beside the existing publishable/active toggles.
- `lib/drive.ts`: `listAttachments(fileId)`, `addAttachment(file: FileItem, blob: File)`, `removeAttachment(att)` (storage upload/remove + row insert/delete; reuse `ext`/`BUCKET`).
- `components/drive/UploadDocumentDialog.tsx`: when `selected.allow_multiple`, the file input is `multiple`; first file → `uploadFile` (primary), the rest → `addAttachment` after the document row exists.
- `features/drive/FileDetailPage.tsx`: an "Attachments" card (only when the file's type `allow_multiple`, or whenever attachments exist) listing each attachment with a download button (and inline `FilePreview` is for the primary; attachments get download + open-in-new-tab). Owner sees an "Add file" button + per-row remove.

## Feature 2 — Notification deep-links

### Links at creation (precise)
- approval notifications → `/app/approvals?request=<requestId>`.
- share/release/version → `/app/file/<fileId>`.
- Update `lib/notify.ts` callers in `lib/approvals.ts` (have request id), `Dialogs.tsx` share, `drive`/version flows, and the cross-office RPC notification (`link = '/app/approvals?request=' || v_req`) — migration `0015` includes a `create or replace` of `request_cross_office_approval` with the corrected link.

### Bell (`components/layout/NotificationsBell.tsx`)
- Each item: `onClick` → mark that row read (`update notifications set read=true where id`), `setOpen(false)`, `navigate(n.link)` (guard null). Use `useNavigate`.

### ApprovalsPage (`features/approvals/ApprovalsPage.tsx`)
- Read `?request=<id>` (useSearchParams). On load, if present, fetch via new `getRequestById(id)` and open the detail dialog; clear the param on close.
- `lib/approvals.ts`: `getRequestById(id)` → `approval_requests` select `*, files, requester` by id.

## Feature 3 — Rejected: revise & resubmit

- No data change. In `FileDetailPage` (owner, `status === 'rejected'`): show a banner "This document was rejected — revise and resubmit." with the existing **Upload new version** and **Request approval** actions surfaced together.
- The rejection notification already exists (`decideApprovalStep` notifies requester) and now deep-links to the file (Feature 2). Works for office-only and cross-office (both set file `status='rejected'`).
- Verify: reject in each flow → doc in My Drive (active, rejected) → new version → request approval again (office or cross-office).

## Non-Goals
- Per-attachment versioning; sharee-managed attachments (owner/admin only in v1); changing approval to act per-attachment.

## Testing
- Manual: toggle allow_multiple; multi-upload creates 1 doc + N attachments; add/remove attachment; single-file types unchanged. Click each notification type → correct destination (approval opens request). Reject (both flows) → revise & resubmit works.
- Unit (where extractable): none required beyond existing.
