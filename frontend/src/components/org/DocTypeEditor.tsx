import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { slug } from '@/lib/utils';
import { createDocumentType, deleteDocumentType, getChain, setChain, updateDocumentType, type Category } from '@/lib/docTypeAdmin';
import type { DocumentType, FieldDef, FieldType } from '@/lib/documentTypes';
import type { PositionWithHolders } from '@/lib/positions';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longtext', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'money', label: 'Money (₱)' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'yesno', label: 'Yes / No' },
];

export function DocTypeEditor({
  open,
  onClose,
  orgId,
  categories,
  positions,
  docType,
  typeCount,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  categories: Category[];
  positions: PositionWithHolders[];
  docType?: DocumentType;
  typeCount: number;
  onSaved: () => void;
}) {
  const editing = Boolean(docType);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [referenceFormat, setReferenceFormat] = useState('DOC-{YYYY}-{seq}');
  const [publishable, setPublishable] = useState(true);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [active, setActive] = useState(true);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(docType?.name ?? '');
    setCategoryId(docType?.category_id ?? categories[0]?.id ?? '');
    setReferenceFormat(docType?.reference_format ?? 'DOC-{YYYY}-{seq}');
    setPublishable(docType?.publishable ?? true);
    setAllowMultiple(docType?.allow_multiple ?? false);
    setActive(docType?.active ?? true);
    setFields(docType?.fields ? JSON.parse(JSON.stringify(docType.fields)) : []);
    if (docType) {
      getChain(docType.id).then((c) => setSteps(c.map((s) => s.position_id)));
    } else {
      setSteps([]);
    }
  }, [open, docType, categories]);

  const setField = (i: number, patch: Partial<FieldDef>) =>
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const n = [...s];
      const j = i + dir;
      if (j < 0 || j >= n.length) return n;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const save = async () => {
    if (!name.trim()) return toast.error('Name is required');
    if (!referenceFormat.includes('{seq}')) return toast.error('Reference format must include {seq}');
    // finalize field keys (generate stable keys for new fields)
    const used = new Set<string>();
    const finalFields: FieldDef[] = fields
      .filter((f) => f.label.trim())
      .map((f) => {
        let key = f.key || slug(f.label);
        if (!key) key = 'field';
        let k = key;
        let n = 1;
        while (used.has(k)) k = `${key}_${++n}`;
        used.add(k);
        return { key: k, label: f.label.trim(), type: f.type, required: f.required || undefined, options: f.type === 'dropdown' ? f.options ?? [] : undefined };
      });

    setBusy(true);
    try {
      const input = { name: name.trim(), category_id: categoryId || null, reference_format: referenceFormat.trim(), publishable, allow_multiple: allowMultiple, active, fields: finalFields };
      let id = docType?.id;
      if (editing) {
        await updateDocumentType(docType!.id, input);
      } else {
        const created = await createDocumentType(orgId, input, typeCount);
        id = created.id;
      }
      await setChain(orgId, id!, steps);
      toast.success(editing ? 'Document type updated' : 'Document type created');
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!docType) return;
    if (!confirm(`Delete "${docType.name}"? Existing files keep their data but lose this type.`)) return;
    setBusy(true);
    try {
      await deleteDocumentType(docType.id);
      toast.success('Document type deleted');
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit document type' : 'New document type'}
      size="lg"
      footer={
        <>
          {editing && <button onClick={remove} className="btn-ghost mr-auto !text-rose-600">Delete</button>}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Save'}</button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Settings */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Grade Sheet" />
          </div>
          <div>
            <label className="label">Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
              <option value="">— none —</option>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Reference format</label>
            <input value={referenceFormat} onChange={(e) => setReferenceFormat(e.target.value)} className="input font-mono" placeholder="GRD-{YYYY}-{seq}" />
            <p className="mt-1 text-[11px] text-slate-400">Use <code>{'{YYYY}'}</code> and <code>{'{seq}'}</code>.</p>
          </div>
          <div className="flex flex-col justify-center gap-2 pt-5">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={publishable} onChange={(e) => setPublishable(e.target.checked)} className="h-4 w-4 accent-navy-700" />
              Can be released to the office feed
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} className="h-4 w-4 accent-navy-700" />
              Accept multiple file uploads
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-navy-700" />
              Active (shown when uploading)
            </label>
          </div>
        </div>

        {/* Fields builder */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Fields</p>
            <button onClick={() => setFields((f) => [...f, { key: '', label: '', type: 'text' }])} className="btn-outline !py-1 !text-xs"><Plus size={13} /> Add field</button>
          </div>
          <div className="space-y-2">
            {fields.length === 0 && <p className="text-xs text-slate-400">No fields. Add some so uploaders can capture key info.</p>}
            {fields.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-2.5 dark:border-white/10">
                <div className="flex flex-wrap items-center gap-2">
                  <input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} className="input !py-1.5 min-w-[140px] flex-1" placeholder="Field label" />
                  <select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })} className="input !py-1.5 !w-auto">
                    {FIELD_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={Boolean(f.required)} onChange={(e) => setField(i, { required: e.target.checked })} className="h-4 w-4 accent-navy-700" /> Required</label>
                  <button onClick={() => setFields((arr) => arr.filter((_, idx) => idx !== i))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 size={15} /></button>
                </div>
                {f.type === 'dropdown' && (
                  <input
                    value={(f.options ?? []).join(', ')}
                    onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                    className="input !py-1.5 mt-2"
                    placeholder="Options, comma-separated (e.g. 1st Semester, 2nd Semester, Summer)"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Chain builder */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Approval chain</p>
            <button onClick={() => setSteps((s) => [...s, positions[0]?.id ?? ''])} className="btn-outline !py-1 !text-xs"><Plus size={13} /> Add step</button>
          </div>
          {positions.length === 0 && <p className="text-xs text-amber-600 dark:text-amber-300">No positions defined. Add positions on the Positions page first.</p>}
          <div className="space-y-2">
            {steps.length === 0 && <p className="text-xs text-slate-400">No steps — documents of this type are approved in a single free-pick step.</p>}
            {steps.map((posId, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-navy-700 text-xs font-bold text-white">{i + 1}</span>
                <select value={posId} onChange={(e) => setSteps((s) => s.map((p, idx) => (idx === i ? e.target.value : p)))} className="input !py-1.5 flex-1">
                  <option value="">Select position…</option>
                  {positions.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
                <button onClick={() => moveStep(i, -1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><ArrowUp size={14} /></button>
                <button onClick={() => moveStep(i, 1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><ArrowDown size={14} /></button>
                <button onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
