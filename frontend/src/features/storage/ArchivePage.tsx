import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Archive, ArchiveRestore, Info, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { FileCard, FolderCard, SectionLabel, type ActionItem } from '@/components/drive/ItemViews';
import { ConfirmDialog } from '@/components/drive/Dialogs';
import { listByState, setFileState, setFolderState } from '@/lib/drive';
import { useAuth } from '@/store/auth';
import { useState } from 'react';
import type { FileItem, Folder } from '@/lib/types';

export function ArchivePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentOrgId, session } = useAuth();
  const userId = session?.user.id;
  const orgId = currentOrgId!;
  const [confirm, setConfirm] = useState<{ run: () => Promise<void> } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['archive', orgId, userId], queryFn: () => listByState(orgId, userId!, 'archived'), enabled: !!userId });
  const refresh = () => qc.invalidateQueries({ queryKey: ['archive', orgId, userId] });

  const fileActions = (f: FileItem): ActionItem[] => [
    { label: 'Details', icon: Info, onClick: () => navigate(`/app/file/${f.id}`) },
    { label: 'Restore', icon: ArchiveRestore, onClick: async () => { await setFileState(f.id, 'active'); toast.success('Restored'); refresh(); } },
    { label: 'Move to Bin', icon: Trash2, danger: true, onClick: () => setConfirm({ run: async () => { await setFileState(f.id, 'trashed'); toast.success('Moved to Bin'); refresh(); } }) },
  ];
  const folderActions = (f: Folder): ActionItem[] => [
    { label: 'Restore', icon: ArchiveRestore, onClick: async () => { await setFolderState(f.id, 'active'); toast.success('Restored'); refresh(); } },
    { label: 'Move to Bin', icon: Trash2, danger: true, onClick: () => setConfirm({ run: async () => { await setFolderState(f.id, 'trashed'); toast.success('Moved to Bin'); refresh(); } }) },
  ];

  const empty = !isLoading && !data?.folders.length && !data?.files.length;

  return (
    <div>
      <PageHeader title="Archive" subtitle="Files and folders set aside. Restore them or move them to the Bin." icon={<Archive size={22} />} />
      {isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : empty ? (
        <EmptyState icon="/assets/icon-folder-manila-2.png" title="Archive is empty" description="Archived files and folders will appear here." />
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
                {data.files.map((f) => <FileCard key={f.id} file={f} onOpen={() => navigate(`/app/file/${f.id}`)} actions={fileActions(f)} />)}
              </div>
            </div>
          )}
        </div>
      )}
      {confirm && (
        <ConfirmDialog open onClose={() => setConfirm(null)} title="Move to Bin?" description="The item will be moved to the Bin for final deletion. You can still recover it from the Bin." danger confirmLabel="Move to Bin" onConfirm={confirm.run} />
      )}
    </div>
  );
}
