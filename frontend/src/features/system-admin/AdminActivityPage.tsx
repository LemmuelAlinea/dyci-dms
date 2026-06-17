import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  Building2,
  CheckCircle2,
  Filter,
  Megaphone,
  Send,
  Upload,
  UserPlus,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api';
import { listOrganizations } from '@/lib/admin';

const TYPE_META: Record<string, { icon: LucideIcon; className: string }> = {
  org_created: { icon: Building2, className: 'bg-navy-100 text-navy-700 dark:bg-navy-400/20 dark:text-navy-200' },
  member_added: { icon: UserPlus, className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300' },
  upload: { icon: Upload, className: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' },
  approval_request: { icon: Send, className: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300' },
  approved: { icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' },
  rejected: { icon: XCircle, className: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300' },
  release: { icon: Megaphone, className: 'bg-gold-100 text-gold-700 dark:bg-gold-400/15 dark:text-gold-300' },
};

export function AdminActivityPage() {
  const [orgId, setOrgId] = useState('');
  const orgs = useQuery({ queryKey: ['adminOrgs'], queryFn: listOrganizations });
  const activity = useQuery({
    queryKey: ['adminActivity', orgId],
    queryFn: () => api.adminActivity(orgId || undefined),
    retry: 0,
  });

  const events = activity.data?.events ?? [];

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle="Everything happening across your offices — uploads, approvals, releases, and members."
        icon={<Activity size={22} />}
        actions={
          <div className="relative">
            <Filter size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm font-medium text-navy-800 outline-none transition focus:border-navy-400 dark:border-white/10 dark:bg-surface-dark-3 dark:text-white"
            >
              <option value="">All organizations</option>
              {(orgs.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} — {o.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {activity.isError && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
          Backend API is unreachable — start the backend (Railway / local) to load the activity feed.
        </div>
      )}

      {activity.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : events.length === 0 ? (
        <EmptyState
          icon="/assets/icon-file-stack.png"
          title="No activity yet"
          description={orgId ? 'No activity for this organization yet.' : 'Activity across all offices will appear here as people use the system.'}
        />
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-white/10">
          {events.map((e) => {
            const meta = TYPE_META[e.type] ?? TYPE_META.upload;
            return (
              <div key={e.id} className="flex items-center gap-3.5 p-3.5">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${meta.className}`}>
                  <meta.icon size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-navy-900 dark:text-white">
                    <span className="font-semibold">{e.actor ?? 'Someone'}</span>{' '}
                    <span className="text-slate-500 dark:text-slate-400">{e.action.toLowerCase()}</span>
                    {e.target && <span className="font-medium"> · {e.target}</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                  </p>
                </div>
                {e.org_code && (
                  <span className="chip shrink-0 bg-navy-50 text-navy-700 dark:bg-white/10 dark:text-slate-200">
                    {e.org_code}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
