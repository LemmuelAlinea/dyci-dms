import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Activity,
  ArrowLeft,
  FileText,
  HardDrive,
  HeartPulse,
  Megaphone,
  Archive as ArchiveIcon,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/drive/Dialogs';
import { api } from '@/lib/api';
import { assignOrgAdmin, deleteOrganization, updateOrgQuota } from '@/lib/admin';
import { formatBytes, storagePercent } from '@/lib/utils';
import { ROLE_LABEL, type DocStatus, type OrgRole } from '@/lib/types';

function health(pct: number) {
  if (pct < 60) return { label: 'Healthy', ring: 'text-emerald-500', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300', bar: 'bg-emerald-500' };
  if (pct < 85) return { label: 'Moderate', ring: 'text-amber-500', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300', bar: 'bg-amber-500' };
  return { label: 'Critical', ring: 'text-rose-500', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300', bar: 'bg-rose-500' };
}

export function OrgDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [reassign, setReassign] = useState(false);
  const [quota, setQuota] = useState(false);
  const [del, setDel] = useState(false);

  const detail = useQuery({ queryKey: ['orgDetail', id], queryFn: () => api.adminOrgDetail(id!), enabled: !!id, retry: 0 });
  const activity = useQuery({ queryKey: ['adminActivity', id], queryFn: () => api.adminActivity(id), enabled: !!id, retry: 0 });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['orgDetail', id] });
    qc.invalidateQueries({ queryKey: ['adminOrgs'] });
  };

  if (detail.isLoading) return <div className="grid place-items-center py-24"><Spinner className="h-7 w-7" /></div>;

  if (detail.isError || !detail.data) {
    return (
      <div>
        <button onClick={() => navigate('/admin/organizations')} className="btn-ghost mb-4 !px-2"><ArrowLeft size={17} /> Back</button>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
          Couldn't load organization details. Make sure the backend API is running.
        </div>
      </div>
    );
  }

  const d = detail.data;
  const used = d.org.storage_used_bytes;
  const quotaBytes = d.org.storage_quota_bytes || 1;
  const { value: pct, label: pctLabel } = storagePercent(used, quotaBytes);
  const h = health(pct);
  const circ = 2 * Math.PI * 42;

  const stats = [
    { label: 'Members', value: d.memberCount, icon: Users, color: 'bg-navy-700 text-gold-300' },
    { label: 'Documents', value: d.totalFiles, icon: FileText, color: 'bg-emerald-600 text-white' },
    { label: 'Released', value: d.filesByStatus['released'] ?? 0, icon: Megaphone, color: 'bg-indigo-600 text-white' },
    { label: 'Archived', value: d.archivedCount, icon: ArchiveIcon, color: 'bg-slate-500 text-white' },
  ];

  return (
    <div>
      <button onClick={() => navigate('/admin/organizations')} className="btn-ghost mb-4 !px-2"><ArrowLeft size={17} /> Back to organizations</button>

      {/* Header */}
      <div className="card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold-sheen text-lg font-extrabold text-navy-900">{d.org.code.slice(0, 3)}</span>
          <div>
            <h1 className="font-display text-xl font-extrabold text-navy-900 dark:text-white">{d.org.name}</h1>
            <p className="text-xs text-slate-400">Code: {d.org.code} · created {format(new Date(d.org.created_at), 'PP')}</p>
            <div className="mt-1.5 flex items-center gap-2 text-sm">
              {d.admin ? (
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Avatar name={d.admin.full_name} url={d.admin.avatar_url} size={20} /> {d.admin.full_name} <span className="text-slate-400">· admin</span>
                </span>
              ) : d.adminInviteEmail ? (
                <span className="text-amber-600 dark:text-amber-300">{d.adminInviteEmail} · invited</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-300">No admin assigned</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setReassign(true)} className="btn-outline"><UserCog size={16} /> {d.admin ? 'Reassign' : 'Assign'} admin</button>
          <button onClick={() => setQuota(true)} className="btn-outline"><HardDrive size={16} /> Quota</button>
          <button onClick={() => setDel(true)} className="btn-ghost !text-rose-600"><Trash2 size={16} /> Delete</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Health / storage */}
        <div className="card flex flex-col items-center p-6">
          <div className="mb-1 flex items-center gap-2 self-start text-sm font-bold text-navy-900 dark:text-white"><HeartPulse size={17} /> Organization health</div>
          <div className="relative my-3 grid place-items-center">
            <svg width="120" height="120" className="-rotate-90">
              <circle cx="60" cy="60" r="42" fill="none" strokeWidth="11" className="stroke-slate-200 dark:stroke-white/10" />
              <circle cx="60" cy="60" r="42" fill="none" strokeWidth="11" strokeLinecap="round" className={h.ring} stroke="currentColor" strokeDasharray={circ} strokeDashoffset={circ - (Math.max(pct, used > 0 ? 1.5 : 0) / 100) * circ} />
            </svg>
            <div className="absolute text-center">
              <p className="font-display text-2xl font-extrabold text-navy-900 dark:text-white">{pctLabel}%</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">used</p>
            </div>
          </div>
          <span className={`chip ${h.chip}`}>{h.label}</span>
          <div className="mt-4 w-full">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div className={`h-full rounded-full ${h.bar}`} style={{ width: `${Math.max(pct, used > 0 ? 1.5 : 0)}%` }} />
            </div>
            <p className="mt-2 text-center text-xs text-slate-400">{formatBytes(used)} of {formatBytes(quotaBytes)}</p>
          </div>
        </div>

        {/* Stats + breakdowns */}
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="card p-4">
                <div className={`mb-2.5 grid h-10 w-10 place-items-center rounded-xl ${s.color}`}><s.icon size={19} /></div>
                <p className="font-display text-2xl font-extrabold text-navy-900 dark:text-white">{s.value}</p>
                <p className="text-sm text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-3 font-display text-sm font-bold text-navy-900 dark:text-white">Roles</h3>
              <div className="space-y-2">
                {(['admin', 'co_admin', 'approver', 'staff'] as OrgRole[]).map((r) => (
                  <div key={r} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{ROLE_LABEL[r]}</span>
                    <span className="font-semibold text-navy-900 dark:text-white">{d.roleBreakdown[r] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="mb-3 font-display text-sm font-bold text-navy-900 dark:text-white">Documents by status</h3>
              <div className="space-y-2">
                {(['draft', 'pending', 'approved', 'released', 'rejected'] as DocStatus[]).map((s) => (
                  <div key={s} className="flex items-center justify-between">
                    <StatusBadge status={s} />
                    <span className="text-sm font-semibold text-navy-900 dark:text-white">{d.filesByStatus[s] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Members + Activity */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-navy-900 dark:text-white"><Users size={16} /> Members ({d.memberCount})</h3>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {d.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-white/5">
                <Avatar name={m.profile?.full_name} url={m.profile?.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-navy-900 dark:text-white">{m.profile?.full_name}</p>
                  <p className="truncate text-[11px] text-slate-400">{m.profile?.email}</p>
                </div>
                <span className="chip bg-navy-50 text-navy-700 dark:bg-white/10 dark:text-slate-200">{ROLE_LABEL[m.role as OrgRole]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-navy-900 dark:text-white"><Activity size={16} /> Recent activity</h3>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {activity.data?.events.length ? (
              activity.data.events.slice(0, 20).map((e) => (
                <div key={e.id} className="rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-white/5">
                  <p className="text-sm text-navy-900 dark:text-white">
                    <span className="font-semibold">{e.actor ?? 'Someone'}</span> <span className="text-slate-500">{e.action.toLowerCase()}</span>
                    {e.target && <span className="font-medium"> · {e.target}</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">{formatDistanceToNow(new Date(e.at), { addSuffix: true })}</p>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">No activity yet.</p>
            )}
          </div>
        </div>
      </div>

      {reassign && <ReassignDialog orgId={id!} hasAdmin={!!d.admin} onClose={() => setReassign(false)} onDone={refresh} />}
      {quota && <QuotaDialog orgId={id!} current={quotaBytes} onClose={() => setQuota(false)} onDone={refresh} />}
      {del && (
        <ConfirmDialog
          open
          onClose={() => setDel(false)}
          title="Delete organization?"
          description={`"${d.org.name}" and all its members, folders and files will be permanently removed. This cannot be undone.`}
          danger
          confirmLabel="Delete organization"
          onConfirm={async () => { await deleteOrganization(id!); toast.success('Organization deleted'); navigate('/admin/organizations'); }}
        />
      )}
    </div>
  );
}

function ReassignDialog({ orgId, hasAdmin, onClose, onDone }: { orgId: string; hasAdmin: boolean; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email.trim()) return toast.error('Enter an email');
    setBusy(true);
    try {
      const r = await assignOrgAdmin(orgId, email.trim());
      toast.success(r === 'assigned' ? 'Admin assigned' : 'Admin invited by email');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`${hasAdmin ? 'Reassign' : 'Assign'} admin`} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Save'}</button></>}>
      <label className="label">Admin email</label>
      <input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="admin@gmail.com" />
      <p className="mt-2 text-[11px] text-slate-400">Each office has exactly one admin. Reassigning demotes the current admin to co-admin.</p>
    </Modal>
  );
}

function QuotaDialog({ orgId, current, onClose, onDone }: { orgId: string; current: number; onClose: () => void; onDone: () => void }) {
  const [gb, setGb] = useState(String(Math.round((current / 1073741824) * 10) / 10));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const val = parseFloat(gb);
    if (!val || val <= 0) return toast.error('Enter a valid size in GB');
    setBusy(true);
    try {
      await updateOrgQuota(orgId, Math.round(val * 1073741824));
      toast.success('Storage quota updated');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Storage quota" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Save'}</button></>}>
      <label className="label">Quota (GB)</label>
      <input autoFocus type="number" min="1" step="0.5" value={gb} onChange={(e) => setGb(e.target.value)} className="input" />
    </Modal>
  );
}
