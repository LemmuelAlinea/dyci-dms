import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { listMyReleased, type ReleasedFilters } from '@/lib/reports/staff';
import { listDocumentTypes } from '@/lib/documentTypes';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { FileItem } from '@/lib/types';

const columns: ColumnDef<FileItem>[] = [
  { key: 'reference', label: 'Reference', render: (f) => f.reference_no ?? '—' },
  { key: 'title', label: 'Title', render: (f) => f.name },
  { key: 'type', label: 'Type', render: (f) => f.document_type?.name ?? '—' },
  { key: 'approver', label: 'Approved by', render: (f) => f.approver?.full_name ?? '—' },
  { key: 'released', label: 'Released', render: (f) => (f.released_at ? format(new Date(f.released_at), 'PP') : '—') },
];

export function MyReleasedReport() {
  const { currentOrgId, session } = useAuth();
  const userId = session!.user.id;
  const [filters, setFilters] = useState<ReleasedFilters>({});
  const types = useQuery({ queryKey: ['docTypes', currentOrgId], queryFn: () => listDocumentTypes(currentOrgId!), enabled: !!currentOrgId });
  const rows = useQuery({ queryKey: ['rpt-myreleased', userId, filters], queryFn: () => listMyReleased(userId, filters) });

  const applied = [filters.from && `from ${filters.from}`, filters.to && `to ${filters.to}`, filters.documentTypeId && `type ${types.data?.find((t) => t.id === filters.documentTypeId)?.name ?? ''}`].filter(Boolean).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="My Released Papers" subtitle="Your documents that have been released." icon={<Megaphone size={22} />} />
      <ReportShell<FileItem>
        reportKey="my-released"
        title="My Released Papers Report"
        orgId={currentOrgId}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data ?? []}
        loading={rows.isLoading}
        presetData={filters as Record<string, unknown>}
        onLoadPreset={(p) => setFilters({ from: (p.from as string) || undefined, to: (p.to as string) || undefined, documentTypeId: (p.documentTypeId as string) || undefined })}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">From</label><input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" /></div>
            <div><label className="label">To</label><input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" /></div>
            <div><label className="label">Type</label><select value={filters.documentTypeId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, documentTypeId: e.target.value || undefined }))} className="input"><option value="">All</option>{(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
            <button onClick={() => setFilters({})} className="btn-ghost">Clear</button>
          </div>
        }
      />
    </div>
  );
}
