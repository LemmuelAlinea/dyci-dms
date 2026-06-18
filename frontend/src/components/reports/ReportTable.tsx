import type { ColumnDef } from '@/lib/reports/types';

export function ReportTable<T>({ columns, rows }: { columns: ColumnDef<T>[]; rows: T[] }) {
  const hasTotals = columns.some((c) => c.total);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-white/10">
            {columns.map((c) => (
              <th key={c.key} className={`px-2 py-2 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-white/5">
              {columns.map((c) => (
                <td key={c.key} className={`px-2 py-1.5 align-top text-navy-900 dark:text-slate-200 ${c.align === 'right' ? 'text-right' : ''}`}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="py-8 text-center text-slate-400">No records found.</td></tr>
          )}
        </tbody>
        {hasTotals && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold text-navy-900 dark:border-white/20 dark:text-white">
              {columns.map((c) => (
                <td key={c.key} className={`px-2 py-2 ${c.align === 'right' ? 'text-right' : ''}`}>{c.total ? c.total(rows) : ''}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
