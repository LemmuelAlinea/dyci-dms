# Design Spec — Reports & Printable Registers

**Date:** 2026-06-18
**Project:** DYCI Document Management System
**Status:** Approved design → ready for implementation plan

---

## Context

The DYCI DMS holds rich data — documents with reference numbers and typed metadata, multi-step approvals, members/positions, storage — but nothing surfaces it as **reports**. Offices need printable registers and summaries for official record-keeping and oversight, and each user type needs a different view. This feature adds role-gated, **customizable, printable reports** for System Admin, Org Admin, Co-Admin, and Staff.

**Goal:** a Reports area where each role generates the reports relevant to them, customizes them with filters + column toggles (savable as presets), and prints a clean DYCI-letterhead PDF via the browser. Fully responsive (desktop/tablet/phone).

---

## Decisions (locked during brainstorming)

1. **Printable = browser print-to-PDF with a DYCI letterhead view** (CSS `@media print`); no server-side PDF generation.
2. **Customization = parameterized reports**: per-report filters + column show/hide toggles. (Not a full report builder.)
3. **Saved presets included**: a user can save a filter/column set under a name and re-run it later.
4. **Co-Admin = operational subset** of the office reports (no storage/sensitive-metadata reports).
5. **Responsive** across all screen sizes, matching the existing app patterns.

---

## Architecture

- **Office + platform reports** (Org Admin, Co-Admin, System Admin) are served by new **backend `/reports/*` endpoints** (Express on Railway, Supabase service role), each **authorizing by role**. This is required because a **Co-Admin cannot read other members' documents via RLS** (`files_select` grants office-wide read only to `is_org_admin`). Routing through the backend keeps the RLS access model unchanged (co-admins don't gain file read in the drive) and centralizes metadata aggregation/turnaround math.
- **Staff personal reports** use **client-side queries** (RLS already lets a user read their own files + approval requests) — lighter, no backend needed.
- **Presets** live in a new `report_presets` table managed client-side (RLS: own rows only).
- **Print** is pure frontend: a `ReportLayout` letterhead component + a print stylesheet; the **Print** button calls `window.print()`.

This mirrors the existing split (system-admin data via backend service role; member data via RLS).

---

## Where it lives

- **System Admin:** Admin console → **Reports** (`/admin/reports`).
- **Org members:** sidebar (Manage section) → **Reports** (`/app/reports`). The report list is filtered by the member's role: Admin = full office set, Co-Admin = operational subset, Staff = personal set.

---

## Report catalog

Each report lists its **filters** and **columns** (columns are individually toggle-able; numeric `money`/`number` columns show a **Total** row where noted).

### System Admin — platform (`/reports/admin/*`, requires `is_system_admin`)

1. **Platform Overview** — totals: organizations, users, documents, total storage; breakdown **by office type** (count + storage). Filter: optional date range (documents created within). Single-page printable summary.
2. **Organizations Directory** — table. Columns: code, name, office type, admin, members, storage used, quota, % used, # documents, created. Filter: office type.
3. **Storage Utilization** — table. Columns: office, used, quota, % used, health (Healthy/Moderate/Critical). Filters: office type, health band.
4. **Platform Activity Log** — recent actions across all offices (uploads, approvals, releases, member joins, org created). Columns: when, actor, action, target, office. Filters: date range, office, action type.

### Org Admin — office (`/reports/org/*`, requires org `admin`)

1. **Office Summary** — counts: members; documents total + by status; by category; by type; storage used/quota; released count; pending approvals. Filter: date range. Dashboard-style printable.
2. **Document Register** — table of every office document. Columns: reference no, title, type, category, owner, status, created, released. Filters: date range, status, type, category, owner. *(The core printable registry.)*
3. **Approval Report** — approval requests with turnaround. Columns: document, requester, current/last approver, status, requested, decided, **turnaround** (requested→final decision). Plus a **per-approver workload** sub-table (pending / approved counts, avg turnaround → bottlenecks). Filters: date range, status, approver.
4. **Member Activity** — per member. Columns: name, role, positions, # uploads, # approvals done, storage used, last active. Filter: date range.
5. **Released Papers Register** — released documents. Columns: reference, title, type, owner, approver, released date. Filters: date range, type, category.
6. **Document-Type Report** *(dynamic)* — pick a document type → table of its records using that type's **metadata fields as columns**, plus reference, owner, status, date. Numeric fields (`money`/`number`) get a **Total** row. Filters: date range, status. *(e.g., Disbursement Voucher → payee, amount, purpose, date + total amount.)*

### Co-Admin — office subset (`/reports/org/*` with co-admin authorization)

- **Document Register**, **Approval Report**, **Released Papers Register**, and **Member Directory** (members: name, email, role, positions, joined — **no** storage/activity columns).
- Backend **denies** co-admins the admin-only endpoints (Office Summary, Member Activity, Storage, Document-Type Report).

### Staff — personal (client-side, own data)

1. **My Documents** — my files. Columns: reference, title, type, status, created, released. Filters: date range, status, type.
2. **My Approval Requests** — requests I made. Columns: document, current approver, status, requested, decided, turnaround. Filters: date range, status.
3. **My Approval Queue** — documents awaiting **my** approval (I'm the current pending step assignee). Columns: document, requester, type, requested. Filter: type.
4. **My Released Papers** — my released documents. Columns: reference, title, type, approver, released date.

---

## Customization (filters, columns, presets)

- **Filters** per report as listed above. Common controls: **date range** (created or released), **status**, **document type**, **category**, **owner/member/approver** (where relevant).
- **Column toggles** — each report defines its available columns; the user shows/hides them. Hidden columns are excluded from screen and print.
- **Presets** — a **Save preset** action stores the current `{ filters, columns }` under a name; a preset dropdown loads it (re-running with fresh data) or deletes it. Presets are **per-user and per-report** (`report_key`), optionally scoped to the current org.

---

## Printable letterhead

A reusable `ReportLayout` renders the print view:
- **Header:** DYCI seal + "Dr. Yanga's Colleges, Inc." + "Bocaue, Bulacan" + (for office reports) the **office name & code**.
- **Title block:** report title · "Filters applied: …" · "Generated on {date} by {full name}".
- **Body:** the report table(s)/summary.
- **Footer:** small print note (e.g., system name + generated timestamp).

A **print stylesheet** (`@media print`) hides app chrome (`.no-print`: sidebar, topbar, filter panel, buttons) and lays the report out at A4-friendly width. The **Print / Save as PDF** button calls `window.print()`.

---

## Data model & endpoints

**New table**
- `report_presets` — `id, user_id (→profiles), org_id (→organizations, nullable), report_key text, name text, params jsonb, created_at`. RLS: a user selects/inserts/updates/deletes only rows where `user_id = auth.uid()`.

**New backend endpoints** (all verify the Supabase JWT, then authorize by role, then query with the service role)
- `GET /reports/admin/overview` · `/reports/admin/organizations` · `/reports/admin/storage` · `/reports/admin/activity` — require `is_system_admin`.
- `GET /reports/org/:orgId/summary` · `/documents` · `/approvals` · `/members` · `/released` · `/by-type` — require the caller be `admin` of that org; the **co-admin-allowed** subset (`/documents`, `/approvals`, `/released`, `/members-directory`) also accepts `co_admin`. Endpoints take filter query params.

**Client-side** (staff): functions in a `reports` lib querying `files` / `approval_requests` / `approval_step_assignments` for the current user via RLS.

---

## Responsive

- Reports **landing** = cards (one per available report), 1/2/3 columns by breakpoint.
- **Filter panel**: inline on desktop; collapses into an accordion/sheet on phones (a "Filters" button toggles it).
- **Tables**: `overflow-x-auto` on small screens; the densest reports may stack into cards under a breakpoint.
- **Print** view is fixed A4 width regardless of device, so a phone can still produce a proper printout/PDF.

---

## Phasing (decomposed like the org-types upgrade)

1. **Plan 1 — Foundation:** Reports landing pages (role-gated) at `/app/reports` and `/admin/reports`; `ReportLayout` letterhead + print CSS; the filter-panel + column-toggle framework; `report_presets` table + lib + save/load/delete UI; backend `/reports` router scaffolding + role authorization helpers. Ships with **one simple end-to-end report** (e.g., Staff "My Documents") to prove the whole pipeline.
2. **Plan 2 — Staff personal reports** (client-side): the remaining three.
3. **Plan 3 — Org Admin + Co-Admin office reports** (backend): the office set with co-admin subset authorization.
4. **Plan 4 — System Admin platform reports** (backend): the platform set.

---

## Success criteria

- Each role sees **only** its permitted reports; co-admins are blocked (backend) from admin-only office reports.
- Every report supports its defined **filters** + **column toggles**; results are correct and RLS/role-scoped.
- **Presets** save, load, and delete per user/report.
- **Print** produces a clean DYCI-letterhead document (screen chrome stripped) that saves as PDF from any browser.
- The **Document-Type Report** renders a type's metadata fields as columns with numeric totals.
- Reports are usable and readable on **desktop, tablet, and phone**.
