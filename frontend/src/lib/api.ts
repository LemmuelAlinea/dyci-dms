import { supabase } from './supabase';

const BASE = (import.meta.env.VITE_API_URL as string) ?? '';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { ...(await authHeader()) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

export const api = {
  invite: (orgId: string, email: string, role: string) =>
    post<{ invitation: unknown; emailError?: string }>('/invitations', { orgId, email, role }),

  shareToEmail: (input: {
    fileIds?: string[];
    folderId?: string;
    toEmails: string[];
    message?: string;
    orgId?: string;
  }) => post<{ ok: boolean }>('/share/email', input),

  sendMessage: (input: {
    toEmails: string[];
    subject: string;
    body?: string;
    fileIds?: string[];
    orgId?: string;
  }) => post<{ ok: boolean }>('/messages/email', input),

  notifyApproval: (approvalId: string, event: 'requested' | 'approved' | 'rejected' | 'commented') =>
    post<{ ok: boolean }>(`/approvals/${approvalId}/notify`, { event }),

  adminReports: () =>
    get<{
      totals: { organizations: number; users: number; files: number; storageBytes: number };
      organizations: Array<{ id: string; name: string; code: string; storage_used_bytes: number; storage_quota_bytes: number; created_at: string }>;
      recentActivity: Array<{ id: string; action: string; entity: string; created_at: string }>;
    }>('/admin/reports'),

  adminActivity: (orgId?: string) =>
    get<{ events: ActivityEvent[] }>(`/admin/activity${orgId ? `?orgId=${orgId}` : ''}`),

  adminOrgDetail: (id: string) => get<OrgDetail>(`/admin/org/${id}`),
};

interface MiniProfile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

export interface OrgDetail {
  org: {
    id: string;
    name: string;
    code: string;
    created_at: string;
    storage_used_bytes: number;
    storage_quota_bytes: number;
  };
  admin: MiniProfile | null;
  adminInviteEmail: string | null;
  members: Array<{ id: string; role: string; joined_at: string; profile: MiniProfile | null }>;
  memberCount: number;
  roleBreakdown: Record<string, number>;
  totalFiles: number;
  archivedCount: number;
  trashedCount: number;
  filesByStatus: Record<string, number>;
}

export interface ActivityEvent {
  id: string;
  type: string;
  action: string;
  actor: string | null;
  target: string | null;
  org_id: string | null;
  org_name: string | null;
  org_code: string | null;
  at: string;
}
