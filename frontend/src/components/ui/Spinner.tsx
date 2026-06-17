import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-5 w-5 animate-spin rounded-full border-2 border-navy-200 border-t-navy-700 dark:border-white/20 dark:border-t-gold-300',
        className,
      )}
    />
  );
}

export function FullPageLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-light-2 dark:bg-surface-dark">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="h-8 w-8" />
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    </div>
  );
}
