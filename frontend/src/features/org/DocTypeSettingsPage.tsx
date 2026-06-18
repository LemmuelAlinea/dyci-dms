import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCog, FolderTree, Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DocTypeEditor } from '@/components/org/DocTypeEditor';
import { CategoriesDialog } from '@/components/org/CategoriesDialog';
import { listAllDocumentTypes, listCategories } from '@/lib/docTypeAdmin';
import { listPositions } from '@/lib/positions';
import { useAuth } from '@/store/auth';
import type { DocumentType } from '@/lib/documentTypes';

export function DocTypeSettingsPage() {
  const qc = useQueryClient();
  const { currentOrgId, role } = useAuth();
  const orgId = currentOrgId!;
  const isAdmin = role() === 'admin';

  const [editing, setEditing] = useState<DocumentType | null>(null);
  const [creating, setCreating] = useState(false);
  const [cats, setCats] = useState(false);

  const types = useQuery({ queryKey: ['allDocTypes', orgId], queryFn: () => listAllDocumentTypes(orgId), enabled: isAdmin });
  const categories = useQuery({ queryKey: ['categories', orgId], queryFn: () => listCategories(orgId), enabled: isAdmin });
  const positions = useQuery({ queryKey: ['positions', orgId], queryFn: () => listPositions(orgId), enabled: isAdmin });
  const refresh = () => qc.invalidateQueries({ queryKey: ['allDocTypes', orgId] });

  if (!isAdmin) return <EmptyState title="Admins only" description="Only the organization admin can manage document types." />;

  const grouped = new Map<string, DocumentType[]>();
  for (const t of types.data ?? []) {
    const cat = t.category?.name ?? 'Uncategorized';
    grouped.set(cat, [...(grouped.get(cat) ?? []), t]);
  }

  return (
    <div>
      <PageHeader
        title="Document Types & Approvals"
        subtitle="Define what documents this office handles, their fields, and how they're approved."
        icon={<FileCog size={22} />}
        actions={
          <>
            <button onClick={() => setCats(true)} className="btn-outline"><FolderTree size={16} /> Categories</button>
            <button onClick={() => setCreating(true)} className="btn-primary"><Plus size={17} /> New type</button>
          </>
        }
      />

      {types.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !types.data?.length ? (
        <EmptyState icon="/assets/icon-document.png" title="No document types yet" description="Add your first document type to get started." />
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([cat, list]) => (
            <div key={cat}>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{cat}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => (
                  <button key={t.id} onClick={() => setEditing(t)} className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-navy-900 dark:text-white">{t.name}</p>
                      {!t.active && <span className="chip bg-slate-100 text-slate-500 dark:bg-white/10">Inactive</span>}
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{t.reference_format}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {t.publishable ? <StatusBadge status="released" /> : <span className="chip bg-slate-100 text-slate-500 dark:bg-white/10">Confidential</span>}
                      <span className="chip bg-navy-50 text-navy-600 dark:bg-white/10 dark:text-slate-300">{t.fields.length} fields</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <DocTypeEditor
          open
          onClose={() => { setCreating(false); setEditing(null); }}
          orgId={orgId}
          categories={categories.data ?? []}
          positions={positions.data ?? []}
          docType={editing ?? undefined}
          typeCount={types.data?.length ?? 0}
          onSaved={refresh}
        />
      )}
      <CategoriesDialog open={cats} onClose={() => setCats(false)} orgId={orgId} />
    </div>
  );
}
