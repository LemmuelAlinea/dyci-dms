import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Building2, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/drive/Dialogs';
import { assignOrgAdmin, createOrganization, deleteOrganization, listOrganizations, type OrgWithMeta } from '@/lib/admin';
import { formatBytes } from '@/lib/utils';

export function OrganizationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [create, setCreate] = useState(false);
  const [assign, setAssign] = useState<OrgWithMeta | null>(null);
  const [del, setDel] = useState<OrgWithMeta | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['adminOrgs'], queryFn: listOrganizations });
  const refresh = () => qc.invalidateQueries({ queryKey: ['adminOrgs'] });

  return (
    <div>
      <PageHeader
        title="Organizations"
        subtitle="Create offices and assign their admins."
        icon={<Building2 size={22} />}
        actions={<button onClick={() => setCreate(true)} className="btn-primary"><Plus size={17} /> Create organization</button>}
      />

      {isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !data?.length ? (
        <EmptyState
          icon="/assets/icon-folder-gold.png"
          title="No organizations yet"
          description="Create your first office (e.g. Office of Student Affairs — SOA) and assign its admin."
          action={<button onClick={() => setCreate(true)} className="btn-primary"><Plus size={17} /> Create organization</button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((o) => (
            <div
              key={o.id}
              onClick={() => navigate(`/admin/organizations/${o.id}`)}
              className="card cursor-pointer p-5 transition hover:-translate-y-0.5 hover:shadow-navy"
            >
              <div className="flex items-start justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-sheen text-sm font-extrabold text-navy-900">{o.code.slice(0, 3)}</span>
                <button onClick={(e) => { e.stopPropagation(); setDel(o); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">
                  <Trash2 size={16} />
                </button>
              </div>
              <h3 className="mt-3 font-display text-lg font-bold text-navy-900 dark:text-white">{o.name}</h3>
              <p className="text-xs text-slate-400">Code: {o.code} · created {format(new Date(o.created_at), 'PP')}</p>

              <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Organization Admin</p>
                {o.admin ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Avatar name={o.admin.full_name} url={o.admin.avatar_url} size={28} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-900 dark:text-white">{o.admin.full_name}</p>
                      <p className="truncate text-[11px] text-slate-400">{o.admin.email}</p>
                    </div>
                  </div>
                ) : o.adminInviteEmail ? (
                  <div className="mt-1.5">
                    <p className="truncate text-sm font-medium text-navy-900 dark:text-white">{o.adminInviteEmail}</p>
                    <p className="text-[11px] text-amber-600 dark:text-amber-300">Invited — pending sign-up</p>
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm text-amber-600 dark:text-amber-300">Not assigned yet</p>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>{o.member_count} members</span>
                <span>{formatBytes(o.storage_used_bytes)} used</span>
              </div>

              <button onClick={(e) => { e.stopPropagation(); setAssign(o); }} className="btn-outline mt-4 w-full">
                <UserCog size={16} /> {o.admin ? 'Reassign admin' : 'Assign admin'}
              </button>
            </div>
          ))}
        </div>
      )}

      {create && <CreateDialog onClose={() => setCreate(false)} onDone={refresh} />}
      {assign && <AssignAdminDialog org={assign} onClose={() => setAssign(null)} onDone={refresh} />}
      {del && (
        <ConfirmDialog
          open
          onClose={() => setDel(null)}
          title="Delete organization?"
          description={`"${del.name}" and all its memberships, folders and files will be permanently removed. This cannot be undone.`}
          danger
          confirmLabel="Delete organization"
          onConfirm={async () => { await deleteOrganization(del.id); toast.success('Organization deleted'); refresh(); }}
        />
      )}
    </div>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || !code.trim()) return toast.error('Name and code are required');
    setBusy(true);
    try {
      await createOrganization(name.trim(), code.trim());
      toast.success('Organization created');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Create organization" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Create'}</button></>}>
      <div className="space-y-3">
        <div>
          <label className="label">Organization name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Office of Student Affairs" />
        </div>
        <div>
          <label className="label">Code</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} className="input uppercase" placeholder="SOA" />
          <p className="mt-1 text-[11px] text-slate-400">A short unique code, e.g. SOA, CCS, CBEA.</p>
        </div>
      </div>
    </Modal>
  );
}

function AssignAdminDialog({ org, onClose, onDone }: { org: OrgWithMeta; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email.trim()) return toast.error('Enter an email');
    setBusy(true);
    try {
      const result = await assignOrgAdmin(org.id, email.trim());
      toast.success(result === 'assigned' ? 'Admin assigned' : 'Admin invited by email');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Assign admin · ${org.code}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Assign'}</button></>}>
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-navy-50 p-3 text-sm text-navy-700 dark:bg-white/5 dark:text-slate-300">
        <ShieldCheck size={18} /> Each office has exactly one admin. They manage members and roles.
      </div>
      <label className="label">Admin email</label>
      <input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="admin@gmail.com" />
      <p className="mt-2 text-[11px] text-slate-400">If they don't have an account yet, they'll be invited and become admin when they register.</p>
    </Modal>
  );
}
