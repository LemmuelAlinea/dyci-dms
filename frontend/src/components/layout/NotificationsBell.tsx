import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { PREF_BY_TYPE, type NotifType } from '@/lib/notify';
import type { NotificationItem } from '@/lib/types';

export function NotificationsBell() {
  const userId = useAuth((s) => s.session?.user.id);
  const prefs = useAuth((s) => s.profile?.notif_prefs);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Respect the user's notification preferences at read time, so toggling a
  // setting takes effect immediately for both the list and the unread badge.
  const visible = items.filter((n) => {
    const key = PREF_BY_TYPE[n.type as NotifType];
    return key ? prefs?.[key] !== false : true;
  });

  const load = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    setItems((data as NotificationItem[]) ?? []);
  };

  useEffect(() => {
    void load();
    if (!userId) return;
    const channel = supabase
      .channel('notif')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () =>
        load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = visible.filter((i) => !i.read).length;

  const markAll = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    void load();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
        aria-label="Notifications"
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold-400 px-1 text-[10px] font-bold text-navy-900">
            {unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-navy dark:border-white/10 dark:bg-surface-dark-2"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
              <span className="font-semibold text-navy-900 dark:text-white">Notifications</span>
              {unread > 0 && (
                <button onClick={markAll} className="flex items-center gap-1 text-xs font-medium text-navy-600 hover:underline dark:text-gold-300">
                  <Check size={13} /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {visible.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">No notifications yet.</p>
              ) : (
                visible.map((n) => (
                  <div
                    key={n.id}
                    className={`border-b border-slate-50 px-4 py-3 last:border-0 dark:border-white/5 ${
                      !n.read ? 'bg-navy-50/50 dark:bg-white/5' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-navy-900 dark:text-white">{n.title}</p>
                    {n.body && <p className="text-xs text-slate-500">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
