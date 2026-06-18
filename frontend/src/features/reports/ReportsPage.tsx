import { Link } from 'react-router-dom';
import { FileBarChart2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ORG_REPORTS } from './registry';
import { useAuth } from '@/store/auth';

export function ReportsPage() {
  const role = useAuth((s) => s.role());
  const available = ORG_REPORTS.filter((r) => role && r.roles.includes(role));

  return (
    <div>
      <PageHeader title="Reports" subtitle="Generate and print office reports." icon={<FileBarChart2 size={22} />} />
      {available.length === 0 ? (
        <EmptyState title="No reports available" description="There are no reports for your role yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((r) => (
            <Link key={r.key} to={r.to} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-card">
              <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-navy-700 text-gold-300"><FileBarChart2 size={22} /></div>
              <p className="font-display text-base font-bold text-navy-900 dark:text-white">{r.title}</p>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
