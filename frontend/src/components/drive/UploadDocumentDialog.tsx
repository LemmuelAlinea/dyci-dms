import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UploadCloud } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { DynamicFields } from './DynamicFields';
import { allocateReference, listDocumentTypes, type DocumentType } from '@/lib/documentTypes';
import { addAttachment, uploadFile } from '@/lib/drive';

export function UploadDocumentDialog({
  open,
  onClose,
  orgId,
  ownerId,
  folderId,
  initialFile,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  ownerId: string;
  folderId: string | null;
  initialFile?: File | null;
  onUploaded: () => void;
}) {
  const [typeId, setTypeId] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const types = useQuery({ queryKey: ['docTypes', orgId], queryFn: () => listDocumentTypes(orgId), enabled: open });

  useEffect(() => {
    if (open) setFiles(initialFile ? [initialFile] : []);
  }, [open, initialFile]);

  // Default to the first type when the list loads.
  useEffect(() => {
    if (open && !typeId && types.data?.length) setTypeId(types.data[0].id);
  }, [open, typeId, types.data]);

  const selected: DocumentType | undefined = useMemo(
    () => types.data?.find((t) => t.id === typeId),
    [types.data, typeId],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentType[]>();
    for (const t of types.data ?? []) {
      const cat = t.category?.name ?? 'Documents';
      map.set(cat, [...(map.get(cat) ?? []), t]);
    }
    return [...map.entries()];
  }, [types.data]);

  const reset = () => {
    setTypeId('');
    setValues({});
    setFiles([]);
  };

  const submit = async () => {
    if (!selected) return toast.error('Choose a document type');
    if (!files.length) return toast.error('Choose a file');
    for (const f of selected.fields) {
      if (f.required && !values[f.key]) return toast.error(`${f.label} is required`);
    }
    setBusy(true);
    try {
      const referenceNo = await allocateReference(orgId, selected.id);
      const row = await uploadFile(orgId, ownerId, folderId, files[0], {
        documentTypeId: selected.id,
        categoryId: selected.category_id,
        referenceNo,
        metadata: values,
      });
      if (selected.allow_multiple) {
        for (const extra of files.slice(1)) await addAttachment(row, extra);
      }
      toast.success(`Uploaded · ${referenceNo}`);
      reset();
      onUploaded();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Upload document"
      size="lg"
      footer={
        <>
          <button className="btn-ghost" onClick={() => { reset(); onClose(); }}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : 'Upload'}
          </button>
        </>
      }
    >
      {types.isLoading ? (
        <div className="grid place-items-center py-8"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Document type</label>
            <select value={typeId} onChange={(e) => { setTypeId(e.target.value); setValues({}); }} className="input">
              {grouped.map(([cat, list]) => (
                <optgroup key={cat} label={cat}>
                  {list.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {selected && <DynamicFields fields={selected.fields} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />}

          <div>
            <label className="label">{selected?.allow_multiple ? 'Files' : 'File'}</label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 transition hover:border-navy-400 dark:border-white/10">
              <UploadCloud size={18} className="text-navy-500" />
              {files.length === 0
                ? (selected?.allow_multiple ? 'Choose one or more files…' : 'Choose a PDF, Word, or Excel file…')
                : <span className="font-medium text-navy-900 dark:text-white">{files.length === 1 ? files[0].name : `${files.length} files selected`}</span>}
              <input
                type="file"
                hidden
                multiple={!!selected?.allow_multiple}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </label>
            {selected && <p className="mt-1.5 text-[11px] text-slate-400">A reference number will be generated from "{selected.reference_format}".{selected.allow_multiple ? ' Multiple files allowed.' : ''}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
