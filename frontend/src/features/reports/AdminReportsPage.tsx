import { Link } from 'react-router-dom';
import { Database } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ADMIN_REPORTS } from './registry';

export function AdminReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Platform-wide reports." icon={<Database size={22} />} />
      {ADMIN_REPORTS.length === 0 ? (
        <EmptyState title="No reports yet" description="Platform reports will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_REPORTS.map((r) => (
            <Link key={r.key} to={r.to} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-card">
              <p className="font-display text-base font-bold text-navy-900 dark:text-white">{r.title}</p>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
