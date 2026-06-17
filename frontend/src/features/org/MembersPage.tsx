import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Mail, Trash2, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/drive/Dialogs';
import { listMembers, removeMember, updateMemberRole } from '@/lib/org';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { ROLE_LABEL, type OrgMembership, type OrgRole } from '@/lib/types';

const ROLE_COLORS: Record<OrgRole, string> = {
  admin: 'bg-navy-100 text-navy-700 dark:bg-navy-400/20 dark:text-navy-200',
  co_admin: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300',
  approver: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  staff: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
};

export function MembersPage() {
  const qc = useQueryClient();
  const { currentOrgId, role, session } = useAuth();
  const orgId = currentOrgId!;
  const myRole = role();
  const isAdmin = myRole === 'admin';
  const [invite, setInvite] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<OrgMembership | null>(null);

  const { data: members, isLoading } = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['members', orgId] });

  const changeRole = async (m: OrgMembership, r: OrgRole) => {
    try {
      await updateMemberRole(m.id, r);
      toast.success('Role updated');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle="People in this office and their roles."
        icon={<Users size={22} />}
        actions={<button onClick={() => setInvite(true)} className="btn-primary"><UserPlus size={17} /> Invite member</button>}
      />

      {isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-white/10">
          {(members ?? []).map((m) => (
            <div key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={m.profiles?.full_name} url={m.profiles?.avatar_url} size={40} />
                <div>
                  <p className="text-sm font-semibold text-navy-900 dark:text-white">
                    {m.profiles?.full_name} {m.user_id === session?.user.id && <span className="text-xs text-slate-400">(you)</span>}
                  </p>
                  <p className="text-xs text-slate-400">{m.profiles?.email} · joined {format(new Date(m.joined_at), 'PP')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && m.role !== 'admin' ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m, e.target.value as OrgRole)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium dark:border-white/10 dark:bg-surface-dark-3 dark:text-white"
                  >
                    <option value="co_admin">Co-Admin</option>
                    <option value="approver">Approver</option>
                    <option value="staff">Staff</option>
                  </select>
                ) : (
                  <span className={`chip ${ROLE_COLORS[m.role]}`}>{ROLE_LABEL[m.role]}</span>
                )}
                {isAdmin && m.role !== 'admin' && m.user_id !== session?.user.id && (
                  <button onClick={() => setRemoveTarget(m)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" title="Remove">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {invite && <InviteDialog orgId={orgId} canMakeCoAdmin={isAdmin} onClose={() => setInvite(false)} onDone={refresh} />}
      {removeTarget && (
        <ConfirmDialog
          open
          onClose={() => setRemoveTarget(null)}
          title="Remove member?"
          description={`${removeTarget.profiles?.full_name} will lose access to this office. Their own files remain.`}
          danger
          confirmLabel="Remove"
          onConfirm={async () => { await removeMember(removeTarget.id); toast.success('Member removed'); refresh(); }}
        />
      )}
    </div>
  );
}

function InviteDialog({ orgId, canMakeCoAdmin, onClose, onDone }: { orgId: string; canMakeCoAdmin: boolean; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('staff');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim()) return toast.error('Enter an email');
    setBusy(true);
    try {
      const res = await api.invite(orgId, email.trim(), role);
      toast.success((res as { addedNow?: boolean }).addedNow ? 'Member added' : 'Invitation sent');
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
      open
      onClose={onClose}
      title="Invite a member"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Send invite'}</button></>}
    >
      <label className="label">Email address</label>
      <div className="relative mb-3">
        <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-9" placeholder="member@gmail.com" />
      </div>
      <label className="label">Role</label>
      <select value={role} onChange={(e) => setRole(e.target.value as OrgRole)} className="input">
        <option value="staff">Staff (default)</option>
        <option value="approver">Approver</option>
        {canMakeCoAdmin && <option value="co_admin">Co-Admin</option>}
      </select>
      <p className="mt-3 text-[11px] text-slate-400">
        If they already have an account they'll be added immediately. Otherwise they'll get an email invitation.
      </p>
    </Modal>
  );
}
