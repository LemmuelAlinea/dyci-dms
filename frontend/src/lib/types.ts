export type OrgRole = 'admin' | 'co_admin' | 'staff' | 'approver';
export type DocStatus = 'draft' | 'pending' | 'approved' | 'released' | 'rejected';
export type NodeState = 'active' | 'archived' | 'trashed';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_system_admin: boolean;
  theme: 'light' | 'dark' | 'system';
  notif_prefs: Record<string, boolean>;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  admin_id: string | null;
  created_by: string | null;
  storage_used_bytes: number;
  storage_quota_bytes: number;
  created_at: string;
}

export interface OrgMembership {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  status: 'invited' | 'active' | 'suspended';
  joined_at: string;
  organizations?: Organization;
  profiles?: Profile;
}

export interface Folder {
  id: string;
  org_id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  state: NodeState;
  created_at: string;
  updated_at: string;
}

export interface FileItem {
  id: string;
  org_id: string;
  owner_id: string;
  folder_id: string | null;
  name: string;
  mime: string | null;
  kind: string;
  size_bytes: number;
  current_version: number;
  status: DocStatus;
  state: NodeState;
  released_at: string | null;
  approved_by: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  owner?: Profile;
  approver?: Profile;
}

export interface FileVersion {
  id: string;
  file_id: string;
  version_no: number;
  storage_path: string;
  size_bytes: number;
  mime: string | null;
  uploaded_by: string | null;
  note: string | null;
  created_at: string;
  uploader?: Profile;
}

export interface Approval {
  id: string;
  org_id: string;
  file_id: string;
  version_no: number;
  requester_id: string;
  approver_id: string;
  status: ApprovalStatus;
  message: string | null;
  decided_at: string | null;
  created_at: string;
  files?: FileItem;
  requester?: Profile;
  approver?: Profile;
}

export interface ApprovalComment {
  id: string;
  approval_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Profile;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface Share {
  id: string;
  org_id: string;
  target_type: 'file' | 'folder';
  target_id: string;
  shared_by: string;
  shared_with_user_id: string | null;
  permission: 'view' | 'download';
  created_at: string;
}

export const ROLE_LABEL: Record<OrgRole, string> = {
  admin: 'Admin',
  co_admin: 'Co-Admin',
  staff: 'Staff',
  approver: 'Approver',
};

export const STATUS_META: Record<DocStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' },
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300' },
  approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' },
  released: { label: 'Released', className: 'bg-navy-100 text-navy-700 dark:bg-navy-400/20 dark:text-navy-200' },
  rejected: { label: 'Rejected', className: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300' },
};
