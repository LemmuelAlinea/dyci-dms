import { Outlet } from 'react-router-dom';
import { Building2, LayoutDashboard, Activity } from 'lucide-react';
import { Sidebar, type NavSection } from './Sidebar';
import { Topbar } from './Topbar';

const sections: NavSection[] = [
  {
    title: 'System Admin',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/organizations', label: 'Organizations', icon: Building2 },
      { to: '/admin/activity', label: 'Activity', icon: Activity },
    ],
  },
];

export function AdminShell() {
  return (
    <div className="flex min-h-screen bg-surface-light-2 dark:bg-surface-dark">
      <Sidebar
        sections={sections}
        footer={
          <div className="rounded-xl bg-gold-sheen/15 p-3 text-[11px] font-medium text-navy-700 dark:text-gold-200">
            System Console · monitoring only
          </div>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar showSearch={false} />
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
