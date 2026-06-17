import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Archive,
  ArrowLeft,
  Download,
  FileUp,
  History,
  Megaphone,
  Send,
  Share2,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { listVersions, setFileState, signedUrlForVersion, uploadNewVersion } from '@/lib/drive';
import { releaseFile } from '@/lib/approvals';
import { formatBytes } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { ConfirmDialog, RequestApprovalDialog, ShareDialog } from '@/components/drive/Dialogs';
import { useAuth } from '@/store/auth';
import type { FileItem } from '@/lib/types';

const OWNER = 'owner:profiles!files_owner_id_fkey(*)';
const APPROVER = 'approver:profiles!files_approved_by_fkey(*)';

export function FileDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentOrgId, session } = useAuth();
  const userId = session?.user.id;
  const fileInput = useRef<HTMLInputElement>(null);

  const [share, setShare] = useState(false);
  const [approve, setApprove] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; desc: string; danger?: boolean; label?: string; run: () => Promise<void> } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: file, isLoading } = useQuery({
    queryKey: ['file', id],
    queryFn: async () => {
      const { data } = await supabase.from('files').select(`*, ${OWNER}, ${APPROVER}`).eq('id', id).single();
      return data as FileItem;
    },
  });
  const { data: versions } = useQuery({ queryKey: ['versions', id], queryFn: () => listVersions(id!), enabled: !!id });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['file', id] });
    qc.invalidateQueries({ queryKey: ['versions', id] });
  };

  const loadPreview = async (versionNo: number) => {
    try {
      const url = await signedUrlForVersion(id!, versionNo);
      setPreview(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onNewVersion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !file) return;
    setBusy(true);
    try {
      await uploadNewVersion(file, f);
      toast.success('New version uploaded');
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  if (isLoading || !file) {
    return <div className="grid place-items-center py-24"><Spinner className="h-7 w-7" /></div>;
  }

  const isOwner = file.owner_id === userId;
  const canPreviewPdf = file.kind === 'pdf';

  return (
    <div>
      <button onClick={() => navigate(-1)} className="btn-ghost mb-4 !px-2">
        <ArrowLeft size={17} /> Back
      </button>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-slate-50 dark:bg-white/5">
                <FileKindIcon kind={file.kind} size={30} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="break-words font-display text-xl font-extrabold text-navy-900 dark:text-white">{file.name}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <StatusBadge status={file.status} />
                  <span>·</span>
                  <span>v{file.current_version}</span>
                  <span>·</span>
                  <span>{formatBytes(file.size_bytes)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={async () => window.open(await signedUrlForVersion(file.id, file.current_version, true), '_blank')} className="btn-outline">
                <Download size={16} /> Download
              </button>
              <button onClick={() => setShare(true)} className="btn-outline">
                <Share2 size={16} /> Share / Send
              </button>
              {isOwner && (file.status === 'draft' || file.status === 'rejected') && (
                <button onClick={() => setApprove(true)} className="btn-primary">
                  <Send size={16} /> Request approval
                </button>
              )}
              {isOwner && file.status === 'approved' && (
                <button
                  onClick={() =>
                    setConfirm({
                      title: 'Release this paper?',
                      desc: 'It will be published to the office-wide Released Papers feed.',
                      label: 'Release',
                      run: async () => {
                        await releaseFile(file);
                        toast.success('Released');
                        refresh();
                      },
                    })
                  }
                  className="btn-gold"
                >
                  <Megaphone size={16} /> Release paper
                </button>
              )}
              {isOwner && (
                <>
                  <input ref={fileInput} type="file" hidden onChange={onNewVersion} />
                  <button onClick={() => fileInput.current?.click()} className="btn-outline" disabled={busy}>
                    {busy ? <Spinner className="h-4 w-4" /> : <FileUp size={16} />} New version
                  </button>
                </>
              )}
            </div>

            {isOwner && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
                <button
                  onClick={() =>
                    setConfirm({
                      title: 'Archive this file?',
                      desc: 'You can restore it from the Archive anytime.',
                      label: 'Archive',
                      run: async () => {
                        await setFileState(file.id, 'archived');
                        toast.success('Archived');
                        navigate('/app/drive');
                      },
                    })
                  }
                  className="btn-ghost !text-slate-500"
                >
                  <Archive size={16} /> Archive
                </button>
                {file.status !== 'released' && (
                  <button
                    onClick={() =>
                      setConfirm({
                        title: 'Move to Bin?',
                        desc: 'The file will be moved to the Bin. You can recover it later.',
                        danger: true,
                        label: 'Move to Bin',
                        run: async () => {
                          await setFileState(file.id, 'trashed');
                          toast.success('Moved to Bin');
                          navigate('/app/drive');
                        },
                      })
                    }
                    className="btn-ghost !text-rose-600"
                  >
                    <Trash2 size={16} /> Move to Bin
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-navy-900 dark:border-white/10 dark:text-white">
              Preview
            </div>
            {preview && canPreviewPdf ? (
              <iframe title="preview" src={preview} className="h-[520px] w-full" />
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <FileKindIcon kind={file.kind} size={44} />
                <p className="text-sm text-slate-500">
                  {canPreviewPdf ? 'Load the PDF preview below.' : 'In-browser preview is available for PDF files. Download to view this file.'}
                </p>
                {canPreviewPdf && (
                  <button onClick={() => loadPreview(file.current_version)} className="btn-primary">
                    Load preview
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: details + versions */}
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="mb-3 font-display text-sm font-bold text-navy-900 dark:text-white">Details</h3>
            <dl className="space-y-3 text-sm">
              <Detail label="Owner">
                <span className="flex items-center gap-2">
                  <Avatar name={file.owner?.full_name} url={file.owner?.avatar_url} size={24} />
                  {file.owner?.full_name}
                </span>
              </Detail>
              {file.approver && (
                <Detail label="Approved by">
                  <span className="flex items-center gap-2">
                    <Avatar name={file.approver.full_name} url={file.approver.avatar_url} size={24} />
                    {file.approver.full_name}
                  </span>
                </Detail>
              )}
              <Detail label="Type"><span className="uppercase">{file.kind}</span></Detail>
              <Detail label="Created">{format(new Date(file.created_at), 'PP')}</Detail>
              <Detail label="Updated">{formatDistanceToNow(new Date(file.updated_at), { addSuffix: true })}</Detail>
              {file.released_at && <Detail label="Released">{format(new Date(file.released_at), 'PP')}</Detail>}
            </dl>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-navy-900 dark:text-white">
              <History size={16} /> Version history
            </h3>
            <div className="space-y-2">
              {(versions ?? []).map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 dark:border-white/10">
                  <div>
                    <p className="text-sm font-medium text-navy-900 dark:text-white">
                      v{v.version_no}
                      {v.version_no === file.current_version && <span className="ml-2 chip bg-navy-100 text-navy-700 dark:bg-navy-400/20 dark:text-navy-200">current</span>}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatBytes(v.size_bytes)} · {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <button
                    onClick={async () => window.open(await signedUrlForVersion(file.id, v.version_no, true), '_blank')}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-white/10"
                    title="Download this version"
                  >
                    <Download size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {share && <ShareDialog open onClose={() => setShare(false)} file={file} orgId={currentOrgId!} />}
      {approve && <RequestApprovalDialog open onClose={() => setApprove(false)} file={file} orgId={currentOrgId!} onDone={refresh} />}
      {confirm && (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          title={confirm.title}
          description={confirm.desc}
          danger={confirm.danger}
          confirmLabel={confirm.label ?? 'Confirm'}
          onConfirm={confirm.run}
        />
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-navy-900 dark:text-white">{children}</dd>
    </div>
  );
}
