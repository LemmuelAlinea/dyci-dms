import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { signedUrlForVersion } from '@/lib/drive';
import { previewCategory, formatBytes } from '@/lib/utils';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { Spinner } from '@/components/ui/Spinner';
import type { FileItem } from '@/lib/types';

export function FilePreview({ file, canDownload = true }: { file: FileItem; canDownload?: boolean }) {
  const category = previewCategory(file.name, file.kind);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    category === 'pdf' || category === 'image' || category === 'text',
  );

  const wordRef = useRef<HTMLDivElement>(null);
  const excelRef = useRef<HTMLDivElement>(null);
  // Separate loading state for word/excel so the ref-holding divs stay mounted.
  const [binaryLoading, setBinaryLoading] = useState(
    category === 'word' || category === 'excel',
  );

  // Fetch url/text for pdf, image, and text categories only.
  useEffect(() => {
    let active = true;
    setUrl(null);
    setText(null);
    const willLoad = category === 'pdf' || category === 'image' || category === 'text';
    setLoading(willLoad);
    if (willLoad) {
      signedUrlForVersion(file.id, file.current_version)
        .then(async (u) => {
          if (!active) return;
          setUrl(u);
          if (category === 'text') {
            const res = await fetch(u);
            const body = await res.text();
            if (active) setText(body.slice(0, 100_000));
          }
        })
        .catch((e) => { if (active) toast.error((e as Error).message); })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [file.id, file.current_version, category]);

  // Word renderer via docx-preview.
  useEffect(() => {
    if (category !== 'word') return;
    let active = true;
    setBinaryLoading(true);
    signedUrlForVersion(file.id, file.current_version)
      .then((u) => fetch(u))
      .then((r) => r.arrayBuffer())
      .then(async (buf) => {
        if (!active || !wordRef.current) return;
        const { renderAsync } = await import('docx-preview');
        wordRef.current.innerHTML = '';
        await renderAsync(buf, wordRef.current);
      })
      .catch((e) => { if (active) toast.error((e as Error).message); })
      .finally(() => { if (active) setBinaryLoading(false); });
    return () => { active = false; };
  }, [file.id, file.current_version, category]);

  // Excel renderer via SheetJS.
  useEffect(() => {
    if (category !== 'excel') return;
    let active = true;
    setBinaryLoading(true);
    signedUrlForVersion(file.id, file.current_version)
      .then((u) => fetch(u))
      .then((r) => r.arrayBuffer())
      .then(async (buf) => {
        if (!active || !excelRef.current) return;
        const XLSX = await import('xlsx');
        const wb = XLSX.read(buf, { type: 'array' });
        const first = wb.SheetNames[0];
        const html = first ? XLSX.utils.sheet_to_html(wb.Sheets[first]) : '<p>Empty workbook</p>';
        excelRef.current.innerHTML = html;
      })
      .catch((e) => { if (active) toast.error((e as Error).message); })
      .finally(() => { if (active) setBinaryLoading(false); });
    return () => { active = false; };
  }, [file.id, file.current_version, category]);

  const download = async () =>
    window.open(await signedUrlForVersion(file.id, file.current_version, true), '_blank');

  // Word and Excel: always mount the ref-holding div so effects can write into it.
  // Show a spinner overlay while binaryLoading is true.
  if (category === 'word') {
    return (
      <div className="relative">
        {binaryLoading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-white/70">
            <Spinner className="h-7 w-7" />
          </div>
        )}
        <div ref={wordRef} className="max-h-[560px] overflow-auto bg-white p-4" />
      </div>
    );
  }

  if (category === 'excel') {
    return (
      <div className="relative">
        {binaryLoading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-white/70">
            <Spinner className="h-7 w-7" />
          </div>
        )}
        <div
          ref={excelRef}
          className="max-h-[560px] overflow-auto bg-white p-2 text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1"
        />
      </div>
    );
  }

  if (loading) {
    return <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>;
  }

  if (category === 'pdf' && url) {
    return <iframe title="preview" src={url} className="h-[560px] w-full" />;
  }

  if (category === 'image' && url) {
    return (
      <div className="grid place-items-center bg-slate-50 p-4 dark:bg-white/5">
        <img src={url} alt={file.name} className="max-h-[560px] max-w-full rounded-lg object-contain" />
      </div>
    );
  }

  if (category === 'text' && text != null) {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    return isCsv ? <CsvTable text={text} /> : (
      <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-slate-700 dark:text-slate-200">{text}</pre>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <FileKindIcon kind={file.kind} size={44} />
      <p className="text-sm text-slate-500">No inline preview for this file type.</p>
      <p className="text-xs text-slate-400">{formatBytes(file.size_bytes)}</p>
      {canDownload && (
        <button onClick={download} className="btn-primary"><Download size={16} /> Download to view</button>
      )}
    </div>
  );
}

function CsvTable({ text }: { text: string }) {
  // Naive split — does not handle RFC 4180 quoted fields. Acceptable for a read-only preview.
  const rows = text.split(/\r?\n/).filter((r) => r.length).slice(0, 200).map((r) => r.split(','));
  return (
    <div className="max-h-[560px] overflow-auto p-2">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className={i === 0 ? 'font-semibold' : ''}>
              {cells.map((c, j) => (
                <td key={j} className="border border-slate-100 px-2 py-1 dark:border-white/10">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
