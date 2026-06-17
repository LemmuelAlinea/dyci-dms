import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Mail, Users } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { listMembers, shareFileWithMember } from '@/lib/org';
import { requestApproval } from '@/lib/approvals';
import { notifyUsers } from '@/lib/notify';
import { api } from '@/lib/api';
import { createFolder, renameFile } from '@/lib/drive';
import { ROLE_LABEL, type FileItem } from '@/lib/types';
import { useAuth } from '@/store/auth';

export function NewFolderDialog({
  open,
  onClose,
  orgId,
  parentId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  parentId: string | null;
  onCreated: () => void;
}) {
  const userId = useAuth((s) => s.session?.user.id);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !userId) return;
    setBusy(true);
    try {
      await createFolder(orgId, userId, parentId, name.trim());
      toast.success('Folder created');
      setName('');
      onCreated();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New folder"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : 'Create'}
          </button>
        </>
      }
    >
      <label className="label">Folder name</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} className="input" placeholder="e.g. Memorandums 2026" />
    </Modal>
  );
}

export function RenameDialog({ open, onClose, file, onDone }: { open: boolean; onClose: () => void; file: FileItem; onDone: () => void }) {
  const [name, setName] = useState(file.name);
  const submit = async () => {
    await renameFile(file.id, name.trim());
    toast.success('Renamed');
    onDone();
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Rename file" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Save</button></>}>
      <label className="label">Name</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="input" />
    </Modal>
  );
}

export function ShareDialog({ open, onClose, file, orgId }: { open: boolean; onClose: () => void; file: FileItem; orgId: string }) {
  const userId = useAuth((s) => s.session?.user.id);
  const [tab, setTab] = useState<'members' | 'email'>('members');
  const [emails, setEmails] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: members, isLoading } = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId), enabled: open });

  const others = (members ?? []).filter((m) => m.user_id !== userId);
  const allSelected = others.length > 0 && selected.size === others.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(others.map((m) => m.user_id)));

  const shareWithSelected = async () => {
    if (!selected.size) return toast.error('Select at least one member');
    setBusy(true);
    try {
      for (const uid of selected) await shareFileWithMember(orgId, file.id, uid, 'download');
      await notifyUsers([...selected], {
        type: 'share',
        title: 'A file was shared with you',
        body: file.name,
        link: '/app/shared',
      });
      toast.success(`Shared with ${selected.size} member${selected.size > 1 ? 's' : ''}`);
      setSelected(new Set());
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendEmail = async () => {
    const list = emails.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return toast.error('Add at least one email');
    setBusy(true);
    try {
      await api.shareToEmail({ fileIds: [file.id], toEmails: list, message, orgId });
      toast.success('Email sent with attachment');
      setEmails('');
      setMessage('');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Share "${file.name}"`}>
      <div className="mb-4 flex rounded-xl bg-slate-100 p-1 dark:bg-white/5">
        <button onClick={() => setTab('members')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${tab === 'members' ? 'bg-white text-navy-900 shadow-sm dark:bg-surface-dark-3 dark:text-white' : 'text-slate-500'}`}>
          <Users size={15} /> Office members
        </button>
        <button onClick={() => setTab('email')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${tab === 'email' ? 'bg-white text-navy-900 shadow-sm dark:bg-surface-dark-3 dark:text-white' : 'text-slate-500'}`}>
          <Mail size={15} /> Send to email
        </button>
      </div>

      {tab === 'members' ? (
        <div>
          {isLoading ? (
            <div className="grid place-items-center py-6"><Spinner /></div>
          ) : others.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No other members in this office yet.</p>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-white/5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-navy-700" />
                <span className="text-sm font-semibold text-navy-800 dark:text-slate-200">Select all ({others.length})</span>
              </label>
              <div className="mt-1 max-h-64 space-y-1 overflow-y-auto border-t border-slate-100 pt-1 dark:border-white/10">
                {others.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-white/5">
                    <input type="checkbox" checked={selected.has(m.user_id)} onChange={() => toggle(m.user_id)} className="h-4 w-4 accent-navy-700" />
                    <Avatar name={m.profiles?.full_name} url={m.profiles?.avatar_url} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy-900 dark:text-white">{m.profiles?.full_name}</p>
                      <p className="text-[11px] text-slate-400">{ROLE_LABEL[m.role]}</p>
                    </div>
                  </label>
                ))}
              </div>
              <button onClick={shareWithSelected} disabled={busy || selected.size === 0} className="btn-primary mt-4 w-full">
                {busy ? (
                  <Spinner className="h-4 w-4" />
                ) : selected.size ? (
                  `Share with ${selected.size} member${selected.size > 1 ? 's' : ''}`
                ) : (
                  'Select members to share'
                )}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Recipient emails</label>
            <input value={emails} onChange={(e) => setEmails(e.target.value)} className="input" placeholder="name@gmail.com, another@email.com" />
            <p className="mt-1 text-[11px] text-slate-400">The actual file is attached and sent via email. Up to ~18MB.</p>
          </div>
          <div>
            <label className="label">Message (optional)</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="input resize-none" placeholder="Here is the document you requested…" />
          </div>
          <button onClick={sendEmail} disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner className="h-4 w-4" /> : 'Send email'}
          </button>
        </div>
      )}
    </Modal>
  );
}

export function RequestApprovalDialog({ open, onClose, file, orgId, onDone }: { open: boolean; onClose: () => void; file: FileItem; orgId: string; onDone: () => void }) {
  const userId = useAuth((s) => s.session?.user.id);
  const [approverId, setApproverId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: members } = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId), enabled: open });

  const submit = async () => {
    if (!approverId) return toast.error('Choose an approver');
    setBusy(true);
    try {
      await requestApproval(file, approverId, message);
      toast.success('Approval requested');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request approval"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Send request'}</button></>}
    >
      <p className="mb-4 text-sm text-slate-500">Send <strong className="text-navy-700 dark:text-white">{file.name}</strong> (v{file.current_version}) to a member for review.</p>
      <label className="label">Approver</label>
      <select value={approverId} onChange={(e) => setApproverId(e.target.value)} className="input mb-3">
        <option value="">Select a member…</option>
        {(members ?? [])
          .filter((m) => m.user_id !== userId)
          .map((m) => (
            <option key={m.id} value={m.user_id}>
              {m.profiles?.full_name} · {ROLE_LABEL[m.role]}
            </option>
          ))}
      </select>
      <label className="label">Note (optional)</label>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="input resize-none" placeholder="Please review and approve this memo…" />
    </Modal>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className={danger ? 'btn bg-rose-600 text-white hover:bg-rose-500' : 'btn-primary'}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
              onClose();
            }}
            disabled={busy}
          >
            {busy ? <Spinner className="h-4 w-4" /> : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-500">{description}</p>
    </Modal>
  );
}
