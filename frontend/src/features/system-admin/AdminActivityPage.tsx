import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Activity, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api';
import { listOrganizations } from '@/lib/admin';
import { formatBytes } from '@/lib/utils';

export function AdminActivityPage() {
  const reports = useQuery({ queryKey: ['adminReports'], queryFn: api.adminReports, retry: 0 });
  const orgs = useQuery({ queryKey: ['adminOrgs'], queryFn: listOrganizations });

  const activity = reports.data?.recentActivity ?? [];

  return (
    <div>
      <PageHeader title="Activity" subtitle="Recent platform activity and organization overview." icon={<Activity size={22} />} />

      {reports.isLoading || orgs.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-4 font-display text-sm font-bold text-navy-900 dark:text-white">Recent activity</h3>
            {activity.length ? (
              <div className="space-y-2">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm dark:border-white/10">
                    <span className="font-medium text-navy-900 dark:text-white">{a.action} <span className="text-slate-400">{a.entity}</span></span>
                    <span className="text-[11px] text-slate-400">{format(new Date(a.created_at), 'PP p')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No activity yet" description="Activity will appear here as offices start using the system." />
            )}
          </div>

          <div className="card p-5">
            <h3 className="mb-4 font-display text-sm font-bold text-navy-900 dark:text-white">Organizations overview</h3>
            <div className="space-y-2">
              {(orgs.data ?? []).map((o) => (
                <div key={o.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-white/10">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy-700 text-xs font-bold text-white"><Building2 size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{o.name}</p>
                    <p className="text-[11px] text-slate-400">{o.member_count} members</p>
                  </div>
                  <span className="text-xs text-slate-400">{formatBytes(o.storage_used_bytes)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
