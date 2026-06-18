import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BookText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api, type DocRegisterRow } from '@/lib/api';
import { listDocumentTypes } from '@/lib/documentTypes';
import { listCategories } from '@/lib/docTypeAdmin';
import { listMembers } from '@/lib/org';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { DocStatus } from '@/lib/types';

const STATUSES: DocStatus[] = ['draft', 'pending', 'approved', 'released', 'rejected'];

const columns: ColumnDef<DocRegisterRow>[] = [
  { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
  { key: 'title', label: 'Title', render: (r) => r.name },
  { key: 'type', label: 'Type', render: (r) => r.type_name ?? '—' },
  { key: 'category', label: 'Category', render: (r) => r.category_name ?? '—' },
  { key: 'owner', label: 'Owner', render: (r) => r.owner_name ?? '—' },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status as DocStatus} /> },
  { key: 'created', label: 'Created', render: (r) => format(new Date(r.created_at), 'PP') },
  { key: 'released', label: 'Released', render: (r) => (r.released_at ? format(new Date(r.released_at), 'PP') : '—') },
];

export function DocumentRegisterReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});

  const types = useQuery({ queryKey: ['docTypes', orgId], queryFn: () => listDocumentTypes(orgId) });
  const cats = useQuery({ queryKey: ['categories', orgId], queryFn: () => listCategories(orgId) });
  const members = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId) });
  const rows = useQuery({ queryKey: ['rpt-docreg', orgId, filters], queryFn: () => api.reportOrgDocuments(orgId, filters) });

  const applied = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="Document Register" subtitle="Every document in this office." icon={<BookText size={22} />} />
      <ReportShell<DocRegisterRow>
        reportKey="document-register"
        title="Document Register"
        orgId={orgId}
        orgName={orgName}
        appliedFilters={applied}
        columns={columns}
        rows={rows.data?.rows ?? []}
        loading={rows.isLoading}
        presetData={filters}
        onLoadPreset={(p) => setFilters(p as Record<string, string | undefined>)}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">From</label><input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" /></div>
            <div><label className="label">To</label><input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" /></div>
            <div><label className="label">Status</label><select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input"><option value="">Any</option>{STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            <div><label className="label">Type</label><select value={filters.type ?? ''} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="input"><option value="">All</option>{(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
            <div><label className="label">Category</label><select value={filters.category ?? ''} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className="input"><option value="">All</option>{(cats.data ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
            <div><label className="label">Owner</label><select value={filters.owner ?? ''} onChange={(e) => setFilters((f) => ({ ...f, owner: e.target.value }))} className="input"><option value="">Anyone</option>{(members.data ?? []).map((m) => (<option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>))}</select></div>
            <button onClick={() => setFilters({})} className="btn-ghost">Clear</button>
          </div>
        }
      />
    </div>
  );
}
