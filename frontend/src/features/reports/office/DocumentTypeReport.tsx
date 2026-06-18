import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileSpreadsheet } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ReportShell } from '@/components/reports/ReportShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api, type ByTypeField } from '@/lib/api';
import { listDocumentTypes } from '@/lib/documentTypes';
import { useAuth } from '@/store/auth';
import type { ColumnDef } from '@/lib/reports/types';
import type { DocStatus } from '@/lib/types';

type Row = { id: string; reference_no: string | null; status: string; created_at: string; owner_name: string | null; metadata: Record<string, unknown> };
const STATUSES: DocStatus[] = ['draft', 'pending', 'approved', 'released', 'rejected'];

const peso = (n: number) => `₱${n.toLocaleString()}`;

function buildColumns(fields: ByTypeField[]): ColumnDef<Row>[] {
  const base: ColumnDef<Row>[] = [
    { key: 'reference', label: 'Reference', render: (r) => r.reference_no ?? '—' },
    { key: 'owner', label: 'Owner', render: (r) => r.owner_name ?? '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status as DocStatus} /> },
    { key: 'created', label: 'Created', render: (r) => format(new Date(r.created_at), 'PP') },
  ];
  const fieldCols: ColumnDef<Row>[] = fields.map((f) => ({
    key: `m_${f.key}`,
    label: f.label,
    align: f.type === 'money' || f.type === 'number' ? 'right' : 'left',
    render: (r) => {
      const v = r.metadata?.[f.key];
      if (v === undefined || v === null || v === '') return '—';
      if (f.type === 'money') return peso(Number(v));
      if (f.type === 'yesno') return v ? 'Yes' : 'No';
      return String(v);
    },
    total:
      f.type === 'money'
        ? (rows) => peso(rows.reduce((s, r) => s + (Number(r.metadata?.[f.key]) || 0), 0))
        : undefined,
  }));
  return [...base, ...fieldCols];
}

export function DocumentTypeReport() {
  const { currentOrgId, memberships } = useAuth();
  const orgId = currentOrgId!;
  const orgName = memberships.find((m) => m.org_id === orgId)?.organizations?.name;
  const [typeId, setTypeId] = useState('');
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});

  const types = useQuery({ queryKey: ['docTypes', orgId], queryFn: () => listDocumentTypes(orgId) });
  const data = useQuery({
    queryKey: ['rpt-bytype', orgId, typeId, filters],
    queryFn: () => api.reportOrgByType(orgId, { documentTypeId: typeId, ...filters }),
    enabled: !!typeId,
  });

  const columns = useMemo(() => buildColumns(data.data?.fields ?? []), [data.data?.fields]);
  const typeName = types.data?.find((t) => t.id === typeId)?.name ?? '';
  const applied = [typeName, ...Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`)].filter(Boolean).join(', ') || 'All';

  return (
    <div>
      <PageHeader title="Document-Type Report" subtitle="A detailed report of one document type with its fields and totals." icon={<FileSpreadsheet size={22} />} />
      <ReportShell<Row>
        reportKey="document-type"
        title={`Document-Type Report${typeName ? ` — ${typeName}` : ''}`}
        orgId={orgId}
        orgName={orgName}
        appliedFilters={applied}
        columns={columns}
        rows={typeId ? data.data?.rows ?? [] : []}
        loading={!!typeId && data.isLoading}
        presetData={{ typeId, ...filters }}
        onLoadPreset={(p) => { if (p.typeId) setTypeId(p.typeId as string); setFilters({ from: p.from as string, to: p.to as string, status: p.status as string }); }}
        filterPanel={
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div><label className="label">Document type</label><select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="input"><option value="">Select a type…</option>{(types.data ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
            <div><label className="label">From</label><input type="date" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input" /></div>
            <div><label className="label">To</label><input type="date" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input" /></div>
            <div><label className="label">Status</label><select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input"><option value="">Any</option>{STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            <button onClick={() => setFilters({})} className="btn-ghost">Clear</button>
          </div>
        }
      />
    </div>
  );
}
