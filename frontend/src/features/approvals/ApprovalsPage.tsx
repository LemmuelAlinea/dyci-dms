import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { Check, CheckSquare, Download, FolderOpen, MessageSquare, Search, Send, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { Modal } from '@/components/ui/Modal';
import { ApprovalTracker } from '@/components/drive/ApprovalTracker';
import { ConfirmDialog } from '@/components/drive/Dialogs';
import {
  addRequestComment,
  decideApprovalStep,
  getRequestById,
  getRequestSteps,
  listMyRequests,
  listRequestComments,
  listToReview,
} from '@/lib/approvals';
import { signedUrlForVersion } from '@/lib/drive';
import { useAuth } from '@/store/auth';
import type { ApprovalRequest } from '@/lib/types';

export function ApprovalsPage() {
  const userId = useAuth((s) => s.session?.user.id)!;
  const [tab, setTab] = useState<'review' | 'requests'>('review');
  const [active, setActive] = useState<ApprovalRequest | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const rid = params.get('request');
    if (!rid) return;
    getRequestById(rid).then((r) => { if (r) setActive(r); });
  }, [params]);

  const closeDetail = () => {
    setActive(null);
    if (params.get('request')) {
      const next = new URLSearchParams(params);
      next.delete('request');
      setParams(next, { replace: true });
    }
  };

  const review = useQuery({ queryKey: ['toReview', userId], queryFn: () => listToReview(userId) });
  const requests = useQuery({ queryKey: ['myRequests', userId], queryFn: () => listMyRequests(userId) });
  const list = tab === 'review' ? review : requests;

  const rows = list.data ?? [];
  const filtered = rows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hay = [r.files?.name, r.files?.reference_no, r.requester?.full_name, r.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Review documents step by step and track your requests." icon={<CheckSquare size={22} />} />

      <div className="mb-5 flex w-full max-w-sm rounded-xl bg-slate-100 p-1 dark:bg-white/5">
        {(['review', 'requests'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${tab === t ? 'bg-white text-navy-900 shadow-sm dark:bg-surface-dark-3 dark:text-white' : 'text-slate-500'}`}
          >
            {t === 'review' ? `To review${review.data?.length ? ` (${review.data.length})` : ''}` : 'My requests'}
          </button>
        ))}
      </div>

      {!list.isLoading && rows.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-9"
              placeholder="Search by document, reference, owner, or status…"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input !w-auto">
            <option value="">Any status</option>
            {['pending', 'approved', 'rejected'].map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      )}

      {list.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !rows.length ? (
        <EmptyState
          icon="/assets/icon-approval-stamp.png"
          title={tab === 'review' ? 'Nothing to review' : 'No requests yet'}
          description={tab === 'review' ? 'Documents waiting for your approval will appear here.' : 'Request approval on a file from your drive to start.'}
        />
      ) : !filtered.length ? (
        <EmptyState title="No matches" description="Try a different search term or status filter." />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ApprovalRow key={r.id} request={r} side={tab} onOpen={() => setActive(r)} />
          ))}
        </div>
      )}

      {active && <ApprovalDetail request={active} userId={userId} onClose={closeDetail} />}
    </div>
  );
}

function ApprovalRow({ request, side, onOpen }: { request: ApprovalRequest; side: 'review' | 'requests'; onOpen: () => void }) {
  return (
    <div onClick={onOpen} className="card flex cursor-pointer items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-card">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-50 dark:bg-white/5">
        {request.folder_id ? <FolderOpen size={22} className="text-gold-500" /> : <FileKindIcon kind={request.files?.kind ?? 'other'} size={24} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">
          {request.files?.name ?? 'Folder approval'}
          {request.files?.reference_no && <span className="ml-2 font-mono text-[10px] text-navy-500 dark:text-gold-300">{request.files.reference_no}</span>}
        </p>
        <p className="text-[11px] text-slate-400">
          {side === 'review' ? `from ${request.requester?.full_name ?? ''}` : 'your request'} · {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}{request.target_org_id ? ' · Cross-office' : ''}
        </p>
      </div>
      <StatusBadge status={request.status === 'pending' ? 'pending' : request.status === 'approved' ? 'approved' : 'rejected'} />
    </div>
  );
}

function ApprovalDetail({ request, userId, onClose }: { request: ApprovalRequest; userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDecision, setConfirmDecision] = useState<'approved' | 'rejected' | null>(null);

  const stepsQ = useQuery({ queryKey: ['reqSteps', request.id], queryFn: () => getRequestSteps(request.id) });
  const commentsQ = useQuery({ queryKey: ['reqComments', request.id], queryFn: () => listRequestComments(request.id) });

  const myStep = stepsQ.data?.find((s) => s.status === 'pending' && s.assignee_id === userId);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addRequestComment(request.id, body.trim());
      setBody('');
      commentsQ.refetch();
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(true);
    try {
      await decideApprovalStep(request, decision, body.trim() || undefined);
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
    <>
    <Modal open onClose={onClose} title={request.files?.name ?? 'Folder approval'} size="lg">
      <div className="mb-4 flex items-center justify-between">
        <StatusBadge status={request.status === 'pending' ? 'pending' : request.status === 'approved' ? 'approved' : 'rejected'} />
        <div className="flex gap-2">
          {request.folder_id ? (
            <button onClick={() => navigate(`/app/folder/${request.folder_id}`)} className="btn-outline !py-1.5 !text-xs"><FolderOpen size={14} /> Open folder</button>
          ) : (
            <>
              {!(request.target_org_id && request.requester_id !== userId) && (
                <button onClick={async () => window.open(await signedUrlForVersion(request.file_id!, request.version_no, true), '_blank')} className="btn-outline !py-1.5 !text-xs">
                  <Download size={14} /> Download
                </button>
              )}
              <button onClick={() => navigate(`/app/file/${request.file_id}`)} className="btn-outline !py-1.5 !text-xs">Open file</button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
        {stepsQ.isLoading ? <Spinner className="h-4 w-4" /> : <ApprovalTracker steps={stepsQ.data ?? []} />}
      </div>

      {request.message && <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">"{request.message}"</div>}

      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400"><MessageSquare size={14} /> Discussion</p>
      <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
        {(commentsQ.data ?? []).length === 0 && <p className="py-4 text-center text-sm text-slate-400">No comments yet.</p>}
        {(commentsQ.data ?? []).map((c) => (
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
        <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} className="input" placeholder="Add a comment…" />
        <button onClick={send} disabled={busy} className="btn-primary !px-3"><Send size={16} /></button>
      </div>

      {myStep && (
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
          <button onClick={() => setConfirmDecision('rejected')} disabled={busy} className="btn flex-1 bg-rose-600 text-white hover:bg-rose-500"><X size={16} /> Reject</button>
          <button onClick={() => setConfirmDecision('approved')} disabled={busy} className="btn-gold flex-1"><Check size={16} /> Approve</button>
        </div>
      )}
    </Modal>
    {confirmDecision && (
      <ConfirmDialog
        open
        onClose={() => setConfirmDecision(null)}
        title={confirmDecision === 'approved' ? 'Approve this document?' : 'Reject this document?'}
        description={`Do you really want to ${confirmDecision === 'approved' ? 'approve' : 'reject'} "${request.files?.name ?? 'this document'}"?`}
        confirmLabel={confirmDecision === 'approved' ? 'Approve' : 'Reject'}
        danger={confirmDecision === 'rejected'}
        onConfirm={() => decide(confirmDecision)}
      />
    )}
    </>
  );
}
