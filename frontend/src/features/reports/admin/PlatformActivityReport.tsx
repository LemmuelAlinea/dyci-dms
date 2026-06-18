import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { api, type ActivityEvent } from '@/lib/api';
import { listOrganizations } from '@/lib/admin';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<ActivityEvent>[] = [
  { key: 'when', label: 'When', render: (e) => format(new Date(e.at), 'PP p') },
  { key: 'actor', label: 'Actor', render: (e) => e.actor ?? '—' },
  { key: 'action', label: 'Action', render: (e) => e.action },
  { key: 'target', label: 'Target', render: (e) => e.target ?? '—' },
  { key: 'office', label: 'Office', render: (e) => e.org_code ?? '—' },
];

export function PlatformActivityReport() {
  const [orgId, setOrgId] = useState('');
  const orgs = useQuery({ queryKey: ['adminOrgs'], queryFn: listOrganizations });
  const data = useQuery({ queryKey: ['rpt-platactivity', orgId], queryFn: () => api.adminActivity(orgId || undefined), retry: 0 });

  const applied = orgId ? `office ${orgs.data?.find((o) => o.id === orgId)?.code ?? ''}` : 'All offices';

  return (
    <div>
      <PageHeader title="Platform Activity Log" subtitle="Recent activity across all offices." icon={<Activity size={22} />} />
      <ReportShell<ActivityEvent>
        reportKey="platform-activity"
        title="Platform Activity Log"
        orgId={null}
        appliedFilters={applied}
        columns={columns}
        rows={data.data?.events ?? []}
        loading={data.isLoading}
        presetData={{ orgId }}
        onLoadPreset={(p) => setOrgId((p.orgId as string) || '')}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div>
              <label className="label">Office</label>
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="input">
                <option value="">All offices</option>
                {(orgs.data ?? []).map((o) => (<option key={o.id} value={o.id}>{o.code} — {o.name}</option>))}
              </select>
            </div>
          </div>
        }
      />
    </div>
  );
}
