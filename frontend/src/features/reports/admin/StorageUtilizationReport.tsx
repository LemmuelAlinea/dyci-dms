import { useQuery } from '@tanstack/react-query';
import { HardDrive } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type StorageRow } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { ORG_TYPE_LABELS, type OrgType } from '@/lib/types';
import type { ColumnDef } from '@/lib/reports/types';

const healthClass = (h: string) =>
  h === 'Healthy'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'
    : h === 'Moderate'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300'
    : 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300';

const columns: ColumnDef<StorageRow>[] = [
  { key: 'code', label: 'Code', render: (r) => r.code },
  { key: 'name', label: 'Office', render: (r) => r.name },
  { key: 'type', label: 'Type', render: (r) => ORG_TYPE_LABELS[r.type as OrgType] ?? r.type },
  { key: 'used', label: 'Used', align: 'right', render: (r) => formatBytes(r.storage_used) },
  { key: 'quota', label: 'Quota', align: 'right', render: (r) => formatBytes(r.storage_quota) },
  { key: 'percent', label: 'Used %', align: 'right', render: (r) => `${r.percent.toFixed(r.percent < 1 ? 2 : 0)}%` },
  { key: 'health', label: 'Health', render: (r) => <span className={`chip ${healthClass(r.health)}`}>{r.health}</span> },
];

export function StorageUtilizationReport() {
  const rows = useQuery({ queryKey: ['rpt-storage'], queryFn: api.reportAdminStorage, retry: 0 });
  return (
    <div>
      <PageHeader title="Storage Utilization" subtitle="Storage usage per office." icon={<HardDrive size={22} />} />
      <ReportShell<StorageRow>
        reportKey="storage-utilization"
        title="Storage Utilization Report"
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
