import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { createCategory, deleteCategory, listCategories, renameCategory } from '@/lib/docTypeAdmin';

export function CategoriesDialog({ open, onClose, orgId }: { open: boolean; onClose: () => void; orgId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const cats = useQuery({ queryKey: ['categories', orgId], queryFn: () => listCategories(orgId), enabled: open });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['categories', orgId] });
    qc.invalidateQueries({ queryKey: ['allDocTypes', orgId] });
  };

  const add = async () => {
    if (!name.trim()) return;
    try {
      await createCategory(orgId, name.trim(), cats.data?.length ?? 0);
      setName('');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage categories">
      <div className="mb-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} className="input" placeholder="New category (e.g. Memos & Reports)" />
        <button onClick={add} className="btn-primary shrink-0"><Plus size={16} /> Add</button>
      </div>
      {cats.isLoading ? (
        <div className="grid place-items-center py-6"><Spinner /></div>
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {(cats.data ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
              <input
                defaultValue={c.name}
                onBlur={async (e) => { if (e.target.value.trim() && e.target.value !== c.name) { await renameCategory(c.id, e.target.value.trim()); refresh(); } }}
                className="input !py-1.5 flex-1"
              />
              <button
                onClick={async () => { await deleteCategory(c.id); refresh(); }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                title="Delete category"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!cats.data?.length && <p className="py-4 text-center text-sm text-slate-400">No categories yet.</p>}
        </div>
      )}
    </Modal>
  );
}
