import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { Check, CheckSquare, Download, MessageSquare, Send, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { Modal } from '@/components/ui/Modal';
import { addComment, decideApproval, listComments, listMyRequests, listToReview } from '@/lib/approvals';
import { signedUrlForVersion } from '@/lib/drive';
import { useAuth } from '@/store/auth';
import type { Approval } from '@/lib/types';

export function ApprovalsPage() {
  const userId = useAuth((s) => s.session?.user.id)!;
  const [tab, setTab] = useState<'review' | 'requests'>('review');
  const [active, setActive] = useState<Approval | null>(null);

  const review = useQuery({ queryKey: ['toReview', userId], queryFn: () => listToReview(userId) });
  const requests = useQuery({ queryKey: ['myRequests', userId], queryFn: () => listMyRequests(userId) });
  const list = tab === 'review' ? review : requests;

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Review documents and track your approval requests." icon={<CheckSquare size={22} />} />

      <div className="mb-5 flex w-full max-w-sm rounded-xl bg-slate-100 p-1 dark:bg-white/5">
        {(['review', 'requests'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${tab === t ? 'bg-white text-navy-900 shadow-sm dark:bg-surface-dark-3 dark:text-white' : 'text-slate-500'}`}
          >
            {t === 'review' ? `To review${review.data?.filter((a) => a.status === 'pending').length ? ` (${review.data.filter((a) => a.status === 'pending').length})` : ''}` : 'My requests'}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !list.data?.length ? (
        <EmptyState
          icon="/assets/icon-approval-stamp.png"
          title={tab === 'review' ? 'Nothing to review' : 'No requests yet'}
          description={tab === 'review' ? 'Approval requests sent to you will appear here.' : 'Request approval on a file from your drive to start.'}
        />
      ) : (
        <div className="space-y-3">
          {list.data.map((a) => (
            <ApprovalRow key={a.id} approval={a} side={tab} onOpen={() => setActive(a)} />
          ))}
        </div>
      )}

      {active && <ApprovalDetail approval={active} side={tab} onClose={() => setActive(null)} />}
    </div>
  );
}

function ApprovalRow({ approval, side, onOpen }: { approval: Approval; side: 'review' | 'requests'; onOpen: () => void }) {
  const other = side === 'review' ? approval.requester : approval.approver;
  return (
    <div onClick={onOpen} className="card flex cursor-pointer items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-card">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-50 dark:bg-white/5">
        <FileKindIcon kind={approval.files?.kind ?? 'other'} size={24} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{approval.files?.name}</p>
        <p className="text-[11px] text-slate-400">
          {side === 'review' ? 'from' : 'to'} {other?.full_name} · {formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}
        </p>
      </div>
      <StatusBadge status={approval.status === 'pending' ? 'pending' : approval.status === 'approved' ? 'approved' : 'rejected'} />
    </div>
  );
}

function ApprovalDetail({ approval, side, onClose }: { approval: Approval; side: 'review' | 'requests'; onClose: () => void }) {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { data: comments, refetch } = useQuery({ queryKey: ['comments', approval.id], queryFn: () => listComments(approval.id) });

  const isApprover = approval.approver_id === userId && approval.status === 'pending';

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addComment(approval.id, body.trim());
      setBody('');
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(true);
    try {
      await decideApproval(approval, decision);
      toast.success(decision === 'approved' ? 'Approved' : 'Rejected');
      qc.invalidateQueries({ queryKey: ['toReview'] });
      qc.invalidateQueries({ queryKey: ['myRequests'] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={approval.files?.name} size="lg">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <StatusBadge status={approval.status === 'pending' ? 'pending' : approval.status === 'approved' ? 'approved' : 'rejected'} />
          <span>v{approval.version_no}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={async () => approval.file_id && window.open(await signedUrlForVersion(approval.file_id, approval.version_no, true), '_blank')} className="btn-outline !py-1.5 !text-xs">
            <Download size={14} /> Download
          </button>
          <button onClick={() => navigate(`/app/file/${approval.file_id}`)} className="btn-outline !py-1.5 !text-xs">
            Open file
          </button>
        </div>
      </div>

      {approval.message && (
        <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
          “{approval.message}”
        </div>
      )}

      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
        <MessageSquare size={14} /> Discussion
      </p>
      <div className="max-h-60 space-y-3 overflow-y-auto pr-1">
        {(comments ?? []).length === 0 && <p className="py-4 text-center text-sm text-slate-400">No comments yet.</p>}
        {(comments ?? []).map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar name={c.author?.full_name} url={c.author?.avatar_url} size={30} />
            <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-navy-900 dark:text-white">{c.author?.full_name}</span>
                <span className="text-[10px] text-slate-400">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{c.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          className="input"
          placeholder="Add a comment…"
        />
        <button onClick={send} disabled={busy} className="btn-primary !px-3">
          <Send size={16} />
        </button>
      </div>

      {isApprover && (
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
          <button onClick={() => decide('rejected')} disabled={busy} className="btn flex-1 bg-rose-600 text-white hover:bg-rose-500">
            <X size={16} /> Reject
          </button>
          <button onClick={() => decide('approved')} disabled={busy} className="btn-gold flex-1">
            <Check size={16} /> Approve
          </button>
        </div>
      )}
    </Modal>
  );
}
