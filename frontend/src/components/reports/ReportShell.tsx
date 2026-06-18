import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, Columns3, Printer, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { ReportLayout } from './ReportLayout';
import { ReportTable } from './ReportTable';
import { deletePreset, listPresets, savePreset } from '@/lib/reports/presets';
import type { ColumnDef } from '@/lib/reports/types';
import { useAuth } from '@/store/auth';

export function ReportShell<T>({
  reportKey,
  title,
  orgId,
  orgName,
  appliedFilters,
  filterPanel,
  columns,
  rows,
  loading,
  presetData,
  onLoadPreset,
  extra,
}: {
  reportKey: string;
  title: string;
  orgId: string | null;
  orgName?: string;
  appliedFilters: string;
  filterPanel: ReactNode;
  columns: ColumnDef<T>[];
  rows: T[];
  loading: boolean;
  presetData: Record<string, unknown>;
  onLoadPreset: (data: Record<string, unknown>) => void;
  extra?: ReactNode;
}) {
  const fullName = useAuth((s) => s.profile?.full_name) ?? 'User';
  const [hidden, setHidden] = useState<Set<string>>(new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));
  const [colsOpen, setColsOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const presets = useQuery({ queryKey: ['presets', reportKey, orgId], queryFn: () => listPresets(reportKey, orgId) });
  const visible = columns.filter((c) => !hidden.has(c.key));

  const toggleCol = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const save = async () => {
    const name = window.prompt('Save this view as…');
    if (!name?.trim()) return;
    await savePreset(reportKey, name.trim(), { ...presetData, _hidden: [...hidden] }, orgId);
    presets.refetch();
    setPresetsOpen(false);
  };

  const load = (params: Record<string, unknown>) => {
    const h = (params as { _hidden?: unknown })._hidden;
    if (Array.isArray(h)) setHidden(new Set(h as string[]));
    onLoadPreset(params);
    setPresetsOpen(false);
  };

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowFilters((s) => !s)} className="btn-outline md:hidden"><SlidersHorizontal size={16} /> Filters</button>

        <div className="relative">
          <button onClick={() => setColsOpen((o) => !o)} className="btn-outline"><Columns3 size={16} /> Columns</button>
          {colsOpen && (
            <div className="absolute z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-navy dark:border-white/10 dark:bg-surface-dark-2">
              {columns.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleCol(c.key)} className="h-4 w-4 accent-navy-700" />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button onClick={() => setPresetsOpen((o) => !o)} className="btn-outline"><Bookmark size={16} /> Presets</button>
          {presetsOpen && (
            <div className="absolute z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-navy dark:border-white/10 dark:bg-surface-dark-2">
              <button onClick={save} className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-navy-700 hover:bg-navy-50 dark:text-gold-300 dark:hover:bg-white/5">+ Save current view</button>
              <div className="my-1 border-t border-slate-100 dark:border-white/10" />
              {(presets.data ?? []).length === 0 && <p className="px-2 py-2 text-xs text-slate-400">No saved presets.</p>}
              {(presets.data ?? []).map((p) => (
                <div key={p.id} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-50 dark:hover:bg-white/5">
                  <button onClick={() => load(p.params)} className="flex-1 truncate py-0.5 text-left text-sm text-navy-900 dark:text-slate-200">{p.name}</button>
                  <button onClick={async () => { await deletePreset(p.id); presets.refetch(); }} className="rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => window.print()} className="btn-primary ml-auto"><Printer size={16} /> Print / Save as PDF</button>
      </div>

      <div className={`no-print mb-5 ${showFilters ? '' : 'hidden md:block'}`}>{filterPanel}</div>

      {loading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : (
        <ReportLayout title={title} orgName={orgName} appliedFilters={appliedFilters} generatedBy={fullName}>
          <ReportTable columns={visible} rows={rows} />
          {extra}
        </ReportLayout>
      )}
    </div>
  );
}
