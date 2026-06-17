import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
  Archive,
  Download,
  FolderPlus,
  HardDrive,
  Info,
  Megaphone,
  PencilLine,
  Send,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Breadcrumbs, type Crumb } from '@/components/layout/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ActionMenu, FileCard, FolderCard, SectionLabel, type ActionItem } from '@/components/drive/ItemViews';
import {
  ConfirmDialog,
  NewFolderDialog,
  RenameDialog,
  RequestApprovalDialog,
  ShareDialog,
} from '@/components/drive/Dialogs';
import {
  listFiles,
  listFolders,
  setFileState,
  setFolderState,
  signedUrlForVersion,
  uploadFile,
} from '@/lib/drive';
import { releaseFile } from '@/lib/approvals';
import { useAuth } from '@/store/auth';
import type { FileItem, Folder } from '@/lib/types';

export function DrivePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentOrgId, session } = useAuth();
  const userId = session?.user.id;
  const orgId = currentOrgId!;

  const [trail, setTrail] = useState<Crumb[]>([{ id: null, name: 'My Drive' }]);
  const current = trail[trail.length - 1];
  const folderId = current.id;

  const [uploading, setUploading] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [approveFile, setApproveFile] = useState<FileItem | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; desc: string; danger?: boolean; run: () => Promise<void> } | null>(null);

  const key = ['drive', orgId, userId, folderId];
  const { data: folders, isLoading: lf } = useQuery({ queryKey: ['folders', ...key], queryFn: () => listFolders(orgId, userId!, folderId), enabled: !!userId });
  const { data: files, isLoading: lfi } = useQuery({ queryKey: ['files', ...key], queryFn: () => listFiles(orgId, userId!, folderId), enabled: !!userId });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['folders', ...key] });
    qc.invalidateQueries({ queryKey: ['files', ...key] });
  };

  const onDrop = async (accepted: File[]) => {
    if (!userId || !accepted.length) return;
    setUploading(true);
    try {
      for (const f of accepted) await uploadFile(orgId, userId, folderId, f);
      toast.success(`Uploaded ${accepted.length} file${accepted.length > 1 ? 's' : ''}`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls', '.csv'],
    },
  });

  const download = async (file: FileItem) => {
    try {
      const url = await signedUrlForVersion(file.id, file.current_version, true);
      window.open(url, '_blank');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const fileActions = (file: FileItem): ActionItem[] => {
    const items: ActionItem[] = [
      { label: 'Details', icon: Info, onClick: () => navigate(`/app/file/${file.id}`) },
      { label: 'Download', icon: Download, onClick: () => download(file) },
      { label: 'Share / Send', icon: Share2, onClick: () => setShareFile(file) },
    ];
    if (file.status === 'draft' || file.status === 'rejected') {
      items.push({ label: 'Request approval', icon: Send, onClick: () => setApproveFile(file) });
    }
    if (file.status === 'approved') {
      items.push({
        label: 'Release paper',
        icon: Megaphone,
        onClick: () =>
          setConfirm({
            title: 'Release this paper?',
            desc: `"${file.name}" will be published to the office-wide Released Papers feed.`,
            run: async () => {
              await releaseFile(file);
              toast.success('Paper released');
              refresh();
            },
          }),
      });
    }
    items.push({ label: 'Rename', icon: PencilLine, onClick: () => setRenameTarget(file) });
    items.push({
      label: 'Archive',
      icon: Archive,
      onClick: async () => {
        await setFileState(file.id, 'archived');
        toast.success('Moved to Archive');
        refresh();
      },
    });
    if (file.status !== 'released') {
      items.push({
        label: 'Move to Bin',
        icon: Trash2,
        danger: true,
        onClick: () =>
          setConfirm({
            title: 'Move to Bin?',
            desc: `"${file.name}" will be moved to the Bin. You can recover it later.`,
            danger: true,
            run: async () => {
              await setFileState(file.id, 'trashed');
              toast.success('Moved to Bin');
              refresh();
            },
          }),
      });
    }
    return items;
  };

  const folderActions = (folder: Folder): ActionItem[] => [
    {
      label: 'Archive',
      icon: Archive,
      onClick: async () => {
        await setFolderState(folder.id, 'archived');
        toast.success('Folder archived');
        refresh();
      },
    },
    {
      label: 'Move to Bin',
      icon: Trash2,
      danger: true,
      onClick: async () => {
        await setFolderState(folder.id, 'trashed');
        toast.success('Folder moved to Bin');
        refresh();
      },
    },
  ];

  const loading = lf || lfi;
  const empty = !loading && !folders?.length && !files?.length;

  return (
    <div {...getRootProps()} className="relative">
      <input {...getInputProps()} />
      <PageHeader
        title="My Drive"
        subtitle="Your personal document workspace in this office."
        icon={<HardDrive size={22} />}
        actions={
          <>
            <button onClick={() => setNewFolder(true)} className="btn-outline">
              <FolderPlus size={17} /> New folder
            </button>
            <button onClick={open} className="btn-primary" disabled={uploading}>
              {uploading ? <Spinner className="h-4 w-4" /> : <Upload size={17} />} Upload
            </button>
          </>
        }
      />

      <div className="mb-5">
        <Breadcrumbs
          trail={trail}
          onNavigate={(id) => setTrail((t) => t.slice(0, t.findIndex((c) => c.id === id) + 1))}
        />
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : empty ? (
        <EmptyState
          icon="/assets/icon-folder-manila.png"
          title="This folder is empty"
          description="Upload documents or create a folder to get started. You can also drag files anywhere here."
          action={<button onClick={open} className="btn-primary"><Upload size={17} /> Upload a file</button>}
        />
      ) : (
        <div className="space-y-6">
          {!!folders?.length && (
            <div>
              <SectionLabel>Folders</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {folders.map((f) => (
                  <FolderCard
                    key={f.id}
                    folder={f}
                    onOpen={() => setTrail((t) => [...t, { id: f.id, name: f.name }])}
                    actions={folderActions(f)}
                  />
                ))}
              </div>
            </div>
          )}
          {!!files?.length && (
            <div>
              <SectionLabel>Files</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {files.map((f) => (
                  <FileCard key={f.id} file={f} onOpen={() => navigate(`/app/file/${f.id}`)} actions={fileActions(f)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drag overlay */}
      {isDragActive && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-navy-950/40 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-gold-300 bg-white/95 px-12 py-10 text-center shadow-navy dark:bg-surface-dark-2">
            <Upload size={40} className="mx-auto text-navy-600" />
            <p className="mt-3 font-display text-lg font-bold text-navy-900 dark:text-white">Drop to upload</p>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <NewFolderDialog open={newFolder} onClose={() => setNewFolder(false)} orgId={orgId} parentId={folderId} onCreated={refresh} />
      {shareFile && <ShareDialog open onClose={() => setShareFile(null)} file={shareFile} orgId={orgId} />}
      {approveFile && <RequestApprovalDialog open onClose={() => setApproveFile(null)} file={approveFile} orgId={orgId} onDone={refresh} />}
      {renameTarget && <RenameDialog open onClose={() => setRenameTarget(null)} file={renameTarget} onDone={refresh} />}
      {confirm && (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          title={confirm.title}
          description={confirm.desc}
          danger={confirm.danger}
          confirmLabel={confirm.danger ? 'Move to Bin' : 'Confirm'}
          onConfirm={confirm.run}
        />
      )}
    </div>
  );
}
