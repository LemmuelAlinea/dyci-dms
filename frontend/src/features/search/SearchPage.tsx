import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { hasAnyFilter, searchFiles, type SearchFilters } from '@/lib/search';
import { listDocumentTypes } from '@/lib/documentTypes';
import { listCategories } from '@/lib/docTypeAdmin';
import { useAuth } from '@/store/auth';
import type { DocStatus } from '@/lib/types';

const STATUSES: DocStatus[] = ['draft', 'pending', 'approved', 'released', 'rejected'];

export function SearchPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orgId = useAuth((s) => s.currentOrgId)!;

  const [term, setTerm] = useState(params.get('q') ?? '');
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<DocStatus | ''>('');
  const [metadata, setMetadata] = useState<Record<string, string>>({});

  useEffect(() => {
    setTerm(params.get('q') ?? '');
  }, [params]);

  const docTypes = useQuery({ queryKey: ['docTypes', orgId], queryFn: () => listDocumentTypes(orgId) });
  const categories = useQuery({ queryKey: ['categories', orgId], queryFn: () => listCategories(orgId) });

  const selectedType = useMemo(
    () => docTypes.data?.find((t) => t.id === documentTypeId),
    [docTypes.data, documentTypeId],
  );

  const filters: SearchFilters = { term, documentTypeId, categoryId, status, metadata };
  const results = useQuery({
    queryKey: ['search', orgId, term, documentTypeId, categoryId, status, metadata],
    queryFn: () => searchFiles(orgId, filters),
    enabled: hasAnyFilter(filters),
  });

  const onTypeChange = (id: string) => {
    setDocumentTypeId(id);
    setMetadata({});
  };

  return (
    <div>
      <PageHeader title="Search" subtitle="Find documents by name, reference, type, status, or their details." icon={<Search size={22} />} />

      <div className="card mb-6 space-y-3 p-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} className="input pl-9" placeholder="Search by file name or reference number…" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal size={15} className="text-slate-400" />
          <select value={documentTypeId} onChange={(e) => onTypeChange(e.target.value)} className="input !w-auto !py-2 text-sm">
            <option value="">All document types</option>
            {(docTypes.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input !w-auto !py-2 text-sm">
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as DocStatus | '')} className="input !w-auto !py-2 text-sm">
            <option value="">Any status</option>
            {STATUSES.map((s) => (<option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>))}
          </select>
        </div>

        {selectedType && selectedType.fields.length > 0 && (
          <div className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-3 dark:border-white/10">
            {selectedType.fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-[11px] font-medium text-slate-400">{f.label}</label>
                {f.type === 'dropdown' ? (
                  <select
                    value={metadata[f.key] ?? ''}
                    onChange={(e) => setMetadata((m) => ({ ...m, [f.key]: e.target.value }))}
                    className="input !py-1.5 text-sm"
                  >
                    <option value="">Any</option>
                    {(f.options ?? []).map((o) => (<option key={o} value={o}>{o}</option>))}
                  </select>
                ) : (
                  <input
                    value={metadata[f.key] ?? ''}
                    onChange={(e) => setMetadata((m) => ({ ...m, [f.key]: e.target.value }))}
                    className="input !py-1.5 text-sm"
                    placeholder={`Filter by ${f.label.toLowerCase()}`}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!hasAnyFilter(filters) ? (
        <EmptyState title="Search your office" description="Type a name or reference, or pick a document type to filter by its fields." />
      ) : results.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !results.data?.length ? (
        <EmptyState icon="/assets/icon-document.png" title="No matches" description="Try a different search or fewer filters." />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">{results.data.length} result{results.data.length === 1 ? '' : 's'}</p>
          {results.data.map((f) => (
            <div
              key={f.id}
              onClick={() => navigate(`/app/file/${f.id}`)}
              className="card flex cursor-pointer items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-card"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-50 dark:bg-white/5">
                <FileKindIcon kind={f.kind} size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">
                  {f.name}
                  {f.reference_no && <span className="ml-2 font-mono text-[10px] text-navy-500 dark:text-gold-300">{f.reference_no}</span>}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  {f.document_type?.name && <span>{f.document_type.name} ·</span>}
                  {f.owner && <Avatar name={f.owner.full_name} url={f.owner.avatar_url} size={16} />}
                  {f.owner?.full_name}
                </p>
              </div>
              <StatusBadge status={f.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
