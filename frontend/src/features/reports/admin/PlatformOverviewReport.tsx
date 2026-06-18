import { useQuery } from '@tanstack/react-query';
import { Database, Printer } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { ORG_TYPE_LABELS, type OrgType } from '@/lib/types';
import { useAuth } from '@/store/auth';

export function PlatformOverviewReport() {
  const generatedBy = useAuth((s) => s.profile?.full_name) ?? 'System Admin';
  const q = useQuery({ queryKey: ['rpt-platover'], queryFn: api.reportAdminOverview, retry: 0 });
  const d = q.data;

  return (
    <div>
      <PageHeader title="Platform Overview" subtitle="A snapshot of the whole platform." icon={<Database size={22} />} />
      <div className="no-print mb-4 flex justify-end">
        <button onClick={() => window.print()} className="btn-primary"><Printer size={16} /> Print / Save as PDF</button>
      </div>
      {q.isError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
          Backend API is unreachable — start the backend to load this report.
        </div>
      )}
      {q.isLoading || !d ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : (
        <ReportLayout title="Platform Overview Report" generatedBy={generatedBy}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Organizations', value: d.organizations },
              { label: 'Users', value: d.users },
              { label: 'Documents', value: d.documents },
              { label: 'Total storage', value: formatBytes(d.storageBytes) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <p className="font-display text-2xl font-extrabold text-navy-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-wide text-slate-400">By office type</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-400 dark:border-white/10">
                <th className="px-2 py-1.5">Office type</th><th className="px-2 py-1.5 text-right">Offices</th><th className="px-2 py-1.5 text-right">Storage</th>
              </tr>
            </thead>
            <tbody>
              {d.byType.map((t) => (
                <tr key={t.type} className="border-b border-slate-100 dark:border-white/5">
                  <td className="px-2 py-1.5">{ORG_TYPE_LABELS[t.type as OrgType] ?? t.type}</td>
                  <td className="px-2 py-1.5 text-right">{t.count}</td>
                  <td className="px-2 py-1.5 text-right">{formatBytes(t.storage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportLayout>
      )}
    </div>
  );
}
