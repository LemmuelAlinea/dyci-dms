import { supabase } from './supabase';

export type NotifType = 'approval' | 'share' | 'release' | 'message';

/** Map a notification type to the user-pref key in profiles.notif_prefs. */
export const PREF_BY_TYPE: Record<NotifType, string> = {
  approval: 'approvals',
  share: 'shares',
  release: 'releases',
  message: 'messages',
};

/**
 * Insert in-app notifications for one or more users. Notifications are always
 * created; whether a user *sees* them is decided at read time by their own
 * notification preferences (see NotificationsBell).
 */
export async function notifyUsers(
  userIds: string[],
  notif: { type: NotifType; title: string; body?: string; link?: string },
) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;
  const rows = unique.map((user_id) => ({
    user_id,
    type: notif.type,
    title: notif.title,
    body: notif.body ?? null,
    link: notif.link ?? null,
  }));
  await supabase.from('notifications').insert(rows);
}
