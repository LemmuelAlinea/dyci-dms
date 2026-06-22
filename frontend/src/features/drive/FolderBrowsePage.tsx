import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, FolderOpen, Plus, Send, Share2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileCard, FolderCard, SectionLabel } from '@/components/drive/ItemViews';
import { RequestApprovalDialog, ShareDialog } from '@/components/drive/Dialogs';
import { getFolder, listFolderContents, folderSharePerm } from '@/lib/drive';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

export function FolderBrowsePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOrgId, session } = useAuth();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const addInput = useRef<HTMLInputElement>(null);
  const [share, setShare] = useState(false);
  const [approve, setApprove] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: folder, isLoading } = useQuery({ queryKey: ['folder', id], queryFn: () => getFolder(id!), enabled: !!id });
  const { data: contents } = useQuery({ queryKey: ['folderContents', id], queryFn: () => listFolderContents(id!), enabled: !!id });
  const isFolderOwner = !!folder && folder.owner_id === userId;
  const { data: perm } = useQuery({ queryKey: ['folderPerm', id, userId], queryFn: () => folderSharePerm(id!), enabled: !!id && !!userId && !!folder && !isFolderOwner });

  const onAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !id) return;
    setBusy(true);
    try {
      await api.addFileToFolder(id, f);
      toast.success('File added');
      qc.invalidateQueries({ queryKey: ['folderContents', id] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      if (addInput.current) addInput.current.value = '';
    }
  };

  if (isLoading || !folder) {
    return <div className="grid place-items-center py-24"><Spinner className="h-7 w-7" /></div>;
  }

  const isOwner = folder.owner_id === userId;
  const canAdd = isOwner || perm === 'edit';
  const canRequest = isOwner && folder.status !== 'pending' && folder.status !== 'approved';
  const subfolders = contents?.folders ?? [];
  const files = contents?.files ?? [];
  const empty = !subfolders.length && !files.length;

  return (
    <div>
      <button onClick={() => navigate(-1)} className="btn-ghost mb-4 !px-2">
        <ArrowLeft size={17} /> Back
      </button>

      <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-sheen text-navy-900"><FolderOpen size={24} /></div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-navy-900 dark:text-white">{folder.name}</h1>
            {folder.status && <div className="mt-1"><StatusBadge status={folder.status} /></div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAdd && (
            <>
              <input ref={addInput} type="file" hidden onChange={onAddFile} />
              <button onClick={() => addInput.current?.click()} className="btn-outline" disabled={busy}>
                {busy ? <Spinner className="h-4 w-4" /> : <Plus size={16} />} Add file
              </button>
            </>
          )}
          <button onClick={() => setShare(true)} className="btn-outline"><Share2 size={16} /> Share / Send</button>
          {canRequest && <button onClick={() => setApprove(true)} className="btn-primary"><Send size={16} /> Request approval</button>}
        </div>
      </div>

      {isOwner && folder.status === 'rejected' && (
        <div className="card mb-5 border-l-4 border-rose-500 bg-rose-50/50 p-5 dark:bg-rose-500/10">
          <p className="font-display text-sm font-bold text-rose-700 dark:text-rose-300">This folder was rejected</p>
          <p className="mt-1 text-sm text-rose-600/90 dark:text-rose-300/80">Revise its contents and request approval again.</p>
        </div>
      )}

      {empty ? (
        <EmptyState icon="/assets/icon-folder-manila.png" title="This folder is empty" description="No files or subfolders here." />
      ) : (
        <div className="space-y-6">
          {!!subfolders.length && (
            <div>
              <SectionLabel>Folders</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {subfolders.map((f) => (
                  <FolderCard key={f.id} folder={f} onOpen={() => navigate(`/app/folder/${f.id}`)} actions={[]} />
                ))}
              </div>
            </div>
          )}
          {!!files.length && (
            <div>
              <SectionLabel>Files</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {files.map((f) => (
                  <FileCard key={f.id} file={f} onOpen={() => navigate(`/app/file/${f.id}`)} actions={[]} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {share && <ShareDialog open onClose={() => setShare(false)} folder={folder} orgId={currentOrgId!} />}
      {approve && <RequestApprovalDialog open onClose={() => setApprove(false)} folder={folder} orgId={currentOrgId!} onDone={() => { setApprove(false); }} />}
    </div>
  );
}
