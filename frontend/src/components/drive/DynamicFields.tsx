import type { FieldDef } from '@/lib/documentTypes';

export function DynamicFields({
  fields,
  values,
  onChange,
}: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (!fields.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className={f.type === 'longtext' ? 'sm:col-span-2' : ''}>
          <label className="label">
            {f.label}
            {f.required && <span className="text-rose-500"> *</span>}
          </label>
          {f.type === 'longtext' ? (
            <textarea
              value={(values[f.key] as string) ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              rows={3}
              className="input resize-none"
            />
          ) : f.type === 'dropdown' ? (
            <select value={(values[f.key] as string) ?? ''} onChange={(e) => onChange(f.key, e.target.value)} className="input">
              <option value="">Select…</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : f.type === 'yesno' ? (
            <label className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={Boolean(values[f.key])} onChange={(e) => onChange(f.key, e.target.checked)} className="h-4 w-4 accent-navy-700" />
              Yes
            </label>
          ) : (
            <div className="relative">
              {f.type === 'money' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₱</span>}
              <input
                type={f.type === 'number' || f.type === 'money' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                value={(values[f.key] as string | number) ?? ''}
                onChange={(e) => onChange(f.key, f.type === 'number' || f.type === 'money' ? e.target.value : e.target.value)}
                className={`input ${f.type === 'money' ? 'pl-7' : ''}`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
