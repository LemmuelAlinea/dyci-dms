import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { RotateCcw, Trash2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { FileCard, FolderCard, SectionLabel, type ActionItem } from '@/components/drive/ItemViews';
import { ConfirmDialog } from '@/components/drive/Dialogs';
import { listByState, permanentlyDeleteFile, setFileState, setFolderState } from '@/lib/drive';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import type { FileItem, Folder } from '@/lib/types';

export function BinPage() {
  const qc = useQueryClient();
  const { currentOrgId, session } = useAuth();
  const userId = session?.user.id;
  const orgId = currentOrgId!;
  const [confirm, setConfirm] = useState<{ title: string; desc: string; run: () => Promise<void> } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['bin', orgId, userId], queryFn: () => listByState(orgId, userId!, 'trashed'), enabled: !!userId });
  const refresh = () => qc.invalidateQueries({ queryKey: ['bin', orgId, userId] });

  const fileActions = (f: FileItem): ActionItem[] => [
    { label: 'Recover', icon: RotateCcw, onClick: async () => { await setFileState(f.id, 'active'); toast.success('Recovered'); refresh(); } },
    {
      label: 'Delete forever',
      icon: XCircle,
      danger: true,
      onClick: () => setConfirm({ title: 'Delete forever?', desc: `"${f.name}" and all its versions will be permanently deleted. This cannot be undone.`, run: async () => { await permanentlyDeleteFile(f); toast.success('Deleted permanently'); refresh(); } }),
    },
  ];
  const folderActions = (f: Folder): ActionItem[] => [
    { label: 'Recover', icon: RotateCcw, onClick: async () => { await setFolderState(f.id, 'active'); toast.success('Recovered'); refresh(); } },
    {
      label: 'Delete forever',
      icon: XCircle,
      danger: true,
      onClick: () => setConfirm({ title: 'Delete folder forever?', desc: `"${f.name}" will be permanently deleted.`, run: async () => { await supabase.from('folders').delete().eq('id', f.id); toast.success('Deleted'); refresh(); } }),
    },
  ];

  const empty = !isLoading && !data?.folders.length && !data?.files.length;

  return (
    <div>
      <PageHeader title="Bin" subtitle="Deleted items. Recover them or delete permanently." icon={<Trash2 size={22} />} />
      {isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : empty ? (
        <EmptyState icon="/assets/icon-document.png" title="Bin is empty" description="Items you move to the Bin will appear here." />
      ) : (
        <div className="space-y-6">
          {!!data?.folders.length && (
            <div>
              <SectionLabel>Folders</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.folders.map((f) => <FolderCard key={f.id} folder={f} onOpen={() => {}} actions={folderActions(f)} />)}
              </div>
            </div>
          )}
          {!!data?.files.length && (
            <div>
              <SectionLabel>Files</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.files.map((f) => <FileCard key={f.id} file={f} onOpen={() => {}} actions={fileActions(f)} />)}
              </div>
            </div>
          )}
        </div>
      )}
      {confirm && <ConfirmDialog open onClose={() => setConfirm(null)} title={confirm.title} description={confirm.desc} danger confirmLabel="Delete forever" onConfirm={confirm.run} />}
    </div>
  );
}
