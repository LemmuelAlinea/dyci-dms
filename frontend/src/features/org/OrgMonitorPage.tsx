import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Database, FileText, Gauge, HardDrive, Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { supabase } from '@/lib/supabase';
import { formatBytes } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import type { DocStatus, FileItem } from '@/lib/types';

export function OrgMonitorPage() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const org = memberships.find((m) => m.org_id === orgId)?.organizations;

  const { data, isLoading } = useQuery({
    queryKey: ['orgMonitor', orgId],
    queryFn: async () => {
      const [{ count: memberCount }, { count: fileCount }, { data: recent }, { data: statuses }] = await Promise.all([
        supabase.from('organization_members').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
        supabase.from('files').select('*', { count: 'exact', head: true }).eq('org_id', orgId).neq('state', 'trashed'),
        supabase
          .from('files')
          .select('*, owner:profiles!files_owner_id_fkey(*)')
          .eq('org_id', orgId)
          .neq('state', 'trashed')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('files').select('status').eq('org_id', orgId).neq('state', 'trashed'),
      ]);
      const byStatus: Record<string, number> = {};
      (statuses ?? []).forEach((s: { status: string }) => (byStatus[s.status] = (byStatus[s.status] ?? 0) + 1));
      return { memberCount: memberCount ?? 0, fileCount: fileCount ?? 0, recent: (recent as FileItem[]) ?? [], byStatus };
    },
  });

  const used = org?.storage_used_bytes ?? 0;
  const quota = org?.storage_quota_bytes ?? 1;
  const pct = Math.min(100, Math.round((used / quota) * 100));

  const stats = [
    { label: 'Members', value: data?.memberCount ?? 0, icon: Users, color: 'bg-navy-700 text-gold-300' },
    { label: 'Documents', value: data?.fileCount ?? 0, icon: FileText, color: 'bg-emerald-600 text-white' },
    { label: 'Storage used', value: formatBytes(used), icon: HardDrive, color: 'bg-gold-sheen text-navy-900' },
    { label: 'Released', value: data?.byStatus['released'] ?? 0, icon: Database, color: 'bg-indigo-600 text-white' },
  ];

  return (
    <div>
      <PageHeader title="Organization" subtitle={`${org?.name ?? ''} · monitoring & reports`} icon={<Gauge size={22} />} />

      {isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="card p-5">
                <div className={`mb-3 grid h-11 w-11 place-items-center rounded-2xl ${s.color}`}>
                  <s.icon size={22} />
                </div>
                <p className="font-display text-2xl font-extrabold text-navy-900 dark:text-white">{s.value}</p>
                <p className="text-sm text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="card p-5">
              <h3 className="mb-4 font-display text-sm font-bold text-navy-900 dark:text-white">Recent uploads</h3>
              <div className="space-y-2">
                {data?.recent.length ? (
                  data.recent.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-white/10">
                      <FileKindIcon kind={f.kind} size={20} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-navy-900 dark:text-white">{f.name}</p>
                        <p className="text-[11px] text-slate-400">{f.owner?.full_name} · {format(new Date(f.created_at), 'PP')}</p>
                      </div>
                      <StatusBadge status={f.status} />
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-slate-400">No uploads yet.</p>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="card p-5">
                <h3 className="mb-3 font-display text-sm font-bold text-navy-900 dark:text-white">Storage</h3>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">{formatBytes(used)} used</span>
                  <span className="font-semibold text-navy-900 dark:text-white">{pct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div className="h-full rounded-full bg-gold-sheen" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-slate-400">Quota: {formatBytes(quota)}</p>
              </div>

              <div className="card p-5">
                <h3 className="mb-3 font-display text-sm font-bold text-navy-900 dark:text-white">By status</h3>
                <div className="space-y-2">
                  {(['draft', 'pending', 'approved', 'released', 'rejected'] as DocStatus[]).map((s) => (
                    <div key={s} className="flex items-center justify-between">
                      <StatusBadge status={s} />
                      <span className="text-sm font-semibold text-navy-900 dark:text-white">{data?.byStatus[s] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
