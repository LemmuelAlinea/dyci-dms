import { supabase } from './supabase';

const BASE = (import.meta.env.VITE_API_URL as string) ?? '';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  if (!BASE) {
    throw new Error('Backend API is not configured (VITE_API_URL is empty). Set it in your hosting env.');
  }
  const res = await fetch(`${BASE}${path}`, init);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    // Most commonly: VITE_API_URL points at the frontend (SPA), so we got HTML.
    throw new Error('Backend API is unreachable. Check that VITE_API_URL points to your running backend.');
  }
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  });
}

async function get<T>(path: string): Promise<T> {
  return request<T>(path, { headers: { ...(await authHeader()) } });
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
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

  reportOrgSummary: (orgId: string) => get<OrgSummary>(`/reports/org/${orgId}/summary`),
  reportOrgDocuments: (orgId: string, f: Record<string, string | undefined>) => get<{ rows: DocRegisterRow[] }>(`/reports/org/${orgId}/documents${qs(f)}`),
  reportOrgApprovals: (orgId: string, f: Record<string, string | undefined>) => get<{ rows: ApprovalRow[]; workload: WorkloadRow[] }>(`/reports/org/${orgId}/approvals${qs(f)}`),
  reportOrgMembers: (orgId: string) => get<{ rows: MemberActivityRow[] }>(`/reports/org/${orgId}/members`),
  reportOrgMembersDirectory: (orgId: string) => get<{ rows: MemberDirRow[] }>(`/reports/org/${orgId}/members-directory`),
  reportOrgReleased: (orgId: string, f: Record<string, string | undefined>) => get<{ rows: ReleasedRow[] }>(`/reports/org/${orgId}/released${qs(f)}`),
  reportOrgByType: (orgId: string, f: Record<string, string | undefined>) => get<ByTypeReport>(`/reports/org/${orgId}/by-type${qs(f)}`),

  reportAdminOverview: () => get<AdminOverview>('/reports/admin/overview'),
  reportAdminOrganizations: () => get<{ rows: OrgDirRow[] }>('/reports/admin/organizations'),
  reportAdminStorage: () => get<{ rows: StorageRow[] }>('/reports/admin/storage'),

  createOrganization: (input: { name: string; code: string; type: string }) =>
    post<{ organization: unknown }>('/admin/organizations', input),

  uploadVersion: async (fileId: string, file: File): Promise<{ version: number }> => {
    if (!BASE) throw new Error('Backend API is not configured (VITE_API_URL is empty).');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/files/${fileId}/version`, {
      method: 'POST',
      headers: { ...(await authHeader()) },
      body: fd,
    });
    const json = (await res.json().catch(() => ({}))) as { version?: number; error?: string };
    if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
    return json as { version: number };
  },
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

export interface OrgSummary {
  org: { name: string; code: string; storage_used_bytes: number; storage_quota_bytes: number };
  members: number;
  totalFiles: number;
  byStatus: Record<string, number>;
  byCategory: { name: string; count: number }[];
  byType: { name: string; count: number }[];
  released: number;
  pendingApprovals: number;
}
export interface DocRegisterRow {
  id: string; reference_no: string | null; name: string; status: string; created_at: string; released_at: string | null;
  type_name: string | null; category_name: string | null; owner_name: string | null;
}
export interface ApprovalRow {
  id: string; file_name: string; reference_no: string | null; requester: string | null; current_approver: string | null;
  status: string; created_at: string; decided_at: string | null;
}
export interface WorkloadRow { approver: string; pending: number; approved: number }
export interface MemberActivityRow {
  user_id: string; full_name: string | null; email: string | null; role: string; positions: string;
  uploads: number; approvals: number; storage_bytes: number; last_active: string | null;
}
export interface MemberDirRow { full_name: string | null; email: string | null; role: string; positions: string; joined_at: string }
export interface ReleasedRow {
  id: string; reference_no: string | null; name: string; released_at: string | null;
  owner_name: string | null; approver_name: string | null; type_name: string | null; category_name: string | null;
}
export interface ByTypeField { key: string; label: string; type: string; options?: string[] }
export interface ByTypeReport {
  name: string | null;
  fields: ByTypeField[];
  rows: { id: string; reference_no: string | null; status: string; created_at: string; owner_name: string | null; metadata: Record<string, unknown> }[];
}
export interface AdminOverview {
  organizations: number;
  users: number;
  documents: number;
  storageBytes: number;
  byType: { type: string; count: number; storage: number }[];
}
export interface OrgDirRow {
  id: string; code: string; name: string; type: string; admin_name: string | null;
  members: number; documents: number; storage_used: number; storage_quota: number; created_at: string;
}
export interface StorageRow {
  id: string; code: string; name: string; type: string;
  storage_used: number; storage_quota: number; percent: number; health: string;
}
