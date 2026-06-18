import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { Logo } from '@/components/ui/Logo';

export function ReportLayout({
  title,
  orgName,
  appliedFilters,
  generatedBy,
  children,
}: {
  title: string;
  orgName?: string;
  appliedFilters?: string;
  generatedBy: string;
  children: ReactNode;
}) {
  return (
    <div className="report-print card p-6">
      <div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
        <Logo size={56} />
        <div>
          <p className="font-display text-lg font-extrabold text-navy-900 dark:text-white">Dr. Yanga's Colleges, Inc.</p>
          <p className="text-xs text-slate-500">Bocaue, Bulacan{orgName ? ` · ${orgName}` : ''}</p>
        </div>
      </div>
      <div className="mb-4">
        <h2 className="font-display text-xl font-bold text-navy-900 dark:text-white">{title}</h2>
        {appliedFilters && <p className="mt-0.5 text-xs text-slate-500">Filters: {appliedFilters}</p>}
        <p className="text-[11px] text-slate-400">Generated on {format(new Date(), 'PPpp')} by {generatedBy}</p>
      </div>
      {children}
      <div className="mt-6 border-t border-slate-200 pt-2 text-[10px] text-slate-400 dark:border-white/10">
        DYCI Document Management System
      </div>
    </div>
  );
}
