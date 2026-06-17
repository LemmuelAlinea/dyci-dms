import { Fragment } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  id: string | null;
  name: string;
}

export function Breadcrumbs({ trail, onNavigate }: { trail: Crumb[]; onNavigate: (id: string | null) => void }) {
  return (
    <nav className="flex flex-wrap items-center gap-0.5 text-sm">
      {trail.map((crumb, i) => {
        const last = i === trail.length - 1;
        return (
          <Fragment key={crumb.id ?? 'root'}>
            <button
              onClick={() => onNavigate(crumb.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition',
                last
                  ? 'text-navy-900 dark:text-white'
                  : 'text-slate-500 hover:bg-navy-50 hover:text-navy-700 dark:hover:bg-white/5',
              )}
            >
              {i === 0 && <Home size={14} />}
              <span className="max-w-[160px] truncate">{crumb.name}</span>
            </button>
            {!last && <ChevronRight size={15} className="text-slate-300" />}
          </Fragment>
        );
      })}
    </nav>
  );
}
