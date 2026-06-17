import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { FileCard, FolderCard, SectionLabel } from '@/components/drive/ItemViews';
import { searchEverything } from '@/lib/drive';
import { useAuth } from '@/store/auth';

export function SearchPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const orgId = useAuth((s) => s.currentOrgId)!;
  const { data, isLoading } = useQuery({ queryKey: ['search', orgId, q], queryFn: () => searchEverything(orgId, q), enabled: !!q });

  const empty = !isLoading && !data?.files.length && !data?.folders.length;

  return (
    <div>
      <PageHeader title={`Search results`} subtitle={q ? `Showing matches for “${q}”` : 'Type in the top search bar.'} icon={<Search size={22} />} />
      {!q ? (
        <EmptyState title="Search your office" description="Find files, folders and released papers you have access to." />
      ) : isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : empty ? (
        <EmptyState icon="/assets/icon-document.png" title="No matches" description={`Nothing found for “${q}”.`} />
      ) : (
        <div className="space-y-6">
          {!!data?.folders.length && (
            <div>
              <SectionLabel>Folders</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.folders.map((f) => <FolderCard key={f.id} folder={f} onOpen={() => navigate('/app/drive')} />)}
              </div>
            </div>
          )}
          {!!data?.files.length && (
            <div>
              <SectionLabel>Files</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.files.map((f) => <FileCard key={f.id} file={f} onOpen={() => navigate(`/app/file/${f.id}`)} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
