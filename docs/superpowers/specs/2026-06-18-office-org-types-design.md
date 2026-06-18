# Design Spec — Office Organization Types & Document-Driven Workflows

**Date:** 2026-06-18
**Project:** DYCI Document Management System
**Status:** Approved design → ready for implementation plan

---

## Context

The DYCI DMS currently treats every organization (office) identically: generic roles, a single "Documents" space, single-approver workflow, and free-form file uploads. Real college offices work very differently from each other — a Registrar issues official student records, Finance routes vouchers through multiple signatories, Guidance keeps confidential counseling records, a College office handles grades and syllabi from many faculty.

This upgrade makes each organization's experience match its actual work, driven by an **Organization Type** chosen by the System Admin at creation. The differentiation is **data/config-driven**, not hand-built per office — so office types are a data change, not new code.

**Primary goal:** each office gets the right document categories, document types, identifiers, and approval routing so users handle their papers without confusion, while keeping per-office data isolation intact.

---

## Decisions (locked during brainstorming)

1. **Config-driven Org Types** (not bespoke per-office UIs). One app shell; behavior comes from each org's config.
2. **Configurable 1–N step approval chains** per document type (Option C). Most types are single-step; Finance/College can be multi-step.
3. **Requester picks the specific approver per step** at submission; a position with a single holder auto-resolves (no prompt).
4. **Org Admin has full control** over their org's config (document types, categories, chains, positions). Templates are a seeded starting point, fully overridable.
5. **C-core now, field-builder fast-follow.** Build the full metadata data model, reference numbers, dynamic forms, and search now; defer the admin field-schema builder to Phase 2. No migration debt.
6. **Per-document-type "Publish on final approval" toggle.** Doubles as the confidentiality guard — confidential types are never pushed to the office feed.

---

## Core concepts & terminology

- **Org Type** — the kind of office: `college`, `registrar`, `hr`, `finance`, `osa`, `guidance`, `general`. Chosen by the System Admin when creating the org.
- **Template** — the seed config for an Org Type (categories, document types + seeded metadata fields, default approval chains, default positions). Maintained as seed data.
- **Org config** — a **copy** of the template the organization owns; the Org Admin customizes it. Edits never affect other orgs or the template.
- **Category** — a grouping within an org (e.g., *Grades & Assessment*).
- **Document Type** — a kind of paper (e.g., *Grade Sheet*) carrying: label, icon/color, category, **metadata fields**, **reference-number format**, **approval chain**, **publishable** flag.
- **Position** — a named authority (*Dean, Program Chair, Finance Head*) the Org Admin defines and assigns to members. Approval steps reference positions.
- **Reference number** — an auto-generated identifier stamped on submission (e.g., `VCHR-2026-0042`).
- **Metadata fields** — structured fields a document type defines; rendered as the upload form and used for display/search.

---

## Roles vs Positions (they coexist)

- The existing **4 permission tiers stay** — Admin / Co-Admin / Staff / Approver — and govern **management & visibility** (who invites, who monitors). Faculty/professors are **Staff** tier in a College org.
- **Positions are new** and govern **approval routing only**. A member can hold zero or more positions independent of their tier. A member can only approve a step if they hold the position that step targets.
- The legacy "Approver" tier becomes effectively optional; approval ability now comes from positions. For backward compatibility the **General** type seeds a single "Approver" position.

---

## Data model changes (additive — nothing existing is removed)

- `organizations.type text` — the org type (default `general`).
- **`categories`** — `id, org_id, name, sort, created_at`.
- **`positions`** — `id, org_id, name, sort`.
- **`member_positions`** — `org_id, user_id, position_id` (a member can hold several).
- **`document_types`** — `id, org_id, category_id, name, icon, color, reference_format, publishable bool, fields jsonb (field definitions), active bool, sort`.
- **`document_type_steps`** — `id, document_type_id, step_no, position_id` (ordered approval chain).
- **`files`** — add `document_type_id`, `category_id`, `reference_no`, `metadata jsonb` (the filled-in field values).
- **Multi-step approvals** — replace/extend the single-approver model:
  - **`approval_requests`** — `id, org_id, file_id, document_type_id, version_no, requester_id, status (pending|approved|rejected), current_step, created_at`.
  - **`approval_step_assignments`** — `id, request_id, step_no, position_id, assignee_id (the specific person the requester picked), status (waiting|pending|approved|rejected), decided_at`.
  - **`approval_comments`** — re-pointed to `request_id` (threaded discussion across the whole request).
- Reference-number generation: a per-(org, document_type) sequence; `reference_format` supports tokens like `{YYYY}` and `{seq}`.

**Unchanged:** drives, folders, sharing (member grants + email attachments), direct email, archive/bin, notifications, settings, dark mode, and **per-org RLS isolation**. RLS for the new tables follows the existing pattern: scoped by `org_id`, readable by org members, manageable by Org Admin; per-owner file isolation continues to provide within-org confidentiality.

---

## Key workflows

### Create organization (System Admin)
Pick org **type** → the matching template is **copied** into the org (categories, document types + fields, default positions, default chains) → assign the Org Admin (existing flow).

### Customize (Org Admin) — Phase 1
A new **"Document Types & Approvals"** settings area where the Org Admin can:
- Define **positions** and assign members to them.
- Create / rename / remove **categories** and **document types**.
- Edit each type's **approval chain** (add/remove/reorder steps → each step = a position).
- Toggle **publishable** and set the **reference-number format**.
- *(Phase 2)* Edit the **metadata fields** of a type via the field-schema builder.

### Upload / submit
User picks a **Document Type** → the **dynamic form** renders that type's metadata fields → a **reference number** is generated → the file is tagged (type, category, reference, metadata) → routed into the type's chain. The requester **picks the specific person at each step** (auto-filled when a position has a single holder).

### Multi-step approval
The request advances **one step at a time**; a step only opens when the previous step is approved. A **progress tracker** shows the chain (✅ Chair → 🕓 Dean → ⬜). Any **rejection** stops the request, marks the file *Rejected*, and returns it to the owner with comments. Approvers see the document's metadata (amount/payee/term) before opening it.

### Publish
On **final** approval: **publishable** types are pushed to the office's **Released Papers** feed (with owner + final approver); **non-publishable** types become *Approved/Finalized* and remain visible only to the owner + approvers.

---

## Phasing

### Phase 1 (this spec)
Org types + seeded templates · positions + assignment · document types with **seeded** metadata fields, reference numbers, publishable flag · dynamic upload forms · multi-step approval + progress tracker · search/filter by metadata · Org-Admin editing of positions, chains, categories, document types, publishable, and reference format.

### Phase 2 (fast-follow — purely additive, no migration)
The **field-schema builder** (org admins invent/edit custom fields per type). Until it ships, custom types created by an admin use base fields only; template-provided types keep their seeded fields.

### Deferred (Phase 2+)
Advanced reporting/exports · amount-based routing (e.g., vouchers over a threshold add a President step) · richer field types.

---

## Migration (nothing breaks)

Existing organizations are set to the **General** type. Existing files receive the default category, empty `metadata`, and remain in a single-step (or no-step) flow. Existing rows in the old `approvals`/`approval_comments` tables are migrated into `approval_requests` as **single-step** requests (one step assignment = the original approver) so approval history and comments are preserved. All current data, drives, and flows keep working. The General template is intentionally permissive: one "Documents" category, a single optional "Approver" position/step, everything publishable.

---

## Success criteria

- System Admin can create an org of each type; the org is seeded with that type's categories, document types, positions, and default chains.
- A College faculty member can submit a Grade Sheet that routes Chair → Dean, each step approved by the chosen person, with a live tracker; on final approval it behaves per its publishable flag.
- A Finance voucher routes Accountant → Finance Head → President and shows its amount/payee on the card and to approvers.
- Confidential types (Counseling Record, 201 File, Voucher) never appear in the office feed.
- Documents display their reference number + key metadata on cards and detail; metadata is searchable/filterable.
- Org Admin can edit positions, chains, categories, document types, publishable, and reference formats without code changes.
- Existing orgs (now General) and their files continue to work unchanged.

---

## Appendix A — Template catalogs (seed data)

Format: **Category → Document Type** — *fields* — chain — publishable. Reference prefixes in parentheses.

### College / Academic — positions: Faculty, Program Chair, Dean
- **Grades & Assessment** → Grade Sheet (GRD) — *Subject, Course Code, Section, Term[1st/2nd/Summer], School Year, # Students* — Chair → Dean — no
- → Table of Specifications (TOS) — *Subject, Term, School Year* — Chair → Dean — no
- → Exam Paper (EXM) — *Subject, Exam Type[Prelim/Midterm/Final], Term* — Chair → Dean — no
- **Curriculum** → Syllabus/OBE (SYL) — *Course Code, Course Title, Units, Term, School Year* — Dean — yes
- → Curriculum Map (CMAP) — *Program, School Year* — Chair → Dean — yes
- **Faculty** → Faculty Loading (LOAD) — *Faculty, Term, School Year, Total Units* — Dean — no
- → Faculty Clearance (CLR) — *Faculty, Term* — Dean — no
- **Scheduling** → Class Schedule (SCHED) — *Program, Term, School Year* — Chair → Dean — yes
- **Research** → Capstone/Thesis (RES) — *Title, Authors, Adviser, Program, School Year* — Chair → Dean — yes
- **Memos & Reports** → Memo (MEMO) — *Subject, Date* — Dean — yes · Report (RPT) — *Title, Period* — Dean — yes

### Registrar — positions: Records Staff, Asst. Registrar, Registrar
- **Student Records** → Transcript of Records (TOR) — *Student Name, Student No., Program, Purpose* — Asst. Registrar → Registrar — no
- → Form 137/138 (F137) — *Student Name, Student No., Level* — Registrar — no
- **Certifications** → Certificate of Enrollment (COE) — *Student Name, Student No., Term, School Year* — Registrar — no
- → Certificate of Grades (COG) — *Student Name, Student No., Term* — Registrar — no
- → CAV / Authentication (CAV) — *Student Name, Purpose* — Registrar — no
- **Enrollment** → Enrollment List (ENL) — *Program, Term, School Year* — Asst. Registrar → Registrar — yes
- → Dropping/Adding/Shifting (DAS) — *Student Name, Student No., Type[Drop/Add/Shift]* — Registrar — no
- **Grades Consolidation** → Consolidated Grades (CGR) — *Program, Term, School Year* — Asst. Registrar → Registrar — no
- **Credentials** → Diploma (DIP) — *Student Name, Program, Date Graduated* — Registrar — no

### HR — positions: HR Officer, HR Head *(confidential office)*
- **201 Files** → Employee 201 (201) — *Employee Name, Position, Department, Date Hired* — HR Head — no
- **Contracts & Appointments** → Employment Contract (CON) — *Employee Name, Position, Contract Type[Regular/Probationary/Part-time], Effective Date, End Date* — HR Head — no
- → Appointment Letter (APPT) — *Employee Name, Position, Effective Date* — HR Head — no
- **Leave & Attendance** → Leave Form (LV) — *Employee, Leave Type[VL/SL/EL/Maternity/Other], From, To, # Days* — HR Head — no
- **Performance** → Performance Appraisal (PA) — *Employee, Period, Rating* — HR Head — no
- **Recruitment** → Job Posting (JOB) — *Position, Department, Date* — HR Head — yes · Application (APP) — *Applicant, Position* — HR Officer → HR Head — no
- **Compliance** → Government Remittance (GOV) — *Type[SSS/PhilHealth/Pag-IBIG/BIR], Period, Amount* — HR Head — no
- **Memos** → Memo/Circular (MEMO) — *Subject, Date* — HR Head — yes

### Finance — positions: Cashier/Bookkeeper, Accountant, Finance Head, President
- **Disbursements** → Disbursement Voucher (VCHR) — *Payee, Amount(₱), Purpose, Budget Line, Date Needed* — Accountant → Finance Head → President — no
- → Reimbursement (REIMB) — *Payee, Amount, Purpose* — Accountant → Finance Head — no
- → Liquidation Report (LIQ) — *Payee, Amount, Reference Voucher* — Accountant → Finance Head — no
- **Purchasing** → Purchase Request (PR) — *Requested By, Items, Estimated Amount* — Accountant → Finance Head — no
- → Purchase Order (PO) — *Supplier, Total Amount, PR Reference* — Finance Head → President — no
- **Budget** → Budget Proposal (BUD) — *Department, Period, Total Amount* — Finance Head → President — no
- **Collections** → Official Receipt (OR) — *Payer, Amount, Purpose* — Accountant — no
- → Statement of Account (SOA) — *Student/Client, Amount Due* — Accountant — no
- **Payroll** → Payroll (PAY) — *Period, Total Amount, # Employees* — Accountant → Finance Head — no
- **Financial Statements & Audit** → Financial Statement (FS) — *Period, Type[Income/Balance/Cash Flow]* — Finance Head → President — no

### OSA — positions: OSA Staff, OSA Director
- **Activities & Permits** → Activity Proposal/Permit (ACT) — *Activity Title, Organization, Date, Venue, Expected Attendees* — OSA Director — yes
- **Student Organizations** → Org Accreditation (ORG) — *Org Name, Adviser, School Year* — OSA Director — yes
- **Discipline** → Incident/Violation Report (INC) — *Student Name, Student No., Violation, Date* — OSA Director — no
- **Scholarships** → Scholarship Record (SCH) — *Student Name, Scholarship Type[Academic/Athletic/Financial/Other], School Year* — OSA Director — no
- **Events Documentation** → Event Documentation (EVT) — *Event, Date* — OSA Director — yes
- **Policies** → Handbook/Policy (POL) — *Title, Version* — OSA Director — yes

### Guidance — positions: Counselor, Guidance Head *(confidential office)*
- **Counseling Records** → Anecdotal/Counseling Record (CR) — *Student Name, Student No., Date, Counselor* — Guidance Head — no
- **Assessments/Testing** → Psychological Test Result (PSY) — *Student Name, Student No., Test, Date* — Guidance Head — no
- **Certificates** → Good Moral Certificate (GM) — *Student Name, Student No., Purpose* — Guidance Head — no
- **Referrals** → Referral Form (REF) — *Student Name, Referred By, Reason* — Guidance Head — no
- **Student Profiles** → Student Profile (PROF) — *Student Name, Student No., Program* — Guidance Head — no

### General — positions: Approver
- **Documents** → Document (DOC) — *Title (optional)* — Approver (single, optional step) — yes

---

## Appendix B — Field types (Phase 1 supported)

`text`, `long text`, `number`, `money` (₱), `date`, `dropdown` (single-select with options), `yes/no`. Each field: `key, label, type, required, options?`.
