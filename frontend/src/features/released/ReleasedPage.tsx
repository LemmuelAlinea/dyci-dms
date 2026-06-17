import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, Info, Megaphone, Search, Share2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { ActionMenu, type ActionItem } from '@/components/drive/ItemViews';
import { ShareDialog } from '@/components/drive/Dialogs';
import { listReleased, signedUrlForVersion } from '@/lib/drive';
import { useAuth } from '@/store/auth';
import type { FileItem } from '@/lib/types';

export function ReleasedPage() {
  const navigate = useNavigate();
  const orgId = useAuth((s) => s.currentOrgId)!;
  const [term, setTerm] = useState('');
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const { data: files, isLoading } = useQuery({ queryKey: ['released', orgId, term], queryFn: () => listReleased(orgId, term) });

  const actions = (file: FileItem): ActionItem[] => [
    { label: 'Details', icon: Info, onClick: () => navigate(`/app/file/${file.id}`) },
    { label: 'Download', icon: Download, onClick: async () => window.open(await signedUrlForVersion(file.id, file.current_version, true), '_blank') },
    { label: 'Share / Send', icon: Share2, onClick: () => setShareFile(file) },
  ];

  return (
    <div>
      <PageHeader title="Released Papers" subtitle="Approved documents published across your office." icon={<Megaphone size={22} />} />

      <div className="relative mb-5 max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={term} onChange={(e) => setTerm(e.target.value)} className="input pl-9" placeholder="Search released papers…" />
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !files?.length ? (
        <EmptyState icon="/assets/icon-approval-stamp.png" title="No released papers yet" description="Approved documents that are released will be listed here for the whole office." />
      ) : (
        <div className="space-y-3">
          {files.map((f) => (
            <div
              key={f.id}
              onClick={() => navigate(`/app/file/${f.id}`)}
              className="card flex cursor-pointer items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-card"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-50 dark:bg-white/5">
                <FileKindIcon kind={f.kind} size={26} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{f.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5"><Avatar name={f.owner?.full_name} url={f.owner?.avatar_url} size={18} /> {f.owner?.full_name}</span>
                  {f.approver && <span className="flex items-center gap-1.5">approved by <strong className="text-navy-600 dark:text-gold-200">{f.approver.full_name}</strong></span>}
                  {f.released_at && <span>· {format(new Date(f.released_at), 'PP')}</span>}
                  <span className="chip bg-navy-100 text-navy-700 dark:bg-navy-400/20 dark:text-navy-200">v{f.current_version}</span>
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <ActionMenu items={actions(f)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {shareFile && <ShareDialog open onClose={() => setShareFile(null)} file={shareFile} orgId={orgId} />}
    </div>
  );
}
