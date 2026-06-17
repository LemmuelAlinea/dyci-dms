import { cn } from '@/lib/utils';
import { STATUS_META, type DocStatus } from '@/lib/types';

export function StatusBadge({ status, className }: { status: DocStatus; className?: string }) {
  const meta = STATUS_META[status];
  return <span className={cn('chip', meta.className, className)}>{meta.label}</span>;
}
