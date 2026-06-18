import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Briefcase, Plus, UserPlus, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/drive/Dialogs';
import { listMembers } from '@/lib/org';
import {
  assignMemberToPosition,
  createPosition,
  deletePosition,
  listPositions,
  renamePosition,
  unassignMemberFromPosition,
  type PositionWithHolders,
} from '@/lib/positions';
import { useAuth } from '@/store/auth';

export function PositionsPage() {
  const qc = useQueryClient();
  const { currentOrgId, role } = useAuth();
  const orgId = currentOrgId!;
  const isAdmin = role() === 'admin';

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<PositionWithHolders | null>(null);
  const [renameTarget, setRenameTarget] = useState<PositionWithHolders | null>(null);

  const positions = useQuery({ queryKey: ['positions', orgId], queryFn: () => listPositions(orgId), enabled: isAdmin });
  const members = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId), enabled: isAdmin });
  const refresh = () => qc.invalidateQueries({ queryKey: ['positions', orgId] });

  if (!isAdmin) {
    return <EmptyState title="Admins only" description="Only the organization admin can manage positions." />;
  }

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await createPosition(orgId, newName.trim(), positions.data?.length ?? 0);
      setNewName('');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const assign = async (positionId: string, userId: string) => {
    try {
      await assignMemberToPosition(orgId, positionId, userId);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const unassign = async (positionId: string, userId: string) => {
    await unassignMemberFromPosition(positionId, userId);
    refresh();
  };

  return (
    <div>
      <PageHeader
        title="Positions"
        subtitle="Define the approval positions in this office and assign members to them."
        icon={<Briefcase size={22} />}
      />

      <div className="mb-6 flex max-w-md gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="input"
          placeholder="New position (e.g. Dean)"
        />
        <button onClick={add} disabled={busy} className="btn-primary shrink-0"><Plus size={17} /> Add</button>
      </div>

      {positions.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner className="h-7 w-7" /></div>
      ) : !positions.data?.length ? (
        <EmptyState icon="/assets/icon-person.png" title="No positions yet" description="Add positions like Dean, Program Chair, or Finance Head — approval steps route to these." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {positions.data.map((p) => {
            const holderIds = new Set(p.holders.map((h) => h.id));
            const available = (members.data ?? []).filter((m) => m.profiles && !holderIds.has(m.user_id));
            return (
              <div key={p.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-navy-900 dark:text-white">{p.name}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => setRenameTarget(p)} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">Rename</button>
                    <button onClick={() => setDel(p)} className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">Delete</button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {p.holders.length === 0 && <span className="text-xs text-slate-400">No members assigned</span>}
                  {p.holders.map((h) => (
                    <span key={h.id} className="chip bg-navy-50 text-navy-700 dark:bg-white/10 dark:text-slate-200">
                      <Avatar name={h.full_name} url={h.avatar_url} size={18} /> {h.full_name}
                      <button onClick={() => unassign(p.id, h.id)} className="ml-0.5"><X size={13} /></button>
                    </span>
                  ))}
                </div>

                {available.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <UserPlus size={15} className="text-slate-400" />
                    <select value="" onChange={(e) => e.target.value && assign(p.id, e.target.value)} className="input !py-1.5 !text-sm">
                      <option value="">Assign a member…</option>
                      {available.map((m) => (
                        <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {del && (
        <ConfirmDialog
          open
          onClose={() => setDel(null)}
          title={`Delete "${del.name}"?`}
          description="Members lose this position. Approval chains that used it will need a different position. This cannot be undone."
          danger
          confirmLabel="Delete position"
          onConfirm={async () => { await deletePosition(del.id); toast.success('Position deleted'); refresh(); }}
        />
      )}
      {renameTarget && <RenamePositionDialog position={renameTarget} onClose={() => setRenameTarget(null)} onDone={refresh} />}
    </div>
  );
}

function RenamePositionDialog({ position, onClose, onDone }: { position: PositionWithHolders; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(position.name);
  const submit = async () => {
    await renamePosition(position.id, name.trim());
    toast.success('Renamed');
    onDone();
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Rename position" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Save</button></>}>
      <label className="label">Name</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="input" />
    </Modal>
  );
}
