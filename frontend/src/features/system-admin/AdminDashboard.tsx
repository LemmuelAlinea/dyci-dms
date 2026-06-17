import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Database, FileText, HardDrive, Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { listOrganizations } from '@/lib/admin';
import { formatBytes } from '@/lib/utils';

export function AdminDashboard() {
  const navigate = useNavigate();
  const orgs = useQuery({ queryKey: ['adminOrgs'], queryFn: listOrganizations });
  const reports = useQuery({ queryKey: ['adminReports'], queryFn: api.adminReports, retry: 0 });

  const totalStorage = (orgs.data ?? []).reduce((s, o) => s + Number(o.storage_used_bytes ?? 0), 0);

  const stats = [
    { label: 'Organizations', value: reports.data?.totals.organizations ?? orgs.data?.length ?? 0, icon: Building2, color: 'bg-navy-700 text-gold-300' },
    { label: 'Users', value: reports.data?.totals.users ?? '—', icon: Users, color: 'bg-indigo-600 text-white' },
    { label: 'Documents', value: reports.data?.totals.files ?? '—', icon: FileText, color: 'bg-emerald-600 text-white' },
    { label: 'Total storage', value: formatBytes(reports.data?.totals.storageBytes ?? totalStorage), icon: HardDrive, color: 'bg-gold-sheen text-navy-900' },
  ];

  return (
    <div>
      <PageHeader
        title="System Dashboard"
        subtitle="Monitor every office across DYCI."
        icon={<Database size={22} />}
        actions={<button onClick={() => navigate('/admin/organizations')} className="btn-primary"><Plus size={17} /> New organization</button>}
      />

      {reports.isError && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
          Backend API is unreachable — showing limited metrics. Start the backend (Railway) for full reports.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className={`mb-3 grid h-11 w-11 place-items-center rounded-2xl ${s.color}`}><s.icon size={22} /></div>
            <p className="font-display text-2xl font-extrabold text-navy-900 dark:text-white">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-navy-900 dark:text-white">Organizations</h3>
          <button onClick={() => navigate('/admin/organizations')} className="text-sm font-medium text-navy-600 hover:underline dark:text-gold-300">Manage →</button>
        </div>
        {orgs.isLoading ? (
          <div className="grid place-items-center py-10"><Spinner /></div>
        ) : !orgs.data?.length ? (
          <p className="py-8 text-center text-sm text-slate-400">No organizations yet. Create your first office.</p>
        ) : (
          <div className="space-y-2">
            {orgs.data.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-white/10">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy-700 text-xs font-bold text-white">{o.code.slice(0, 3)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{o.name}</p>
                  <p className="text-[11px] text-slate-400">{o.member_count} members · {formatBytes(o.storage_used_bytes)}</p>
                </div>
                {o.admin ? (
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Avatar name={o.admin.full_name} url={o.admin.avatar_url} size={22} /> {o.admin.full_name}
                  </span>
                ) : (
                  <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">No admin</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
