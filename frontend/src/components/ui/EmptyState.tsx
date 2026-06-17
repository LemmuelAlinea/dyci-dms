import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: string; // path under /assets
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center dark:border-white/10"
    >
      {icon ? (
        <img src={icon} alt="" className="h-20 w-20 animate-float object-contain opacity-90" />
      ) : null}
      <h3 className="font-display text-lg font-bold text-navy-900 dark:text-white">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </motion.div>
  );
}
