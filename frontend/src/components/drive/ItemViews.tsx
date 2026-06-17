import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn, formatBytes } from '@/lib/utils';
import { FileKindIcon, FolderIcon } from '@/components/ui/FileKindIcon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { FileItem, Folder } from '@/lib/types';

export interface ActionItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
}

export function ActionMenu({ items }: { items: ActionItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!items.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
      >
        <MoreVertical size={17} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-navy dark:border-white/10 dark:bg-surface-dark-2"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((it) => (
              <button
                key={it.label}
                onClick={() => {
                  it.onClick();
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition',
                  it.danger
                    ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                    : 'text-slate-700 hover:bg-navy-50 dark:text-slate-200 dark:hover:bg-white/5',
                )}
              >
                <it.icon size={16} /> {it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FolderCard({ folder, onOpen, actions = [] }: { folder: Folder; onOpen: () => void; actions?: ActionItem[] }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className="card group flex cursor-pointer items-center gap-3 p-3.5 transition hover:-translate-y-0.5 hover:shadow-card"
    >
      <FolderIcon size={30} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{folder.name}</p>
        <p className="text-[11px] text-slate-400">Folder</p>
      </div>
      <ActionMenu items={actions} />
    </motion.div>
  );
}

export function FileCard({
  file,
  onOpen,
  actions = [],
  meta,
}: {
  file: FileItem;
  onOpen: () => void;
  actions?: ActionItem[];
  meta?: ReactNode;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className="card group flex cursor-pointer flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-card"
    >
      <div className="flex items-start justify-between">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 dark:bg-white/5">
          <FileKindIcon kind={file.kind} size={24} />
        </div>
        <ActionMenu items={actions} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-navy-900 dark:text-white" title={file.name}>
          {file.name}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          v{file.current_version} · {formatBytes(file.size_bytes)} · {formatDistanceToNow(new Date(file.updated_at), { addSuffix: true })}
        </p>
      </div>
      <div className="flex items-center justify-between">
        <StatusBadge status={file.status} />
        {meta}
      </div>
    </motion.div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-3 mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">{children}</p>;
}
