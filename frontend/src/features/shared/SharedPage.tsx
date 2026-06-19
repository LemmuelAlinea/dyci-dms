import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Info, Share2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { FileCard, type ActionItem } from '@/components/drive/ItemViews';
import { Avatar } from '@/components/ui/Avatar';
import { listSharedWithMe, signedUrlForVersion } from '@/lib/drive';
import { useAuth } from '@/store/auth';
import type { SharedFileItem } from '@/lib/types';

export function SharedPage() {
  const navigate = useNavigate();
  const userId = useAuth((s) => s.session?.user.id);
  const { data: files, isLoading } = useQuery({ queryKey: ['shared', userId], queryFn: () => listSharedWithMe(userId!), enabled: !!userId });

  const actions = (file: SharedFileItem): ActionItem[] => [
    { label: 'Details', icon: Info, onClick: () => navigate(`/app/file/${file.id}`) },
    ...(file._share?.permission && file._share.permission !== 'view'
      ? [{ label: 'Download', icon: Download, onClick: async () => window.open(await signedUrlForVersion(file.id, file.current_version, true), '_blank') }]
      : []),
  ];

  return (
    <div>
      <PageHeader title="Shared with me" subtitle="Files other members have shared with you." icon={<Share2 size={22} />} />
      {isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !files?.length ? (
        <EmptyState icon="/assets/icon-file-stack.png" title="Nothing shared yet" description="When a colleague shares a file with you, it will appear here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {files.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              onOpen={() => navigate(`/app/file/${f.id}`)}
              actions={actions(f)}
              meta={f.owner && <Avatar name={f.owner.full_name} url={f.owner.avatar_url} size={22} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
