import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Contact } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type MemberDirRow } from '@/lib/api';
import { ROLE_LABEL, type OrgRole } from '@/lib/types';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<MemberDirRow>[] = [
  { key: 'name', label: 'Name', render: (r) => r.full_name ?? '—' },
  { key: 'email', label: 'Email', render: (r) => r.email ?? '—' },
  { key: 'role', label: 'Role', render: (r) => ROLE_LABEL[r.role as OrgRole] ?? r.role },
  { key: 'positions', label: 'Positions', render: (r) => r.positions || '—' },
  { key: 'joined', label: 'Joined', render: (r) => format(new Date(r.joined_at), 'PP') },
];

export function MemberDirectoryReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const rows = useQuery({ queryKey: ['rpt-memdir', orgId], queryFn: () => api.reportOrgMembersDirectory(orgId) });

  return (
    <div>
      <PageHeader title="Member Directory" subtitle="People in this office and their positions." icon={<Contact size={22} />} />
      <ReportShell<MemberDirRow>
        reportKey="member-directory"
        title="Member Directory"
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
