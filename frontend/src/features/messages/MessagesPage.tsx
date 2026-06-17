import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Mail, Paperclip, Send, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import type { FileItem } from '@/lib/types';

export function MessagesPage() {
  const { currentOrgId, session } = useAuth();
  const userId = session?.user.id;
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attached, setAttached] = useState<FileItem[]>([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const sent = useQuery({
    queryKey: ['emailLog', userId],
    queryFn: async () => {
      const { data } = await supabase.from('email_log').select('*').eq('sender_id', userId).order('created_at', { ascending: false }).limit(20);
      return data ?? [];
    },
    enabled: !!userId,
  });

  const send = async () => {
    const list = to.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return toast.error('Add at least one recipient');
    if (!subject.trim()) return toast.error('Add a subject');
    setBusy(true);
    try {
      await api.sendMessage({ toEmails: list, subject, body, fileIds: attached.map((f) => f.id), orgId: currentOrgId ?? undefined });
      toast.success('Message sent');
      setTo('');
      setSubject('');
      setBody('');
      setAttached([]);
      sent.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Messages" subtitle="Send a direct email to anyone — attach documents from your drive." icon={<Mail size={22} />} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card p-5">
          <div className="space-y-4">
            <div>
              <label className="label">To</label>
              <input value={to} onChange={(e) => setTo(e.target.value)} className="input" placeholder="name@gmail.com, another@email.com" />
            </div>
            <div>
              <label className="label">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" placeholder="Subject" />
            </div>
            <div>
              <label className="label">Message</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="input resize-none" placeholder="Write your message…" />
            </div>

            {!!attached.length && (
              <div className="flex flex-wrap gap-2">
                {attached.map((f) => (
                  <span key={f.id} className="chip bg-navy-50 text-navy-700 dark:bg-white/10 dark:text-slate-200">
                    <FileKindIcon kind={f.kind} size={14} /> {f.name}
                    <button onClick={() => setAttached((a) => a.filter((x) => x.id !== f.id))}><X size={13} /></button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button onClick={() => setPicker(true)} className="btn-outline">
                <Paperclip size={16} /> Attach files
              </button>
              <button onClick={send} disabled={busy} className="btn-primary">
                {busy ? <Spinner className="h-4 w-4" /> : <Send size={16} />} Send
              </button>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 font-display text-sm font-bold text-navy-900 dark:text-white">Recently sent</h3>
          {sent.isLoading ? (
            <div className="grid place-items-center py-6"><Spinner /></div>
          ) : !sent.data?.length ? (
            <p className="py-6 text-center text-sm text-slate-400">No messages sent yet.</p>
          ) : (
            <div className="space-y-2">
              {sent.data.map((m) => (
                <div key={m.id} className="rounded-xl border border-slate-100 px-3 py-2 dark:border-white/10">
                  <p className="truncate text-sm font-medium text-navy-900 dark:text-white">{m.subject}</p>
                  <p className="truncate text-[11px] text-slate-400">to {m.to_email} · {format(new Date(m.created_at), 'PP p')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {picker && <AttachPicker userId={userId!} selected={attached} onClose={() => setPicker(false)} onConfirm={setAttached} />}
    </div>
  );
}

function AttachPicker({ userId, selected, onClose, onConfirm }: { userId: string; selected: FileItem[]; onClose: () => void; onConfirm: (f: FileItem[]) => void }) {
  const [chosen, setChosen] = useState<Record<string, FileItem>>(Object.fromEntries(selected.map((f) => [f.id, f])));
  const { data: files, isLoading } = useQuery({
    queryKey: ['attachables', userId],
    queryFn: async () => {
      const { data } = await supabase.from('files').select('*').eq('owner_id', userId).eq('state', 'active').order('updated_at', { ascending: false }).limit(100);
      return (data as FileItem[]) ?? [];
    },
  });

  return (
    <Modal open onClose={onClose} title="Attach files" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => { onConfirm(Object.values(chosen)); onClose(); }}>Attach {Object.keys(chosen).length || ''}</button></>}>
      {isLoading ? (
        <div className="grid place-items-center py-6"><Spinner /></div>
      ) : !files?.length ? (
        <EmptyState title="No files" description="Upload files to your drive first." />
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {files.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-white/5">
              <input
                type="checkbox"
                checked={!!chosen[f.id]}
                onChange={(e) => setChosen((c) => { const n = { ...c }; if (e.target.checked) n[f.id] = f; else delete n[f.id]; return n; })}
                className="h-4 w-4 accent-navy-700"
              />
              <FileKindIcon kind={f.kind} size={20} />
              <span className="truncate text-sm text-navy-900 dark:text-white">{f.name}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
