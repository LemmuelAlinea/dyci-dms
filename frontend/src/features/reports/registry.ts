import type { OrgRole } from '@/lib/types';

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  to: string;
  roles: OrgRole[];
}

export const ORG_REPORTS: ReportDef[] = [
  {
    key: 'my-documents',
    title: 'My Documents',
    description: 'A printable register of the documents you own.',
    to: '/app/reports/my-documents',
    roles: ['admin', 'co_admin', 'staff', 'approver'],
  },
  {
    key: 'my-approval-requests',
    title: 'My Approval Requests',
    description: 'Approvals you requested and their status.',
    to: '/app/reports/my-approval-requests',
    roles: ['admin', 'co_admin', 'staff', 'approver'],
  },
  {
    key: 'my-approval-queue',
    title: 'My Approval Queue',
    description: 'Documents waiting for your approval.',
    to: '/app/reports/my-approval-queue',
    roles: ['admin', 'co_admin', 'staff', 'approver'],
  },
  {
    key: 'my-released',
    title: 'My Released Papers',
    description: 'Your documents that have been released.',
    to: '/app/reports/my-released',
    roles: ['admin', 'co_admin', 'staff', 'approver'],
  },
  { key: 'office-summary', title: 'Office Summary', description: 'A snapshot of this office.', to: '/app/reports/office-summary', roles: ['admin'] },
  { key: 'document-register', title: 'Document Register', description: 'Every document in this office.', to: '/app/reports/document-register', roles: ['admin', 'co_admin'] },
  { key: 'approval-report', title: 'Approval Report', description: 'Approval activity and turnaround.', to: '/app/reports/approval-report', roles: ['admin', 'co_admin'] },
  { key: 'released-register', title: 'Released Papers Register', description: 'All released documents.', to: '/app/reports/released-register', roles: ['admin', 'co_admin'] },
  { key: 'member-activity', title: 'Member Activity', description: 'Per-member uploads, approvals, storage.', to: '/app/reports/member-activity', roles: ['admin'] },
  { key: 'member-directory', title: 'Member Directory', description: 'People in this office and their positions.', to: '/app/reports/member-directory', roles: ['co_admin'] },
  { key: 'document-type', title: 'Document-Type Report', description: "A type's records with fields and totals.", to: '/app/reports/document-type', roles: ['admin'] },
];

export interface AdminReportDef {
  key: string;
  title: string;
  description: string;
  to: string;
}

export const ADMIN_REPORTS: AdminReportDef[] = [
  { key: 'platform-overview', title: 'Platform Overview', description: 'A snapshot of the whole platform.', to: '/admin/reports/overview' },
  { key: 'organizations-directory', title: 'Organizations Directory', description: 'Every office with admin, members, storage.', to: '/admin/reports/organizations' },
  { key: 'storage-utilization', title: 'Storage Utilization', description: 'Storage usage per office.', to: '/admin/reports/storage' },
  { key: 'platform-activity', title: 'Platform Activity Log', description: 'Recent activity across all offices.', to: '/admin/reports/activity' },
];
