import { useQuery } from '@tanstack/react-query';
import { Printer, Gauge } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { useAuth } from '@/store/auth';

export function OfficeSummaryReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const q = useQuery({ queryKey: ['rpt-summary', orgId], queryFn: () => api.reportOrgSummary(orgId) });
  const d = q.data;

  return (
    <div>
      <PageHeader title="Office Summary" subtitle="A printable snapshot of this office." icon={<Gauge size={22} />} />
      <div className="no-print mb-4 flex justify-end">
        <button onClick={() => window.print()} className="btn-primary"><Printer size={16} /> Print / Save as PDF</button>
      </div>
      {q.isLoading || !d ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : (
        <ReportLayout title="Office Summary Report" orgName={orgName} generatedBy={useAuth.getState().profile?.full_name ?? 'User'}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Members', value: d.members },
              { label: 'Documents', value: d.totalFiles },
              { label: 'Released', value: d.released },
              { label: 'Pending approvals', value: d.pendingApprovals },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <p className="font-display text-2xl font-extrabold text-navy-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">Storage: {formatBytes(d.org.storage_used_bytes)} of {formatBytes(d.org.storage_quota_bytes)}</p>

          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">By status</p>
              {(['draft', 'pending', 'approved', 'released', 'rejected'] as const).map((s) => (
                <div key={s} className="flex justify-between text-sm"><span className="capitalize text-slate-600 dark:text-slate-300">{s}</span><span className="font-semibold">{d.byStatus[s] ?? 0}</span></div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">By category</p>
              {d.byCategory.map((c) => (<div key={c.name} className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">{c.name}</span><span className="font-semibold">{c.count}</span></div>))}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">By document type</p>
              {d.byType.map((t) => (<div key={t.name} className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">{t.name}</span><span className="font-semibold">{t.count}</span></div>))}
            </div>
          </div>
        </ReportLayout>
      )}
    </div>
  );
}
