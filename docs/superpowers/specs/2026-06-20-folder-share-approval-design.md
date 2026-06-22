# Folder Sharing & Approval — Design Spec

**Date:** 2026-06-20 · **Status:** Approved (brainstorming) · **Project:** DYCI DMS

Bring the existing file capabilities — tiered sharing (view/comment/download/editor) and approval (same-office + cross-office) — to **folders**, with recursive access.

## Decisions (interview)
- **Folder share scope:** recursive — the folder + everything inside (all files/subfolders) at the chosen tier.
- **Folder approval:** ONE folder-level decision (free-pick same-office, or office-pick cross-office). Folders have no chain/doc-type/reference. Files inside are not individually marked.
- **Approver content access:** mirror the file rules — same-office approver can browse + preview + download contents; cross-office approver can browse + preview + comment only (no download).
- **Editor tier on a folder:** upload new versions of files inside **and add new files** (no delete).

## Current State (verified)
- `folders`: `id, org_id, owner_id, parent_id, name, state` (no `status`).
- `shares.target_type` already supports `'folder'`; `permission` ∈ `view|comment|download|edit`. `folders_select` already grants read on a directly-shared folder, but listing its contents fails (`listFiles` filters `owner_id = me`).
- `approval_requests` is file-only (`file_id`); `decide_approval` sets `files.status`. `is_file_approval_participant` gates approver file read. Cross-office uses `target_org_id` + shared-queue + sibling-skip.
- File tiers + backend `/files/:id/version` (edit upload) + `file_comments` exist. Permission resolution today checks **direct file shares only**.

## Architecture

### 1. Data model (migration `0016_folder_share_approval.sql`)
- `alter table public.folders add column if not exists status doc_status not null default 'draft';`
- `alter table public.approval_requests add column if not exists folder_id uuid references public.folders(id) on delete cascade;` (exactly one of `file_id` / `folder_id` is set).
- Update `supabase/schema.sql` for the `folders.status` column.

### 2. Recursive access helpers (SECURITY DEFINER)
- `folder_share_perm(p_folder uuid) → text|null`: walk `parent_id` upward; return the **best** `shares.permission` the caller (`auth.uid()`) holds on the folder or any ancestor (rank edit>download>comment>view), else null.
- `is_folder_approval_participant(p_folder uuid) → boolean`: requester or any assignee on a folder-typed request for that folder (mirrors `is_file_approval_participant`).
- `effective_file_permission(p_file uuid) → text|null`: highest of {owner ⇒ 'edit', direct file share, `folder_share_perm(file.folder_id)`}. Used by gating + endpoints.

### 3. RLS updates
- `folders_select`: also allow when `folder_share_perm(folders.id) is not null` OR `is_folder_approval_participant(folders.id)`.
- `files_select`: also allow when `folder_share_perm(files.folder_id) is not null` (inherited) — keep existing direct-share + file-approval-participant clauses. For folder approval, allow read of files whose folder (or ancestor) is under an active folder request via `is_folder_approval_participant`.
- `file_attachments` / `file_comments` / `file_versions`: inherit visibility through the file (already gated by file visibility) — comment insert also allowed for folder-inherited `comment`/`edit` (extend the insert policy to check `effective_file_permission`).
- Storage read: served via signed URLs from the app after permission checks (no change); writes stay owner/service-role.

### 4. Permission resolution (frontend + backend)
- Frontend `effectiveFilePermission(file)` helper (lib): owner → 'edit'; else direct `myShareForFile` OR walk the folder chain via a new `folderSharePerm(folderId)` (RPC `folder_share_perm`). Drives download/comment/version/add-file affordances on the file detail page when reached through a shared folder.
- Backend `/files/:id/version`: accept callers with folder-inherited `edit` (call `effective_file_permission`). New `POST /files/folder/:folderId/add` (service role): add a new file into a folder the caller owns or has folder-inherited `edit` on; writes the `files` row + storage under the **folder owner's** path; notifies the owner.

### 5. Folder approval (same + cross office)
- RPCs mirroring files:
  - `request_folder_approval(p_folder uuid, p_message text, p_assignee uuid)`: authorize owner/admin/member; insert `approval_requests` (folder_id set, org = folder.org, status pending, step 1) + one step-1 assignment (the chosen approver); set `folders.status='pending'`; notify approver (deep-link `/app/approvals?request=<id>`).
  - `request_cross_office_folder_approval(p_folder, p_message, p_target_org)`: require target office has an approver; insert request (folder_id + target_org_id) + one pending step per target approver (shared queue); notify all; set `folders.status='pending'`.
- `decide_approval`: generalize to set the **folder's** status when `folder_id` is present (approve → `approved`, reject → `rejected`); keep file behavior unchanged for file requests; reuse sibling-skip for shared queue. (No release step for folders.)
- Rejection → folder stays in My Drive (`state` active); owner can re-request (revise path).

### 6. Frontend
- **ShareDialog**: already opens for files; extend to accept a folder target — same 4-tier members selector → inserts `shares` with `target_type='folder'`. (Email-send for folders already zips — unchanged.)
- **RequestApprovalDialog**: accept a folder; My-office mode = single free-pick approver (no chain for folders); Another-office mode = office-pick (reuse `list_approver_offices`). Calls the folder RPCs.
- **SharedPage**: list shared **folders** too (from `shares` where `target_type='folder'`); opening one navigates into a browsable folder view.
- **Folder detail/browse view** (`/app/folder/:id`): header with tier-gated actions (Share, Request approval [owner], Download-all? out of scope, Add file [editor], rejected banner [owner]); lists subfolders + files; each file row respects `effectiveFilePermission`.
- **Approvals page**: folder requests render a folder icon; the detail opens a **content browser** (list files, preview + comment; download per Q3 rules) plus Approve/Reject.
- **types**: `Folder.status`; `ApprovalRequest.folder_id`; a `SharedFolderItem` for the shared list.

### 7. Non-Goals
- Per-file approval inside a folder; folder "release" feed; Editor deleting files; folder versioning; bulk download-as-zip in the browse view.

## Testing
- Manual: share a folder at each tier to a co-member → recipient browses recursively; download/comment/version/add-file gated correctly per tier; nested subfolder access inherits. Request folder approval same-office and cross-office → approver browses contents (download per rule), approve sets `folders.status='approved'`, reject sets `rejected` and folder remains in My Drive with a revise/re-request path. Notifications deep-link to the request.
- Where extractable: `folder_share_perm` ranking and `effective_file_permission` precedence (unit-test the pure ranking helper on the frontend).

## Risks
- **Recursive RLS cost:** `folder_share_perm` walks ancestors per row; keep folder trees shallow and the function `stable`. Acceptable for office-scale data.
- Generalizing `decide_approval` must not regress file approvals — covered by keeping the file branch identical and adding a folder branch.
