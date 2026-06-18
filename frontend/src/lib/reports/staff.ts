import { supabase } from '@/lib/supabase';
import type { ApprovalStatus, FileItem } from '@/lib/types';

export interface MyDocFilters {
  from?: string;
  to?: string;
  status?: string;
  documentTypeId?: string;
}

export async function listMyDocuments(userId: string, f: MyDocFilters): Promise<FileItem[]> {
  let q = supabase
    .from('files')
    .select('*, document_type:document_types(name, publishable)')
    .eq('owner_id', userId)
    .neq('state', 'trashed')
    .order('created_at', { ascending: false });
  if (f.status) q = q.eq('status', f.status);
  if (f.documentTypeId) q = q.eq('document_type_id', f.documentTypeId);
  if (f.from) q = q.gte('created_at', f.from);
  if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`);
  const { data, error } = await q;
  if (error) throw error;
  return (data as FileItem[]) ?? [];
}

// ── My Approval Requests ─────────────────────────────────────────────────────
export interface ApprovalReqFilters {
  from?: string;
  to?: string;
  status?: string;
}

export interface MyRequestRow {
  id: string;
  file_name: string;
  reference_no: string | null;
  type_name: string | null;
  status: ApprovalStatus;
  created_at: string;
  current_approver: string | null;
  decided_at: string | null;
}

export async function listMyApprovalRequests(userId: string, f: ApprovalReqFilters): Promise<MyRequestRow[]> {
  let q = supabase
    .from('approval_requests')
    .select('id, status, current_step, created_at, files(name, reference_no, document_type:document_types(name))')
    .eq('requester_id', userId)
    .order('created_at', { ascending: false });
  if (f.status) q = q.eq('status', f.status);
  if (f.from) q = q.gte('created_at', f.from);
  if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`);
  const { data: reqs } = await q;

  const ids = (reqs ?? []).map((r) => (r as { id: string }).id);
  const byReq = new Map<string, { step_no: number; decided_at: string | null; assignee: { full_name: string | null } | null }[]>();
  if (ids.length) {
    const { data: steps } = await supabase
      .from('approval_step_assignments')
      .select('request_id, step_no, decided_at, assignee:profiles!approval_step_assignments_assignee_id_fkey(full_name)')
      .in('request_id', ids);
    (steps ?? []).forEach((s) => {
      const raw = s as unknown as { request_id: string; step_no: number; decided_at: string | null; assignee: { full_name: string | null } | null };
      const arr = byReq.get(raw.request_id) ?? [];
      arr.push(raw);
      byReq.set(raw.request_id, arr);
    });
  }

  return (reqs ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      status: ApprovalStatus;
      current_step: number;
      created_at: string;
      files: { name?: string; reference_no?: string | null; document_type?: { name?: string } | null } | null;
    };
    const ss = byReq.get(row.id) ?? [];
    const cur = ss.find((s) => s.step_no === row.current_step);
    const decided = ss.map((s) => s.decided_at).filter(Boolean).sort().pop() ?? null;
    return {
      id: row.id,
      file_name: row.files?.name ?? '—',
      reference_no: row.files?.reference_no ?? null,
      type_name: row.files?.document_type?.name ?? null,
      status: row.status,
      created_at: row.created_at,
      current_approver: cur?.assignee?.full_name ?? null,
      decided_at: row.status === 'pending' ? null : (decided as string | null),
    };
  });
}

// ── My Approval Queue ────────────────────────────────────────────────────────
export interface QueueFilters {
  documentTypeId?: string;
}

export interface QueueRow {
  id: string;
  file_id: string;
  file_name: string;
  reference_no: string | null;
  type_name: string | null;
  requester: string | null;
  created_at: string;
}

export async function listMyApprovalQueue(userId: string, f: QueueFilters): Promise<QueueRow[]> {
  const { data: steps } = await supabase
    .from('approval_step_assignments')
    .select('request_id')
    .eq('assignee_id', userId)
    .eq('status', 'pending');
  const ids = [...new Set((steps ?? []).map((s) => s.request_id))];
  if (!ids.length) return [];

  let q = supabase
    .from('approval_requests')
    .select('id, file_id, created_at, document_type_id, files(name, reference_no, document_type:document_types(name)), requester:profiles!approval_requests_requester_id_fkey(full_name)')
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (f.documentTypeId) q = q.eq('document_type_id', f.documentTypeId);
  const { data } = await q;

  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      file_id: string;
      created_at: string;
      files: { name?: string; reference_no?: string | null; document_type?: { name?: string } | null } | null;
      requester: { full_name: string | null } | null;
    };
    return {
      id: row.id,
      file_id: row.file_id,
      file_name: row.files?.name ?? '—',
      reference_no: row.files?.reference_no ?? null,
      type_name: row.files?.document_type?.name ?? null,
      requester: row.requester?.full_name ?? null,
      created_at: row.created_at,
    };
  });
}

// ── My Released Papers ───────────────────────────────────────────────────────
export interface ReleasedFilters {
  from?: string;
  to?: string;
  documentTypeId?: string;
}

export async function listMyReleased(userId: string, f: ReleasedFilters): Promise<FileItem[]> {
  let q = supabase
    .from('files')
    .select('*, approver:profiles!files_approved_by_fkey(*), document_type:document_types(name, publishable)')
    .eq('owner_id', userId)
    .eq('status', 'released')
    .order('released_at', { ascending: false });
  if (f.from) q = q.gte('released_at', f.from);
  if (f.to) q = q.lte('released_at', `${f.to}T23:59:59`);
  if (f.documentTypeId) q = q.eq('document_type_id', f.documentTypeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as FileItem[]) ?? [];
}
