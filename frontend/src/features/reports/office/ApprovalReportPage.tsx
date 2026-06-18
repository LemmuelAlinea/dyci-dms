import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format } from 'date-fns';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api, type ApprovalRow, type WorkloadRow } from '@/lib/api';
import { listMembers } from '@/lib/org';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { DocStatus } from '@/lib/types';

const STATUSES = ['pending', 'approved', 'rejected'];

const columns: ColumnDef<ApprovalRow>[] = [
  { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
  { key: 'document', label: 'Document', render: (r) => r.file_name },
  { key: 'requester', label: 'Requester', render: (r) => r.requester ?? '—' },
  { key: 'approver', label: 'Approver', render: (r) => r.current_approver ?? '—' },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status as DocStatus} /> },
  { key: 'requested', label: 'Requested', render: (r) => format(new Date(r.created_at), 'PP') },
  { key: 'decided', label: 'Decided', render: (r) => (r.decided_at ? format(new Date(r.decided_at), 'PP') : '—') },
  { key: 'turnaround', label: 'Turnaround', align: 'right', render: (r) => (r.decided_at ? `${differenceInCalendarDays(new Date(r.decided_at), new Date(r.created_at))} day(s)` : '—') },
];

function Workload({ rows }: { rows: WorkloadRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="mt-6">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Approver workload</p>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-400 dark:border-white/10"><th className="px-2 py-1.5">Approver</th><th className="px-2 py-1.5 text-right">Pending</th><th className="px-2 py-1.5 text-right">Approved</th></tr></thead>
        <tbody>{rows.map((w) => (<tr key={w.approver} className="border-b border-slate-100 dark:border-white/5"><td className="px-2 py-1.5">{w.approver}</td><td className="px-2 py-1.5 text-right">{w.pending}</td><td className="px-2 py-1.5 text-right">{w.approved}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

export function ApprovalReportPage() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});

  const members = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId) });
  const data = useQuery({ queryKey: ['rpt-approvals', orgId, filters], queryFn: () => api.reportOrgApprovals(orgId, filters) });

  const applied = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="Approval Report" subtitle="Approval activity and turnaround across the office." icon={<ClipboardList size={22} />} />
      <ReportShell<ApprovalRow>
        reportKey="approval-report"
        title="Approval Report"
        orgId={orgId}
        orgName={orgName}
        appliedFilters={applied}
        columns={columns}
        rows={data.data?.rows ?? []}
        loading={data.isLoading}
        presetData={filters}
        onLoadPreset={(p) => setFilters(p as Record<string, string | undefined>)}
        extra={<Workload rows={data.data?.workload ?? []} />}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">From</label><input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" /></div>
            <div><label className="label">To</label><input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" /></div>
            <div><label className="label">Status</label><select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input"><option value="">Any</option>{STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            <div><label className="label">Approver</label><select value={filters.approver ?? ''} onChange={(e) => setFilters((f) => ({ ...f, approver: e.target.value }))} className="input"><option value="">Anyone</option>{(members.data ?? []).map((m) => (<option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>))}</select></div>
            <button onClick={() => setFilters({})} className="btn-ghost">Clear</button>
          </div>
        }
      />
    </div>
  );
}
