# Cross-Office Approval — Design Spec

**Date:** 2026-06-20
**Status:** Approved (brainstorming) — ready for planning
**Project:** DYCI DMS

## Summary

Add the ability to request document approval from **another office**, alongside the
existing same-office flow (which is unchanged). The requester picks a target office by
name (e.g. "College of Computer Studies (CCS)") — never an email/approver. The request
routes to that office's `approver`-role members as a shared queue; the first to decide
resolves it. Only offices that have at least one active approver can be selected.

## Decisions (from interview)

| # | Decision |
|---|---|
| Q1 | Multiple approvers in target office → **any one** decides (shared queue; first decision wins). |
| Q2 | **Single** target office per cross-office request (one step). |
| Q3 | External approver gets **view + comment** on the document; **no download**. |
| Q4 | Dropdown lists **all other offices**; offices with no active approver are shown **disabled**. |
| Q5 | On approve → file `approved`, owner releases to **own** office (same as office-only). Reject → `rejected`. Nothing published in the approving office. |

## Non-Goals

- Multi-office chains / mixing internal + external steps.
- External approver downloading the file.
- Auto-release; releasing in the approver's office.
- Changing the existing same-office approval flow.

## Current State (verified)

- Approval is org-scoped. `request_approval` RPC (`0006`) inserts `approval_requests`
  (`org_id` = file's org) + one `approval_step_assignments` row per step (assignee = a member),
  step 1 `pending`, rest `waiting`; sets file `pending`.
- `decide_approval` RPC (`0004`) advances/closes steps by the current assignee.
- Frontend: `approvals.ts` (`getApprovalPlan`, `approverChoices`, `createApprovalRequest`,
  `listToReview`, `decideApprovalStep`, `getRequestSteps`); `RequestApprovalDialog` in
  `Dialogs.tsx`; `ApprovalsPage` + `ApprovalTracker`.
- `organizations` RLS only exposes orgs the user belongs to (or system admin) → cross-office
  office list needs a SECURITY DEFINER RPC.
- File read for approvers handled by an approval-access policy (migration `0008`); must confirm
  it keys on `approval_step_assignments.assignee_id = auth.uid()` (works cross-org) or extend it.

## Architecture

### 1. Data (migration `0014_cross_office_approval.sql`)

- `alter table approval_requests add column target_org_id uuid references organizations(id)` (nullable; null = internal request). Keep `org_id` = the file's (owner's) org.
- Update `supabase/schema.sql` to match.

### 2. RPCs (SECURITY DEFINER, `grant execute ... to authenticated`)

- `list_approver_offices(p_exclude_org uuid)` → table `(id uuid, code text, name text, has_approver boolean)` for every org except `p_exclude_org`. `has_approver` = exists active member with role `approver`. Bypasses org-visibility RLS so a requester can see other office names.
- `request_cross_office_approval(p_file uuid, p_message text, p_target_org uuid)`:
  - Load file; authorize caller = file owner OR member/admin of file's org (mirror `request_approval`).
  - Require ≥1 active `approver` in `p_target_org`, else raise.
  - Insert `approval_requests` (`org_id` = file org, `target_org_id` = p_target_org, `current_step` = 1, status `pending`, message).
  - Insert one `approval_step_assignments` row (`step_no` 1, `position_id` null, status `pending`) per active approver of `p_target_org`. `org_id` on these rows = `p_target_org` (so the approving office owns the step).
  - Set file `status = 'pending'`. Return request id.
- `decide_approval` (modify `0004`): after recording the deciding assignee's decision for a step, set sibling rows of the **same request + same step_no** that are still `pending` (other approvers) to `skipped`, so the item leaves their queues. Existing single-assignee behavior is unchanged when there are no siblings.

### 3. RLS / access (Q3: view + comment, no download)

- **Approval rows:** confirm `approval_requests` / `approval_step_assignments` select policies let a row's assignee read it regardless of org (assignee-keyed). Extend if they are org-scoped.
- **File read:** ensure a user who is an assignee on a pending/any step of a request for the file can `select` the file and its `file_versions` current row — extend the migration-`0008` approval-access policy to key on `approval_step_assignments.assignee_id = auth.uid()` (cross-org safe).
- **Comments:** extend `file_comments` insert policy to also allow a current approval-step assignee of that file (so the external approver can comment). Select already allowed via file visibility.
- **No download:** external approver is neither owner nor sharee → existing download gates already hide it. No change.

### 4. Frontend

- `approvals.ts`:
  - `listApproverOffices(excludeOrgId)` → calls the RPC; returns `{ id, code, name, has_approver }[]`.
  - `createCrossOfficeRequest(file, targetOrgId, message)` → calls `request_cross_office_approval`; then notifies all active approvers of the target office (`type:'approval'`, link `/app/approvals`).
- `RequestApprovalDialog` (`Dialogs.tsx`): add a mode toggle **My office** (existing UI) / **Another office**. In "Another office" mode, render an office `<select>` populated by `listApproverOffices(file.org_id)`; options with `has_approver === false` are `disabled` with a hint. Submit → `createCrossOfficeRequest`.
- `ApprovalsPage` / `ApprovalTracker` / request rows: for requests with `target_org_id`, show the office label (code/name, e.g. "CCS") in place of a position name; indicate "Cross-office" on the requester's "My requests" view.
- `types.ts`: `ApprovalRequest` gains `target_org_id: string | null`; add an office-option type.

### 5. Notifications

- On request: notify every active approver of the target office.
- On decision: existing `decideApprovalStep` already notifies the requester; the sibling-close happens in the RPC so other approvers simply stop seeing it.

## Testing

- **Pure/unit (where extractable):** office-filter mapping (`has_approver`), and a helper that, given step assignments, computes which siblings to skip on a decision — Vitest.
- **Manual:** request approval to another office (with/without approver → disabled), external approver sees it in Approvals, can preview + comment, cannot download; first approver decides → file `approved`, request closes for other approvers; reject → `rejected`; requester notified.

## What does NOT change

Same-office approval (`request_approval`, internal chains, positions), release/archive/bin,
sharing tiers, preview.
