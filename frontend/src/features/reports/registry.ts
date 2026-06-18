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
];

export interface AdminReportDef {
  key: string;
  title: string;
  description: string;
  to: string;
}

export const ADMIN_REPORTS: AdminReportDef[] = [];
