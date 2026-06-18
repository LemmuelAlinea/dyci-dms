import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Inbox } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { listMyApprovalQueue, type QueueFilters, type QueueRow } from '@/lib/reports/staff';
import { listDocumentTypes } from '@/lib/documentTypes';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';

const columns: ColumnDef<QueueRow>[] = [
  { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
  { key: 'document', label: 'Document', render: (r) => r.file_name },
  { key: 'type', label: 'Type', render: (r) => r.type_name ?? '—' },
  { key: 'requester', label: 'Requested by', render: (r) => r.requester ?? '—' },
  { key: 'requested', label: 'Requested', render: (r) => format(new Date(r.created_at), 'PP') },
];

export function MyApprovalQueueReport() {
  const { currentOrgId, session } = useAuth();
  const userId = session!.user.id;
  const [filters, setFilters] = useState<QueueFilters>({});
  const types = useQuery({ queryKey: ['docTypes', currentOrgId], queryFn: () => listDocumentTypes(currentOrgId!), enabled: !!currentOrgId });
  const rows = useQuery({ queryKey: ['rpt-myqueue', userId, filters], queryFn: () => listMyApprovalQueue(userId, filters) });

  const applied = filters.documentTypeId ? `type ${types.data?.find((t) => t.id === filters.documentTypeId)?.name ?? ''}` : 'All';

  return (
    <div>
      <PageHeader title="My Approval Queue" subtitle="Documents waiting for your approval." icon={<Inbox size={22} />} />
      <ReportShell<QueueRow>
        reportKey="my-approval-queue"
        title="My Approval Queue Report"
        orgId={currentOrgId}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data ?? []}
        loading={rows.isLoading}
        presetData={filters as Record<string, unknown>}
        onLoadPreset={(p) => setFilters({ documentTypeId: (p.documentTypeId as string) || undefined })}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">Type</label><select value={filters.documentTypeId ?? ''} onChange={(e) => setFilters({ documentTypeId: e.target.value || undefined })} className="input"><option value="">All</option>{(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
            <button onClick={() => setFilters({})} className="btn-ghost">Clear</button>
          </div>
        }
      />
    </div>
  );
}
