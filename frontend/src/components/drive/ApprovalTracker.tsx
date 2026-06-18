import { Fragment } from 'react';
import { Check, ChevronRight, Clock, Circle, X } from 'lucide-react';
import type { ApprovalStep, StepStatus } from '@/lib/types';

function Dot({ status }: { status: StepStatus }) {
  if (status === 'approved') return <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><Check size={12} /></span>;
  if (status === 'pending') return <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-navy-900"><Clock size={12} /></span>;
  if (status === 'rejected') return <span className="grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white"><X size={12} /></span>;
  return <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-slate-400 dark:bg-white/10"><Circle size={10} /></span>;
}

export function ApprovalTracker({ steps }: { steps: ApprovalStep[] }) {
  if (!steps.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((s, i) => (
        <Fragment key={s.id}>
          <div className="flex items-center gap-1.5">
            <Dot status={s.status} />
            <span className="text-xs text-navy-900 dark:text-slate-200">
              {s.position?.name ?? 'Approver'}
              {s.assignee && <span className="text-slate-400"> · {s.assignee.full_name}</span>}
            </span>
          </div>
          {i < steps.length - 1 && <ChevronRight size={14} className="text-slate-300" />}
        </Fragment>
      ))}
    </div>
  );
}
