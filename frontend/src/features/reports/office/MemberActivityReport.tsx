import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type MemberActivityRow } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { ROLE_LABEL, type OrgRole } from '@/lib/types';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<MemberActivityRow>[] = [
  { key: 'name', label: 'Name', render: (r) => r.full_name ?? '—' },
  { key: 'role', label: 'Role', render: (r) => ROLE_LABEL[r.role as OrgRole] ?? r.role },
  { key: 'positions', label: 'Positions', render: (r) => r.positions || '—' },
  { key: 'uploads', label: 'Uploads', align: 'right', render: (r) => r.uploads },
  { key: 'approvals', label: 'Approvals', align: 'right', render: (r) => r.approvals },
  { key: 'storage', label: 'Storage', align: 'right', render: (r) => formatBytes(r.storage_bytes) },
  { key: 'last', label: 'Last upload', render: (r) => (r.last_active ? format(new Date(r.last_active), 'PP') : '—') },
];

export function MemberActivityReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const rows = useQuery({ queryKey: ['rpt-members', orgId], queryFn: () => api.reportOrgMembers(orgId) });

  return (
    <div>
      <PageHeader title="Member Activity" subtitle="Per-member uploads, approvals, and storage." icon={<Users size={22} />} />
      <ReportShell<MemberActivityRow>
        reportKey="member-activity"
        title="Member Activity Report"
        orgId={orgId}
        orgName={orgName}
        appliedFilters="All members"
        columns={columns}
        rows={rows.data?.rows ?? []}
        loading={rows.isLoading}
        presetData={{}}
        onLoadPreset={() => undefined}
        filterPanel={null}
      />
    </div>
  );
}
