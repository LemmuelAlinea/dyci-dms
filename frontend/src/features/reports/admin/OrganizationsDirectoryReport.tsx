import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Building2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type OrgDirRow } from '@/lib/api';
import { formatBytes, storagePercent } from '@/lib/utils';
import { ORG_TYPE_LABELS, type OrgType } from '@/lib/types';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<OrgDirRow>[] = [
  { key: 'code', label: 'Code', render: (r) => r.code },
  { key: 'name', label: 'Office', render: (r) => r.name },
  { key: 'type', label: 'Type', render: (r) => ORG_TYPE_LABELS[r.type as OrgType] ?? r.type },
  { key: 'admin', label: 'Admin', render: (r) => r.admin_name ?? '—' },
  { key: 'members', label: 'Members', align: 'right', render: (r) => r.members },
  { key: 'documents', label: 'Documents', align: 'right', render: (r) => r.documents },
  { key: 'storage', label: 'Storage', align: 'right', render: (r) => `${formatBytes(r.storage_used)} (${storagePercent(r.storage_used, r.storage_quota).label}%)` },
  { key: 'created', label: 'Created', render: (r) => format(new Date(r.created_at), 'PP') },
];

export function OrganizationsDirectoryReport() {
  const rows = useQuery({ queryKey: ['rpt-orgdir'], queryFn: api.reportAdminOrganizations, retry: 0 });
  return (
    <div>
      <PageHeader title="Organizations Directory" subtitle="Every office on the platform." icon={<Building2 size={22} />} />
      <ReportShell<OrgDirRow>
        reportKey="organizations-directory"
        title="Organizations Directory"
        orgId={null}
        appliedFilters="All offices"
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
