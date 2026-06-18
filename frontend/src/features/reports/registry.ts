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
];

export interface AdminReportDef {
  key: string;
  title: string;
  description: string;
  to: string;
}

export const ADMIN_REPORTS: AdminReportDef[] = [];
