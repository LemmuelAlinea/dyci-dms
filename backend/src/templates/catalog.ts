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
