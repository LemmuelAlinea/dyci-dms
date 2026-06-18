import { Outlet, useNavigate } from 'react-router-dom';
import {
  Archive,
  Briefcase,
  CheckSquare,
  HardDrive,
  Mail,
  Settings,
  Share2,
  Trash2,
  Users,
  Gauge,
  Megaphone,
} from 'lucide-react';
import { Sidebar, type NavSection } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '@/store/auth';
import { formatBytes, storagePercent } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';

export function AppShell() {
  const navigate = useNavigate();
  const { memberships, currentOrgId, role, profile } = useAuth();
  const currentRole = role();
  const org = memberships.find((m) => m.org_id === currentOrgId)?.organizations;

  if (memberships.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface-light-2 p-6 dark:bg-surface-dark">
        <div className="w-full max-w-md">
          <EmptyState
            icon="/assets/icon-person.png"
            title="You're not part of any office yet"
            description={
              profile?.is_system_admin
                ? 'You are signed in as System Admin. Head to the admin console to manage organizations.'
                : 'An organization admin needs to invite you by email. Once invited, your office will appear here.'
            }
            action={
              profile?.is_system_admin ? (
                <button onClick={() => navigate('/admin')} className="btn-primary">
                  Open Admin Console
                </button>
              ) : (
                <button onClick={() => useAuth.getState().signOut()} className="btn-outline">
                  Sign out
                </button>
              )
            }
          />
        </div>
      </div>
    );
  }

  const sections: NavSection[] = [
    {
      title: 'Workspace',
      items: [
        { to: '/app/drive', label: 'My Drive', icon: HardDrive },
        { to: '/app/shared', label: 'Shared with me', icon: Share2 },
        { to: '/app/released', label: 'Released Papers', icon: Megaphone },
        { to: '/app/approvals', label: 'Approvals', icon: CheckSquare },
        { to: '/app/messages', label: 'Messages', icon: Mail },
      ],
    },
    {
      title: 'Storage',
      items: [
        { to: '/app/archive', label: 'Archive', icon: Archive },
        { to: '/app/bin', label: 'Bin', icon: Trash2 },
      ],
    },
  ];

  const manageItems = [];
  if (currentRole === 'admin' || currentRole === 'co_admin') {
    manageItems.push({ to: '/app/members', label: 'Members', icon: Users });
  }
  if (currentRole === 'admin') {
    manageItems.push({ to: '/app/positions', label: 'Positions', icon: Briefcase });
    manageItems.push({ to: '/app/org', label: 'Organization', icon: Gauge });
  }
  if (manageItems.length) sections.push({ title: 'Manage', items: manageItems });

  sections.push({ items: [{ to: '/app/settings', label: 'Settings', icon: Settings }] });

  const used = org?.storage_used_bytes ?? 0;
  const quota = org?.storage_quota_bytes ?? 1;
  const { value: pctValue, label: pct } = storagePercent(used, quota);

  return (
    <div className="flex min-h-screen bg-surface-light-2 dark:bg-surface-dark">
      <Sidebar
        sections={sections}
        footer={
          <div className="rounded-xl bg-navy-50 p-3 dark:bg-white/5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>Office storage</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div className="h-full rounded-full bg-gold-sheen" style={{ width: `${Math.max(pctValue, used > 0 ? 2 : 0)}%` }} />
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400">
              {formatBytes(used)} of {formatBytes(quota)}
            </p>
          </div>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
