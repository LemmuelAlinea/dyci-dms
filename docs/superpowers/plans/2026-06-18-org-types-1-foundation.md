# Office Org Types — Plan 1: Foundation (Data Model, Templates, Instantiation, Migration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every organization an **Org Type** with a seeded, copied-in config (categories, positions, document types + fields + reference formats + approval chains), add the multi-step approval tables, and migrate existing orgs to the General type — without breaking current behavior.

**Architecture:** New Postgres tables hold each org's *own* copy of its type's config. Templates live as typed data in the backend; a service-role **instantiation** function copies a template into an org at creation time (via a new `POST /admin/organizations` endpoint). Pure logic (reference formatting, template validation) is unit-tested with Vitest; SQL is applied in Supabase and verified by inspection.

**Tech Stack:** Supabase Postgres + RLS, Node/Express + TypeScript (backend), React + Vite + TypeScript (frontend), Vitest (new, backend tests).

**Spec:** `docs/superpowers/specs/2026-06-18-office-org-types-design.md`

**This plan is Plan 1 of 6.** Subsequent plans (written later): 2) Positions & member assignment UI · 3) Document types, reference numbers, dynamic upload form & file metadata · 4) Multi-step approval engine & progress tracker · 5) Org-Admin "Document Types & Approvals" settings · 6) Search/filter by metadata & display polish.

---

## File structure (Plan 1)

- `supabase/migrations/0001_org_types.sql` — **create**: all new tables, columns, RLS, indexes (idempotent, paste-into-SQL-editor style like `schema.sql`).
- `supabase/migrations/0002_migrate_general.sql` — **create**: backfill existing orgs to `general`, migrate existing approvals.
- `backend/src/templates/types.ts` — **create**: TypeScript types for templates (`FieldDef`, `DocTypeTemplate`, `OrgTemplate`).
- `backend/src/templates/catalog.ts` — **create**: the 7 org-type templates (seed data from spec Appendix A).
- `backend/src/templates/catalog.test.ts` — **create**: Vitest validation of catalog integrity.
- `backend/src/lib/reference.ts` — **create**: reference-number format helper.
- `backend/src/lib/reference.test.ts` — **create**: Vitest tests for the formatter.
- `backend/src/lib/instantiateTemplate.ts` — **create**: copies a template into an org (service role).
- `backend/src/routes/admin.ts` — **modify**: add `POST /admin/organizations` (create org + instantiate template + assign admin).
- `backend/package.json` — **modify**: add Vitest + test script.
- `backend/vitest.config.ts` — **create**: Vitest config.
- `frontend/src/lib/types.ts` — **modify**: add `OrgType`, extend `Organization` with `type`.
- `frontend/src/lib/admin.ts` — **modify**: `createOrganization` now calls the backend endpoint and passes `type`.
- `frontend/src/lib/api.ts` — **modify**: add `createOrganization` API method.
- `frontend/src/features/system-admin/OrganizationsPage.tsx` — **modify**: add Org Type picker to the Create dialog.

---

### Task 1: Add Vitest to the backend

**Files:**
- Modify: `backend/package.json`
- Create: `backend/vitest.config.ts`

- [ ] **Step 1: Add Vitest dependency and test script**

In `backend/package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

Add to `"devDependencies"`:

```json
    "vitest": "^2.1.1"
```

- [ ] **Step 2: Create Vitest config**

Create `backend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Install**

Run: `cd backend && npm install`
Expected: installs `vitest` with no errors.

- [ ] **Step 4: Sanity check the runner**

Run: `cd backend && npm test`
Expected: Vitest runs and reports "No test files found" (or 0 tests) — confirms the runner works.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/vitest.config.ts
git commit -m "chore(backend): add vitest test runner"
```

---

### Task 2: Database schema — new tables, columns, RLS

**Files:**
- Create: `supabase/migrations/0001_org_types.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0001_org_types.sql` with the full content below. It is idempotent and follows the patterns in `supabase/schema.sql` (same RLS helpers).

```sql
-- ============================================================================
-- Org Types — Plan 1 schema additions. Paste into Supabase SQL Editor and run.
-- Safe to re-run.
-- ============================================================================

-- 1) Org type on organizations
alter table public.organizations add column if not exists type text not null default 'general';

-- 2) Categories
create table if not exists public.categories (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_org on public.categories(org_id);

-- 3) Positions
create table if not exists public.positions (
  id     uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name   text not null,
  sort   int not null default 0
);
create index if not exists idx_positions_org on public.positions(org_id);

-- 4) Member ↔ position
create table if not exists public.member_positions (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  unique (position_id, user_id)
);
create index if not exists idx_member_positions_user on public.member_positions(user_id);
create index if not exists idx_member_positions_pos  on public.member_positions(position_id);

-- 5) Document types (each carries its own fields/chain config — the org's copy)
create table if not exists public.document_types (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  category_id      uuid references public.categories(id) on delete set null,
  name             text not null,
  icon             text not null default 'file',
  color            text not null default 'slate',
  reference_format text not null default 'DOC-{YYYY}-{seq}',
  publishable      boolean not null default true,
  fields           jsonb not null default '[]'::jsonb,
  active           boolean not null default true,
  sort             int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists idx_doctypes_org on public.document_types(org_id);

-- 6) Ordered approval chain steps per document type
create table if not exists public.document_type_steps (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  document_type_id uuid not null references public.document_types(id) on delete cascade,
  step_no          int not null,
  position_id      uuid not null references public.positions(id) on delete cascade,
  unique (document_type_id, step_no)
);
create index if not exists idx_doctype_steps_dt on public.document_type_steps(document_type_id);

-- 7) Per-(org, document_type, year) reference counter
create table if not exists public.reference_counters (
  org_id           uuid not null references public.organizations(id) on delete cascade,
  document_type_id uuid not null references public.document_types(id) on delete cascade,
  year             int not null,
  last_seq         int not null default 0,
  primary key (org_id, document_type_id, year)
);

-- 8) File tagging columns
alter table public.files add column if not exists document_type_id uuid references public.document_types(id) on delete set null;
alter table public.files add column if not exists category_id      uuid references public.categories(id) on delete set null;
alter table public.files add column if not exists reference_no     text;
alter table public.files add column if not exists metadata         jsonb not null default '{}'::jsonb;

-- 9) Multi-step approval requests
create table if not exists public.approval_requests (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  file_id          uuid not null references public.files(id) on delete cascade,
  document_type_id uuid references public.document_types(id) on delete set null,
  version_no       int not null default 1,
  requester_id     uuid not null references public.profiles(id) on delete cascade,
  status           approval_status not null default 'pending',
  current_step     int not null default 1,
  message          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_areq_file on public.approval_requests(file_id);
create index if not exists idx_areq_requester on public.approval_requests(requester_id);

-- 10) Ordered step assignments (who approves each step)
create table if not exists public.approval_step_assignments (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  request_id  uuid not null references public.approval_requests(id) on delete cascade,
  step_no     int not null,
  position_id uuid references public.positions(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete set null,
  status      text not null default 'waiting',  -- waiting | pending | approved | rejected
  decided_at  timestamptz,
  unique (request_id, step_no)
);
create index if not exists idx_asa_request on public.approval_step_assignments(request_id);
create index if not exists idx_asa_assignee on public.approval_step_assignments(assignee_id);

-- 11) Point approval comments at the new request (keep old column for back-compat)
alter table public.approval_comments add column if not exists request_id uuid references public.approval_requests(id) on delete cascade;
create index if not exists idx_comments_request on public.approval_comments(request_id);

-- updated_at trigger for approval_requests
drop trigger if exists trg_touch_areq on public.approval_requests;
create trigger trg_touch_areq before update on public.approval_requests
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.categories                enable row level security;
alter table public.positions                 enable row level security;
alter table public.member_positions          enable row level security;
alter table public.document_types            enable row level security;
alter table public.document_type_steps       enable row level security;
alter table public.reference_counters        enable row level security;
alter table public.approval_requests         enable row level security;
alter table public.approval_step_assignments enable row level security;

-- Config tables: readable by org members, writable by org admin or system admin
do $$
declare t text;
begin
  foreach t in array array['categories','positions','document_types','document_type_steps','member_positions'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format('create policy %1$s_select on public.%1$s for select using (is_system_admin() or is_org_member(org_id));', t);
    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format('create policy %1$s_write on public.%1$s for all using (is_system_admin() or is_org_admin(org_id)) with check (is_system_admin() or is_org_admin(org_id));', t);
  end loop;
end $$;

-- reference_counters: only service role / triggers touch this; allow select to members
drop policy if exists refcounters_select on public.reference_counters;
create policy refcounters_select on public.reference_counters for select using (is_org_member(org_id));

-- approval_requests
drop policy if exists areq_select on public.approval_requests;
create policy areq_select on public.approval_requests for select using (
  requester_id = auth.uid() or is_org_admin(org_id)
  or exists (select 1 from public.approval_step_assignments a where a.request_id = approval_requests.id and a.assignee_id = auth.uid())
);
drop policy if exists areq_insert on public.approval_requests;
create policy areq_insert on public.approval_requests for insert with check (is_org_member(org_id) and requester_id = auth.uid());
drop policy if exists areq_update on public.approval_requests;
create policy areq_update on public.approval_requests for update using (
  is_org_admin(org_id)
  or exists (select 1 from public.approval_step_assignments a where a.request_id = approval_requests.id and a.assignee_id = auth.uid())
);

-- approval_step_assignments (visible iff parent request visible)
drop policy if exists asa_select on public.approval_step_assignments;
create policy asa_select on public.approval_step_assignments for select using (
  exists (select 1 from public.approval_requests r where r.id = approval_step_assignments.request_id)
);
drop policy if exists asa_update on public.approval_step_assignments;
create policy asa_update on public.approval_step_assignments for update using (
  assignee_id = auth.uid() or is_org_admin(org_id)
);
drop policy if exists asa_insert on public.approval_step_assignments;
create policy asa_insert on public.approval_step_assignments for insert with check (is_org_member(org_id));

-- approval_comments via request (participants)
drop policy if exists comments_select_req on public.approval_comments;
create policy comments_select_req on public.approval_comments for select using (
  approval_id is not null and exists (select 1 from public.approvals a where a.id = approval_comments.approval_id)
  or request_id is not null and exists (select 1 from public.approval_requests r where r.id = approval_comments.request_id)
);
```

- [ ] **Step 2: Apply it in Supabase**

Open the Supabase dashboard → SQL Editor → New query → paste the entire file → **Run**.
Expected: "Success. No rows returned." Re-running must also succeed (idempotent).

- [ ] **Step 3: Verify the tables exist**

In SQL Editor run:

```sql
select table_name from information_schema.tables
where table_schema='public'
  and table_name in ('categories','positions','member_positions','document_types','document_type_steps','reference_counters','approval_requests','approval_step_assignments')
order by table_name;
```

Expected: all 8 rows returned. Also confirm `select type from public.organizations limit 1;` works.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_org_types.sql
git commit -m "feat(db): add org-type config + multi-step approval schema"
```

---

### Task 3: Template TypeScript types

**Files:**
- Create: `backend/src/templates/types.ts`

- [ ] **Step 1: Define the template types**

Create `backend/src/templates/types.ts`:

```ts
export type FieldType = 'text' | 'longtext' | 'number' | 'money' | 'date' | 'dropdown' | 'yesno';

export interface FieldDef {
  key: string;        // stable key stored in file.metadata
  label: string;      // shown on the form
  type: FieldType;
  required?: boolean;
  options?: string[]; // for 'dropdown'
}

export interface DocTypeTemplate {
  name: string;
  category: string;        // must match one of OrgTemplate.categories
  icon: string;            // lucide-ish name (display)
  color: string;           // tailwind color token, e.g. 'rose'
  referenceFormat: string; // e.g. 'GRD-{YYYY}-{seq}'
  publishable: boolean;
  fields: FieldDef[];
  chain: string[];         // ordered position names; [] = no approval step
}

export interface OrgTemplate {
  type: string;            // 'college' | 'registrar' | ...
  label: string;           // human label
  positions: string[];     // position names this office uses
  categories: string[];    // ordered category names
  documentTypes: DocTypeTemplate[];
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/templates/types.ts
git commit -m "feat(templates): add template type definitions"
```

---

### Task 4: The 7 org-type templates (seed catalog)

**Files:**
- Create: `backend/src/templates/catalog.ts`

- [ ] **Step 1: Write the catalog**

Create `backend/src/templates/catalog.ts` with all 7 templates from spec Appendix A. (Fields abbreviated to the spec's lists; `chain` uses position names.)

```ts
import type { OrgTemplate } from './types.js';

const term = (required = true) => ({ key: 'term', label: 'Term', type: 'dropdown' as const, required, options: ['1st Semester', '2nd Semester', 'Summer'] });
const sy = (required = true) => ({ key: 'school_year', label: 'School Year', type: 'text' as const, required });
const studentName = { key: 'student_name', label: 'Student Name', type: 'text' as const, required: true };
const studentNo = { key: 'student_no', label: 'Student No.', type: 'text' as const, required: true };

export const TEMPLATES: Record<string, OrgTemplate> = {
  college: {
    type: 'college', label: 'College / Academic Office',
    positions: ['Faculty', 'Program Chair', 'Dean'],
    categories: ['Grades & Assessment', 'Curriculum', 'Faculty', 'Scheduling', 'Research', 'Memos & Reports'],
    documentTypes: [
      { name: 'Grade Sheet', category: 'Grades & Assessment', icon: 'sheet', color: 'emerald', referenceFormat: 'GRD-{YYYY}-{seq}', publishable: false,
        fields: [{ key: 'subject', label: 'Subject', type: 'text', required: true }, { key: 'course_code', label: 'Course Code', type: 'text', required: true }, { key: 'section', label: 'Section', type: 'text', required: true }, term(), sy(), { key: 'students', label: '# Students', type: 'number' }], chain: ['Program Chair', 'Dean'] },
      { name: 'Table of Specifications', category: 'Grades & Assessment', icon: 'sheet', color: 'emerald', referenceFormat: 'TOS-{YYYY}-{seq}', publishable: false,
        fields: [{ key: 'subject', label: 'Subject', type: 'text', required: true }, term(), sy()], chain: ['Program Chair', 'Dean'] },
      { name: 'Exam Paper', category: 'Grades & Assessment', icon: 'file', color: 'rose', referenceFormat: 'EXM-{YYYY}-{seq}', publishable: false,
        fields: [{ key: 'subject', label: 'Subject', type: 'text', required: true }, { key: 'exam_type', label: 'Exam Type', type: 'dropdown', required: true, options: ['Prelim', 'Midterm', 'Final'] }, term()], chain: ['Program Chair', 'Dean'] },
      { name: 'Syllabus', category: 'Curriculum', icon: 'doc', color: 'blue', referenceFormat: 'SYL-{YYYY}-{seq}', publishable: true,
        fields: [{ key: 'course_code', label: 'Course Code', type: 'text', required: true }, { key: 'course_title', label: 'Course Title', type: 'text', required: true }, { key: 'units', label: 'Units', type: 'number' }, term(), sy()], chain: ['Dean'] },
      { name: 'Curriculum Map', category: 'Curriculum', icon: 'doc', color: 'blue', referenceFormat: 'CMAP-{YYYY}-{seq}', publishable: true,
        fields: [{ key: 'program', label: 'Program', type: 'text', required: true }, sy()], chain: ['Program Chair', 'Dean'] },
      { name: 'Faculty Loading', category: 'Faculty', icon: 'sheet', color: 'emerald', referenceFormat: 'LOAD-{YYYY}-{seq}', publishable: false,
        fields: [{ key: 'faculty', label: 'Faculty', type: 'text', required: true }, term(), sy(), { key: 'units', label: 'Total Units', type: 'number' }], chain: ['Dean'] },
      { name: 'Faculty Clearance', category: 'Faculty', icon: 'doc', color: 'slate', referenceFormat: 'CLR-{YYYY}-{seq}', publishable: false,
        fields: [{ key: 'faculty', label: 'Faculty', type: 'text', required: true }, term()], chain: ['Dean'] },
      { name: 'Class Schedule', category: 'Scheduling', icon: 'sheet', color: 'emerald', referenceFormat: 'SCHED-{YYYY}-{seq}', publishable: true,
        fields: [{ key: 'program', label: 'Program', type: 'text', required: true }, term(), sy()], chain: ['Program Chair', 'Dean'] },
      { name: 'Capstone / Thesis', category: 'Research', icon: 'doc', color: 'indigo', referenceFormat: 'RES-{YYYY}-{seq}', publishable: true,
        fields: [{ key: 'title', label: 'Title', type: 'text', required: true }, { key: 'authors', label: 'Authors', type: 'text', required: true }, { key: 'adviser', label: 'Adviser', type: 'text' }, { key: 'program', label: 'Program', type: 'text' }, sy()], chain: ['Program Chair', 'Dean'] },
      { name: 'Memo', category: 'Memos & Reports', icon: 'doc', color: 'navy', referenceFormat: 'MEMO-{YYYY}-{seq}', publishable: true,
        fields: [{ key: 'subject', label: 'Subject', type: 'text', required: true }, { key: 'date', label: 'Date', type: 'date' }], chain: ['Dean'] },
      { name: 'Report', category: 'Memos & Reports', icon: 'doc', color: 'navy', referenceFormat: 'RPT-{YYYY}-{seq}', publishable: true,
        fields: [{ key: 'title', label: 'Title', type: 'text', required: true }, { key: 'period', label: 'Period', type: 'text' }], chain: ['Dean'] },
    ],
  },

  registrar: {
    type: 'registrar', label: "Registrar's Office",
    positions: ['Records Staff', 'Asst. Registrar', 'Registrar'],
    categories: ['Student Records', 'Certifications', 'Enrollment', 'Grades Consolidation', 'Credentials'],
    documentTypes: [
      { name: 'Transcript of Records', category: 'Student Records', icon: 'doc', color: 'navy', referenceFormat: 'TOR-{YYYY}-{seq}', publishable: false, fields: [studentName, studentNo, { key: 'program', label: 'Program', type: 'text' }, { key: 'purpose', label: 'Purpose', type: 'text' }], chain: ['Asst. Registrar', 'Registrar'] },
      { name: 'Form 137/138', category: 'Student Records', icon: 'doc', color: 'navy', referenceFormat: 'F137-{YYYY}-{seq}', publishable: false, fields: [studentName, studentNo, { key: 'level', label: 'Level', type: 'text' }], chain: ['Registrar'] },
      { name: 'Certificate of Enrollment', category: 'Certifications', icon: 'doc', color: 'blue', referenceFormat: 'COE-{YYYY}-{seq}', publishable: false, fields: [studentName, studentNo, term(), sy()], chain: ['Registrar'] },
      { name: 'Certificate of Grades', category: 'Certifications', icon: 'doc', color: 'blue', referenceFormat: 'COG-{YYYY}-{seq}', publishable: false, fields: [studentName, studentNo, term()], chain: ['Registrar'] },
      { name: 'CAV / Authentication', category: 'Certifications', icon: 'doc', color: 'blue', referenceFormat: 'CAV-{YYYY}-{seq}', publishable: false, fields: [studentName, { key: 'purpose', label: 'Purpose', type: 'text' }], chain: ['Registrar'] },
      { name: 'Enrollment List', category: 'Enrollment', icon: 'sheet', color: 'emerald', referenceFormat: 'ENL-{YYYY}-{seq}', publishable: true, fields: [{ key: 'program', label: 'Program', type: 'text', required: true }, term(), sy()], chain: ['Asst. Registrar', 'Registrar'] },
      { name: 'Dropping/Adding/Shifting', category: 'Enrollment', icon: 'doc', color: 'slate', referenceFormat: 'DAS-{YYYY}-{seq}', publishable: false, fields: [studentName, studentNo, { key: 'kind', label: 'Type', type: 'dropdown', options: ['Drop', 'Add', 'Shift'], required: true }], chain: ['Registrar'] },
      { name: 'Consolidated Grades', category: 'Grades Consolidation', icon: 'sheet', color: 'emerald', referenceFormat: 'CGR-{YYYY}-{seq}', publishable: false, fields: [{ key: 'program', label: 'Program', type: 'text', required: true }, term(), sy()], chain: ['Asst. Registrar', 'Registrar'] },
      { name: 'Diploma', category: 'Credentials', icon: 'doc', color: 'gold', referenceFormat: 'DIP-{YYYY}-{seq}', publishable: false, fields: [studentName, { key: 'program', label: 'Program', type: 'text' }, { key: 'date_graduated', label: 'Date Graduated', type: 'date' }], chain: ['Registrar'] },
    ],
  },

  hr: {
    type: 'hr', label: 'HR Office',
    positions: ['HR Officer', 'HR Head'],
    categories: ['201 Files', 'Contracts & Appointments', 'Leave & Attendance', 'Performance', 'Recruitment', 'Compliance', 'Memos'],
    documentTypes: [
      { name: 'Employee 201', category: '201 Files', icon: 'doc', color: 'navy', referenceFormat: '201-{YYYY}-{seq}', publishable: false, fields: [{ key: 'employee', label: 'Employee Name', type: 'text', required: true }, { key: 'position', label: 'Position', type: 'text' }, { key: 'department', label: 'Department', type: 'text' }, { key: 'date_hired', label: 'Date Hired', type: 'date' }], chain: ['HR Head'] },
      { name: 'Employment Contract', category: 'Contracts & Appointments', icon: 'doc', color: 'blue', referenceFormat: 'CON-{YYYY}-{seq}', publishable: false, fields: [{ key: 'employee', label: 'Employee Name', type: 'text', required: true }, { key: 'position', label: 'Position', type: 'text' }, { key: 'contract_type', label: 'Contract Type', type: 'dropdown', options: ['Regular', 'Probationary', 'Part-time'] }, { key: 'effective_date', label: 'Effective Date', type: 'date' }, { key: 'end_date', label: 'End Date', type: 'date' }], chain: ['HR Head'] },
      { name: 'Appointment Letter', category: 'Contracts & Appointments', icon: 'doc', color: 'blue', referenceFormat: 'APPT-{YYYY}-{seq}', publishable: false, fields: [{ key: 'employee', label: 'Employee Name', type: 'text', required: true }, { key: 'position', label: 'Position', type: 'text' }, { key: 'effective_date', label: 'Effective Date', type: 'date' }], chain: ['HR Head'] },
      { name: 'Leave Form', category: 'Leave & Attendance', icon: 'doc', color: 'slate', referenceFormat: 'LV-{YYYY}-{seq}', publishable: false, fields: [{ key: 'employee', label: 'Employee', type: 'text', required: true }, { key: 'leave_type', label: 'Leave Type', type: 'dropdown', options: ['Vacation', 'Sick', 'Emergency', 'Maternity', 'Other'], required: true }, { key: 'from', label: 'From', type: 'date' }, { key: 'to', label: 'To', type: 'date' }, { key: 'days', label: '# Days', type: 'number' }], chain: ['HR Head'] },
      { name: 'Performance Appraisal', category: 'Performance', icon: 'doc', color: 'indigo', referenceFormat: 'PA-{YYYY}-{seq}', publishable: false, fields: [{ key: 'employee', label: 'Employee', type: 'text', required: true }, { key: 'period', label: 'Period', type: 'text' }, { key: 'rating', label: 'Rating', type: 'text' }], chain: ['HR Head'] },
      { name: 'Job Posting', category: 'Recruitment', icon: 'doc', color: 'emerald', referenceFormat: 'JOB-{YYYY}-{seq}', publishable: true, fields: [{ key: 'position', label: 'Position', type: 'text', required: true }, { key: 'department', label: 'Department', type: 'text' }, { key: 'date', label: 'Date', type: 'date' }], chain: ['HR Head'] },
      { name: 'Application', category: 'Recruitment', icon: 'doc', color: 'slate', referenceFormat: 'APP-{YYYY}-{seq}', publishable: false, fields: [{ key: 'applicant', label: 'Applicant', type: 'text', required: true }, { key: 'position', label: 'Position', type: 'text' }], chain: ['HR Officer', 'HR Head'] },
      { name: 'Government Remittance', category: 'Compliance', icon: 'sheet', color: 'emerald', referenceFormat: 'GOV-{YYYY}-{seq}', publishable: false, fields: [{ key: 'kind', label: 'Type', type: 'dropdown', options: ['SSS', 'PhilHealth', 'Pag-IBIG', 'BIR'], required: true }, { key: 'period', label: 'Period', type: 'text' }, { key: 'amount', label: 'Amount', type: 'money' }], chain: ['HR Head'] },
      { name: 'Memo / Circular', category: 'Memos', icon: 'doc', color: 'navy', referenceFormat: 'MEMO-{YYYY}-{seq}', publishable: true, fields: [{ key: 'subject', label: 'Subject', type: 'text', required: true }, { key: 'date', label: 'Date', type: 'date' }], chain: ['HR Head'] },
    ],
  },

  finance: {
    type: 'finance', label: 'Finance / Accounting Office',
    positions: ['Cashier/Bookkeeper', 'Accountant', 'Finance Head', 'President'],
    categories: ['Disbursements', 'Purchasing', 'Budget', 'Collections', 'Payroll', 'Financial Statements & Audit'],
    documentTypes: [
      { name: 'Disbursement Voucher', category: 'Disbursements', icon: 'sheet', color: 'rose', referenceFormat: 'VCHR-{YYYY}-{seq}', publishable: false, fields: [{ key: 'payee', label: 'Payee', type: 'text', required: true }, { key: 'amount', label: 'Amount', type: 'money', required: true }, { key: 'purpose', label: 'Purpose', type: 'text' }, { key: 'budget_line', label: 'Budget Line', type: 'text' }, { key: 'date_needed', label: 'Date Needed', type: 'date' }], chain: ['Accountant', 'Finance Head', 'President'] },
      { name: 'Reimbursement', category: 'Disbursements', icon: 'sheet', color: 'rose', referenceFormat: 'REIMB-{YYYY}-{seq}', publishable: false, fields: [{ key: 'payee', label: 'Payee', type: 'text', required: true }, { key: 'amount', label: 'Amount', type: 'money', required: true }, { key: 'purpose', label: 'Purpose', type: 'text' }], chain: ['Accountant', 'Finance Head'] },
      { name: 'Liquidation Report', category: 'Disbursements', icon: 'sheet', color: 'rose', referenceFormat: 'LIQ-{YYYY}-{seq}', publishable: false, fields: [{ key: 'payee', label: 'Payee', type: 'text', required: true }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'ref_voucher', label: 'Reference Voucher', type: 'text' }], chain: ['Accountant', 'Finance Head'] },
      { name: 'Purchase Request', category: 'Purchasing', icon: 'doc', color: 'blue', referenceFormat: 'PR-{YYYY}-{seq}', publishable: false, fields: [{ key: 'requested_by', label: 'Requested By', type: 'text', required: true }, { key: 'items', label: 'Items', type: 'longtext' }, { key: 'amount', label: 'Estimated Amount', type: 'money' }], chain: ['Accountant', 'Finance Head'] },
      { name: 'Purchase Order', category: 'Purchasing', icon: 'doc', color: 'blue', referenceFormat: 'PO-{YYYY}-{seq}', publishable: false, fields: [{ key: 'supplier', label: 'Supplier', type: 'text', required: true }, { key: 'amount', label: 'Total Amount', type: 'money', required: true }, { key: 'pr_ref', label: 'PR Reference', type: 'text' }], chain: ['Finance Head', 'President'] },
      { name: 'Budget Proposal', category: 'Budget', icon: 'sheet', color: 'gold', referenceFormat: 'BUD-{YYYY}-{seq}', publishable: false, fields: [{ key: 'department', label: 'Department', type: 'text', required: true }, { key: 'period', label: 'Period', type: 'text' }, { key: 'amount', label: 'Total Amount', type: 'money' }], chain: ['Finance Head', 'President'] },
      { name: 'Official Receipt', category: 'Collections', icon: 'doc', color: 'emerald', referenceFormat: 'OR-{YYYY}-{seq}', publishable: false, fields: [{ key: 'payer', label: 'Payer', type: 'text', required: true }, { key: 'amount', label: 'Amount', type: 'money', required: true }, { key: 'purpose', label: 'Purpose', type: 'text' }], chain: ['Accountant'] },
      { name: 'Statement of Account', category: 'Collections', icon: 'sheet', color: 'emerald', referenceFormat: 'SOA-{YYYY}-{seq}', publishable: false, fields: [{ key: 'client', label: 'Student/Client', type: 'text', required: true }, { key: 'amount', label: 'Amount Due', type: 'money' }], chain: ['Accountant'] },
      { name: 'Payroll', category: 'Payroll', icon: 'sheet', color: 'rose', referenceFormat: 'PAY-{YYYY}-{seq}', publishable: false, fields: [{ key: 'period', label: 'Period', type: 'text', required: true }, { key: 'amount', label: 'Total Amount', type: 'money' }, { key: 'employees', label: '# Employees', type: 'number' }], chain: ['Accountant', 'Finance Head'] },
      { name: 'Financial Statement', category: 'Financial Statements & Audit', icon: 'sheet', color: 'gold', referenceFormat: 'FS-{YYYY}-{seq}', publishable: false, fields: [{ key: 'period', label: 'Period', type: 'text', required: true }, { key: 'kind', label: 'Type', type: 'dropdown', options: ['Income', 'Balance Sheet', 'Cash Flow'] }], chain: ['Finance Head', 'President'] },
    ],
  },

  osa: {
    type: 'osa', label: 'Office of Student Affairs',
    positions: ['OSA Staff', 'OSA Director'],
    categories: ['Activities & Permits', 'Student Organizations', 'Discipline', 'Scholarships', 'Events Documentation', 'Policies'],
    documentTypes: [
      { name: 'Activity Proposal / Permit', category: 'Activities & Permits', icon: 'doc', color: 'blue', referenceFormat: 'ACT-{YYYY}-{seq}', publishable: true, fields: [{ key: 'title', label: 'Activity Title', type: 'text', required: true }, { key: 'org', label: 'Organization', type: 'text' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'venue', label: 'Venue', type: 'text' }, { key: 'attendees', label: 'Expected Attendees', type: 'number' }], chain: ['OSA Director'] },
      { name: 'Org Accreditation', category: 'Student Organizations', icon: 'doc', color: 'indigo', referenceFormat: 'ORG-{YYYY}-{seq}', publishable: true, fields: [{ key: 'org_name', label: 'Org Name', type: 'text', required: true }, { key: 'adviser', label: 'Adviser', type: 'text' }, sy()], chain: ['OSA Director'] },
      { name: 'Incident / Violation Report', category: 'Discipline', icon: 'doc', color: 'rose', referenceFormat: 'INC-{YYYY}-{seq}', publishable: false, fields: [studentName, studentNo, { key: 'violation', label: 'Violation', type: 'longtext' }, { key: 'date', label: 'Date', type: 'date' }], chain: ['OSA Director'] },
      { name: 'Scholarship Record', category: 'Scholarships', icon: 'doc', color: 'gold', referenceFormat: 'SCH-{YYYY}-{seq}', publishable: false, fields: [studentName, { key: 'scholarship_type', label: 'Scholarship Type', type: 'dropdown', options: ['Academic', 'Athletic', 'Financial', 'Other'] }, sy()], chain: ['OSA Director'] },
      { name: 'Event Documentation', category: 'Events Documentation', icon: 'doc', color: 'emerald', referenceFormat: 'EVT-{YYYY}-{seq}', publishable: true, fields: [{ key: 'event', label: 'Event', type: 'text', required: true }, { key: 'date', label: 'Date', type: 'date' }], chain: ['OSA Director'] },
      { name: 'Handbook / Policy', category: 'Policies', icon: 'doc', color: 'navy', referenceFormat: 'POL-{YYYY}-{seq}', publishable: true, fields: [{ key: 'title', label: 'Title', type: 'text', required: true }, { key: 'version', label: 'Version', type: 'text' }], chain: ['OSA Director'] },
    ],
  },

  guidance: {
    type: 'guidance', label: 'Guidance Office',
    positions: ['Counselor', 'Guidance Head'],
    categories: ['Counseling Records', 'Assessments/Testing', 'Certificates', 'Referrals', 'Student Profiles'],
    documentTypes: [
      { name: 'Anecdotal / Counseling Record', category: 'Counseling Records', icon: 'doc', color: 'rose', referenceFormat: 'CR-{YYYY}-{seq}', publishable: false, fields: [studentName, studentNo, { key: 'date', label: 'Date', type: 'date' }, { key: 'counselor', label: 'Counselor', type: 'text' }], chain: ['Guidance Head'] },
      { name: 'Psychological Test Result', category: 'Assessments/Testing', icon: 'sheet', color: 'indigo', referenceFormat: 'PSY-{YYYY}-{seq}', publishable: false, fields: [studentName, studentNo, { key: 'test', label: 'Test', type: 'text' }, { key: 'date', label: 'Date', type: 'date' }], chain: ['Guidance Head'] },
      { name: 'Good Moral Certificate', category: 'Certificates', icon: 'doc', color: 'gold', referenceFormat: 'GM-{YYYY}-{seq}', publishable: false, fields: [studentName, studentNo, { key: 'purpose', label: 'Purpose', type: 'text' }], chain: ['Guidance Head'] },
      { name: 'Referral Form', category: 'Referrals', icon: 'doc', color: 'blue', referenceFormat: 'REF-{YYYY}-{seq}', publishable: false, fields: [studentName, { key: 'referred_by', label: 'Referred By', type: 'text' }, { key: 'reason', label: 'Reason', type: 'longtext' }], chain: ['Guidance Head'] },
      { name: 'Student Profile', category: 'Student Profiles', icon: 'doc', color: 'navy', referenceFormat: 'PROF-{YYYY}-{seq}', publishable: false, fields: [studentName, studentNo, { key: 'program', label: 'Program', type: 'text' }], chain: ['Guidance Head'] },
    ],
  },

  general: {
    type: 'general', label: 'General Office',
    positions: ['Approver'],
    categories: ['Documents'],
    documentTypes: [
      { name: 'Document', category: 'Documents', icon: 'doc', color: 'slate', referenceFormat: 'DOC-{YYYY}-{seq}', publishable: true, fields: [{ key: 'title', label: 'Title', type: 'text' }], chain: [] },
    ],
  },
};

export const ORG_TYPE_OPTIONS = Object.values(TEMPLATES).map((t) => ({ value: t.type, label: t.label }));
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/templates/catalog.ts
git commit -m "feat(templates): add 7 org-type seed catalogs"
```

---

### Task 5: Validate the catalog (Vitest)

**Files:**
- Create: `backend/src/templates/catalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/templates/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from './catalog.js';

describe('org-type catalog integrity', () => {
  for (const [key, tpl] of Object.entries(TEMPLATES)) {
    describe(key, () => {
      it('type matches its key', () => {
        expect(tpl.type).toBe(key);
      });
      it('every document type uses a declared category', () => {
        for (const dt of tpl.documentTypes) {
          expect(tpl.categories, `${dt.name} category`).toContain(dt.category);
        }
      });
      it('every approval step references a declared position', () => {
        for (const dt of tpl.documentTypes) {
          for (const pos of dt.chain) {
            expect(tpl.positions, `${dt.name} step`).toContain(pos);
          }
        }
      });
      it('dropdown fields have options', () => {
        for (const dt of tpl.documentTypes) {
          for (const f of dt.fields) {
            if (f.type === 'dropdown') expect(f.options?.length, `${dt.name}.${f.key}`).toBeGreaterThan(0);
          }
        }
      });
      it('reference format includes {seq}', () => {
        for (const dt of tpl.documentTypes) {
          expect(dt.referenceFormat, dt.name).toContain('{seq}');
        }
      });
    });
  }
});
```

- [ ] **Step 2: Run it**

Run: `cd backend && npm test`
Expected: PASS (the catalog is already consistent). If any assertion fails, fix the offending entry in `catalog.ts` until green — this is the point of the test.

- [ ] **Step 3: Commit**

```bash
git add backend/src/templates/catalog.test.ts
git commit -m "test(templates): validate catalog integrity"
```

---

### Task 6: Reference-number formatter

**Files:**
- Create: `backend/src/lib/reference.ts`
- Create: `backend/src/lib/reference.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/lib/reference.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatReference } from './reference.js';

describe('formatReference', () => {
  it('fills year and zero-padded sequence', () => {
    expect(formatReference('VCHR-{YYYY}-{seq}', 2026, 42)).toBe('VCHR-2026-0042');
  });
  it('pads to 4 digits and keeps larger numbers', () => {
    expect(formatReference('TOR-{YYYY}-{seq}', 2026, 7)).toBe('TOR-2026-0007');
    expect(formatReference('TOR-{YYYY}-{seq}', 2026, 12345)).toBe('TOR-2026-12345');
  });
  it('supports format without a year token', () => {
    expect(formatReference('DOC-{seq}', 2026, 3)).toBe('DOC-0003');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test src/lib/reference.test.ts`
Expected: FAIL with "Failed to resolve import './reference.js'" or "formatReference is not a function".

- [ ] **Step 3: Implement**

Create `backend/src/lib/reference.ts`:

```ts
/** Fill a reference format like "VCHR-{YYYY}-{seq}" → "VCHR-2026-0042". */
export function formatReference(format: string, year: number, seq: number): string {
  const seqStr = String(seq).padStart(4, '0');
  return format.replace(/\{YYYY\}/g, String(year)).replace(/\{seq\}/g, seqStr);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test src/lib/reference.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/reference.ts backend/src/lib/reference.test.ts
git commit -m "feat(backend): add reference-number formatter"
```

---

### Task 7: Template instantiation (copy template into an org)

**Files:**
- Create: `backend/src/lib/instantiateTemplate.ts`

- [ ] **Step 1: Implement instantiation**

Create `backend/src/lib/instantiateTemplate.ts`:

```ts
import { supabaseAdmin } from './supabaseAdmin.js';
import { TEMPLATES } from '../templates/catalog.js';

/**
 * Copy an org-type template into a freshly created organization: positions,
 * categories, document types, and their ordered approval-chain steps.
 * Idempotent-ish: skips if the org already has categories.
 */
export async function instantiateTemplate(orgId: string, type: string): Promise<void> {
  const tpl = TEMPLATES[type] ?? TEMPLATES.general;

  const { count } = await supabaseAdmin
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);
  if ((count ?? 0) > 0) return; // already instantiated

  // Positions
  const positionRows = tpl.positions.map((name, i) => ({ org_id: orgId, name, sort: i }));
  const { data: positions } = await supabaseAdmin.from('positions').insert(positionRows).select('id, name');
  const posByName = new Map((positions ?? []).map((p) => [p.name, p.id]));

  // Categories
  const categoryRows = tpl.categories.map((name, i) => ({ org_id: orgId, name, sort: i }));
  const { data: categories } = await supabaseAdmin.from('categories').insert(categoryRows).select('id, name');
  const catByName = new Map((categories ?? []).map((c) => [c.name, c.id]));

  // Document types + steps
  let sort = 0;
  for (const dt of tpl.documentTypes) {
    const { data: created } = await supabaseAdmin
      .from('document_types')
      .insert({
        org_id: orgId,
        category_id: catByName.get(dt.category) ?? null,
        name: dt.name,
        icon: dt.icon,
        color: dt.color,
        reference_format: dt.referenceFormat,
        publishable: dt.publishable,
        fields: dt.fields,
        sort: sort++,
      })
      .select('id')
      .single();
    if (!created) continue;

    const steps = dt.chain
      .map((posName, idx) => ({ org_id: orgId, document_type_id: created.id, step_no: idx + 1, position_id: posByName.get(posName) }))
      .filter((s) => s.position_id);
    if (steps.length) await supabaseAdmin.from('document_type_steps').insert(steps);
  }
}
```

- [ ] **Step 2: Type-check the backend**

Run: `cd backend && npm run build`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/instantiateTemplate.ts
git commit -m "feat(backend): instantiate org-type template into an org"
```

---

### Task 8: `POST /admin/organizations` endpoint

**Files:**
- Modify: `backend/src/routes/admin.ts`

- [ ] **Step 1: Add the create-org route**

In `backend/src/routes/admin.ts`, add these imports at the top (next to existing imports):

```ts
import { z } from 'zod';
import { instantiateTemplate } from '../lib/instantiateTemplate.js';
import { TEMPLATES } from '../templates/catalog.js';
```

Then add this route (after the existing `adminRouter` routes, before any final export):

```ts
const createOrgSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(8),
  type: z.string().refine((t) => t in TEMPLATES, 'Unknown organization type'),
});

adminRouter.post('/organizations', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isSystemAdmin(req.user!.id))) {
    return res.status(403).json({ error: 'System admin only' });
  }
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, code, type } = parsed.data;

  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .insert({ name, code: code.toUpperCase(), type, created_by: req.user!.id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  await instantiateTemplate(org.id, type);
  return res.json({ organization: org });
});
```

- [ ] **Step 2: Build the backend**

Run: `cd backend && npm run build`
Expected: compiles with no errors.

- [ ] **Step 3: Manual verification (after deploying or running locally)**

Start the backend (`npm run dev`). With a System Admin token, POST to `/admin/organizations` with `{ "name": "Test College", "code": "TST", "type": "college" }`. Then in Supabase run:

```sql
select c.name from categories c join organizations o on o.id=c.org_id where o.code='TST';
select name from positions p join organizations o on o.id=p.org_id where o.code='TST';
select dt.name, dt.reference_format from document_types dt join organizations o on o.id=dt.org_id where o.code='TST' order by dt.sort;
```

Expected: 6 categories, 3 positions, 11 document types for the college template. Delete the test org afterward.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin.ts
git commit -m "feat(backend): create-organization endpoint instantiates template"
```

---

### Task 9: Frontend — call the endpoint + Org Type picker

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/admin.ts`
- Modify: `frontend/src/features/system-admin/OrganizationsPage.tsx`

- [ ] **Step 1: Add the OrgType type + org.type field**

In `frontend/src/lib/types.ts`, add near the top:

```ts
export type OrgType = 'college' | 'registrar' | 'hr' | 'finance' | 'osa' | 'guidance' | 'general';

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  college: 'College / Academic Office',
  registrar: "Registrar's Office",
  hr: 'HR Office',
  finance: 'Finance / Accounting Office',
  osa: 'Office of Student Affairs',
  guidance: 'Guidance Office',
  general: 'General Office',
};
```

In the same file, add `type: OrgType;` to the `Organization` interface (after `code`).

- [ ] **Step 2: Add the API method**

In `frontend/src/lib/api.ts`, inside the `api` object add:

```ts
  createOrganization: (input: { name: string; code: string; type: string }) =>
    post<{ organization: unknown }>('/organizations', input),
```

- [ ] **Step 3: Route createOrganization through the backend**

In `frontend/src/lib/admin.ts`, replace the existing `createOrganization` function body with a call to the API (keep the same signature plus a `type` arg):

```ts
import { api } from './api';
// ...
export async function createOrganization(name: string, code: string, type: string): Promise<void> {
  await api.createOrganization({ name, code, type });
}
```

(Remove the old direct-`supabase` insert in this function. Leave other functions in the file unchanged.)

- [ ] **Step 4: Add the Org Type picker to the Create dialog**

In `frontend/src/features/system-admin/OrganizationsPage.tsx`, inside `CreateDialog`, add a `type` state and a `<select>`:

```tsx
import { ORG_TYPE_LABELS, type OrgType } from '@/lib/types';
// inside CreateDialog component state:
const [type, setType] = useState<OrgType>('general');
```

Update the submit to pass `type`:

```tsx
await createOrganization(name.trim(), code.trim(), type);
```

Add this field to the dialog body (below the Code field):

```tsx
<div>
  <label className="label">Organization type</label>
  <select value={type} onChange={(e) => setType(e.target.value as OrgType)} className="input">
    {(Object.keys(ORG_TYPE_LABELS) as OrgType[]).map((t) => (
      <option key={t} value={t}>{ORG_TYPE_LABELS[t]}</option>
    ))}
  </select>
  <p className="mt-1 text-[11px] text-slate-400">Sets the office's starting document types and approval chains.</p>
</div>
```

- [ ] **Step 5: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify in the preview**

Start the dev server, open the System Admin → Organizations → Create dialog, confirm the **Organization type** dropdown shows all 7 labels. (Full create requires the backend running.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/lib/admin.ts frontend/src/features/system-admin/OrganizationsPage.tsx
git commit -m "feat(admin): pick org type on create; route creation through backend"
```

---

### Task 10: Migration — existing orgs → General, migrate approvals

**Files:**
- Create: `supabase/migrations/0002_migrate_general.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0002_migrate_general.sql`:

```sql
-- Backfill: every existing org with no categories becomes a General office.
-- (Run AFTER 0001. Instantiation of the General template for existing orgs is
--  done by the backend script in Step 2; this file handles approvals migration
--  and ensures type is set.)

update public.organizations set type = 'general' where type is null;

-- Migrate legacy single-approver approvals into multi-step requests (one step each).
insert into public.approval_requests (id, org_id, file_id, document_type_id, version_no, requester_id, status, current_step, message, created_at)
select a.id, a.org_id, a.file_id, null, a.version_no, a.requester_id, a.status, 1, a.message, a.created_at
from public.approvals a
where not exists (select 1 from public.approval_requests r where r.id = a.id);

insert into public.approval_step_assignments (org_id, request_id, step_no, position_id, assignee_id, status, decided_at)
select a.org_id, a.id, 1, null, a.approver_id,
       case a.status when 'pending' then 'pending' else a.status::text end, a.decided_at
from public.approvals a
where not exists (select 1 from public.approval_step_assignments s where s.request_id = a.id and s.step_no = 1);

-- Point legacy comments at their request (ids match because we reused approval ids).
update public.approval_comments c set request_id = c.approval_id where c.request_id is null and c.approval_id is not null;
```

- [ ] **Step 2: Apply + instantiate General for existing orgs**

Run `0002_migrate_general.sql` in the Supabase SQL Editor. Then instantiate the General template for each pre-existing org. Easiest path: a one-off backend script. Create `backend/src/scripts/backfillGeneral.ts`:

```ts
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { instantiateTemplate } from '../lib/instantiateTemplate.js';

const run = async () => {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id, type');
  for (const o of orgs ?? []) {
    await instantiateTemplate(o.id, o.type ?? 'general');
    console.log('instantiated', o.id, o.type);
  }
  console.log('done');
};
void run();
```

Run it once: `cd backend && npx tsx src/scripts/backfillGeneral.ts` (uses your backend `.env`).
Expected: logs one line per org; each existing org now has a "Documents" category and an "Approver" position. `instantiateTemplate` skips orgs that already have categories, so it's safe.

- [ ] **Step 3: Verify**

In Supabase:

```sql
select o.code, count(c.id) as categories
from organizations o left join categories c on c.org_id=o.id
group by o.code;
```

Expected: every org has at least 1 category. And `select count(*) from approval_requests;` ≥ the old `approvals` count.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_migrate_general.sql backend/src/scripts/backfillGeneral.ts
git commit -m "feat(db): migrate existing orgs to General type + multi-step approvals"
```

---

## Self-review against the spec

**Spec coverage (Plan 1 portion):**
- Org type on org + chosen at creation → Tasks 8, 9 ✅
- Templates copied into org (categories, positions, document types, fields, reference formats, chains) → Tasks 4, 7, 8 ✅
- Multi-step approval *tables* (engine/UI is Plan 4) → Task 2 ✅
- `files` metadata/reference columns (used in Plan 3) → Task 2 ✅
- Migration to General + existing approvals preserved → Task 10 ✅
- RLS for new tables follows existing pattern → Task 2 ✅
- Reference-number format helper → Task 6 ✅

**Deferred to later plans (intentionally):** dynamic upload form + reference allocation (Plan 3), approval engine/tracker (Plan 4), Org-Admin settings UI (Plan 5), search/filter (Plan 6), field-schema builder (Phase 2).

**Type consistency:** `OrgTemplate`/`DocTypeTemplate`/`FieldDef` used consistently across catalog, validation test, and instantiation. `formatReference(format, year, seq)` signature matches its test. Frontend `OrgType` union matches the 7 template keys.

**Placeholder scan:** none — all SQL, code, and commands are concrete.
