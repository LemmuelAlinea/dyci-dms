import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileBarChart2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { listMyDocuments, type MyDocFilters } from '@/lib/reports/staff';
import { listDocumentTypes } from '@/lib/documentTypes';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { DocStatus, FileItem } from '@/lib/types';

const STATUSES: DocStatus[] = ['draft', 'pending', 'approved', 'released', 'rejected'];

const columns: ColumnDef<FileItem>[] = [
  { key: 'reference', label: 'Reference', render: (f) => f.reference_no ?? '—' },
  { key: 'title', label: 'Title', render: (f) => f.name },
  { key: 'type', label: 'Type', render: (f) => f.document_type?.name ?? '—' },
  { key: 'status', label: 'Status', render: (f) => <StatusBadge status={f.status} /> },
  { key: 'created', label: 'Created', render: (f) => format(new Date(f.created_at), 'PP') },
  { key: 'released', label: 'Released', render: (f) => (f.released_at ? format(new Date(f.released_at), 'PP') : '—') },
];

export function MyDocumentsReport() {
  const { currentOrgId, session } = useAuth();
  const userId = session!.user.id;
  const [filters, setFilters] = useState<MyDocFilters>({});

  const types = useQuery({ queryKey: ['docTypes', currentOrgId], queryFn: () => listDocumentTypes(currentOrgId!), enabled: !!currentOrgId });
  const rows = useQuery({ queryKey: ['rpt-mydocs', userId, filters], queryFn: () => listMyDocuments(userId, filters) });

  const applied =
    [
      filters.from && `from ${filters.from}`,
      filters.to && `to ${filters.to}`,
      filters.status && `status ${filters.status}`,
      filters.documentTypeId && `type ${types.data?.find((t) => t.id === filters.documentTypeId)?.name ?? ''}`,
    ]
      .filter(Boolean)
      .join(', ') || 'All';

  return (
    <div>
      <PageHeader title="My Documents" subtitle="A printable register of the documents you own." icon={<FileBarChart2 size={22} />} />
      <ReportShell<FileItem>
        reportKey="my-documents"
        title="My Documents Report"
        orgId={currentOrgId}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data ?? []}
        loading={rows.isLoading}
        presetData={filters as Record<string, unknown>}
        onLoadPreset={(p) =>
          setFilters({
            from: (p.from as string) || undefined,
            to: (p.to as string) || undefined,
            status: (p.status as string) || undefined,
            documentTypeId: (p.documentTypeId as string) || undefined,
          })
        }
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div>
              <label className="label">From</label>
              <input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Status</label>
              <select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input">
                <option value="">Any</option>
                {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select value={filters.documentTypeId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, documentTypeId: e.target.value }))} className="input">
                <option value="">All</option>
                {(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </div>
            <button onClick={() => setFilters({})} className="btn-ghost">Clear</button>
          </div>
        }
      />
    </div>
  );
}
