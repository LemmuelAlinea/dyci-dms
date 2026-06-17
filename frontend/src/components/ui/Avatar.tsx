import { cn, initials } from '@/lib/utils';

export function Avatar({
  name,
  url,
  size = 36,
  className,
}: {
  name?: string | null;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? 'avatar'}
        width={size}
        height={size}
        className={cn('rounded-full object-cover ring-2 ring-white dark:ring-surface-dark-2', className)}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={cn(
        'grid place-items-center rounded-full bg-navy-700 font-semibold text-white ring-2 ring-white dark:ring-surface-dark-2',
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
