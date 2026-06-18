import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format } from 'date-fns';
import { ClipboardCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { listMyApprovalRequests, type ApprovalReqFilters, type MyRequestRow } from '@/lib/reports/staff';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { DocStatus } from '@/lib/types';

const STATUSES = ['pending', 'approved', 'rejected'];

const columns: ColumnDef<MyRequestRow>[] = [
  { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
  { key: 'document', label: 'Document', render: (r) => r.file_name },
  { key: 'type', label: 'Type', render: (r) => r.type_name ?? '—' },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status as DocStatus} /> },
  { key: 'approver', label: 'Approver', render: (r) => r.current_approver ?? '—' },
  { key: 'requested', label: 'Requested', render: (r) => format(new Date(r.created_at), 'PP') },
  { key: 'decided', label: 'Decided', render: (r) => (r.decided_at ? format(new Date(r.decided_at), 'PP') : '—') },
  { key: 'turnaround', label: 'Turnaround', align: 'right', render: (r) => (r.decided_at ? `${differenceInCalendarDays(new Date(r.decided_at), new Date(r.created_at))} day(s)` : '—') },
];

export function MyApprovalRequestsReport() {
  const { currentOrgId, session } = useAuth();
  const userId = session!.user.id;
  const [filters, setFilters] = useState<ApprovalReqFilters>({});
  const rows = useQuery({ queryKey: ['rpt-myreqs', userId, filters], queryFn: () => listMyApprovalRequests(userId, filters) });

  const applied = [filters.from && `from ${filters.from}`, filters.to && `to ${filters.to}`, filters.status && `status ${filters.status}`].filter(Boolean).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="My Approval Requests" subtitle="Approvals you requested and their status." icon={<ClipboardCheck size={22} />} />
      <ReportShell<MyRequestRow>
        reportKey="my-approval-requests"
        title="My Approval Requests Report"
        orgId={currentOrgId}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data ?? []}
        loading={rows.isLoading}
        presetData={filters as Record<string, unknown>}
        onLoadPreset={(p) => setFilters({ from: (p.from as string) || undefined, to: (p.to as string) || undefined, status: (p.status as string) || undefined })}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">From</label><input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" /></div>
            <div><label className="label">To</label><input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" /></div>
            <div><label className="label">Status</label><select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input"><option value="">Any</option>{STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            <button onClick={() => setFilters({})} className="btn-ghost">Clear</button>
          </div>
        }
      />
    </div>
  );
}
