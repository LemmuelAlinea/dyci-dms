import { supabase } from './supabase';
import { notifyUsers } from './notify';
import { listMembers } from './org';
import type { ApprovalComment, ApprovalRequest, ApprovalStep, ApproverOffice, FileItem, Profile } from './types';

const FILES = 'files(*)';
const REQ = 'requester:profiles!approval_requests_requester_id_fkey(*)';

export interface PlanStep {
  step_no: number;
  position_id: string | null;
  position_name: string;
  holders: Profile[];
}

/**
 * The ordered approval plan for a file: one entry per step in its document
 * type's chain, each with the members who hold that step's position. Returns
 * [] when the file has no document type or its type has no chain (→ caller
 * falls back to a single free-pick approver).
 */
export async function getApprovalPlan(file: FileItem): Promise<PlanStep[]> {
  if (!file.document_type_id) return [];
  const { data: steps } = await supabase
    .from('document_type_steps')
    .select('step_no, position_id, position:positions(name)')
    .eq('document_type_id', file.document_type_id)
    .order('step_no');
  if (!steps?.length) return [];

  const posIds = steps.map((s) => s.position_id);
  const { data: holders } = await supabase
    .from('member_positions')
    .select('position_id, profiles(*)')
    .in('position_id', posIds);
  const byPos = new Map<string, Profile[]>();
  (holders ?? []).forEach((h) => {
    const raw = h as unknown as { position_id: string; profiles: Profile | null };
    const arr = byPos.get(raw.position_id) ?? [];
    if (raw.profiles) arr.push(raw.profiles);
    byPos.set(raw.position_id, arr);
  });

  return steps.map((s) => {
    const raw = s as unknown as { step_no: number; position_id: string; position: { name: string } | null };
    return {
      step_no: raw.step_no,
      position_id: raw.position_id,
      position_name: raw.position?.name ?? 'Approver',
      holders: byPos.get(raw.position_id) ?? [],
    };
  });
}

/** Members available for a free-pick (no-chain) approval. */
export async function approverChoices(orgId: string, excludeUserId?: string): Promise<Profile[]> {
  const members = await listMembers(orgId);
  return members
    .filter((m) => m.profiles && m.user_id !== excludeUserId)
    .map((m) => m.profiles as Profile);
}

export async function createApprovalRequest(
  file: FileItem,
  assignments: { step_no: number; position_id: string | null; assignee_id: string }[],
  message: string,
): Promise<void> {
  // Create the request + step assignments + set the file pending atomically,
  // server-side (SECURITY DEFINER), to avoid brittle client-side insert RLS.
  const { error } = await supabase.rpc('request_approval', {
    p_file: file.id,
    p_message: message,
    p_assignees: assignments.map((a) => ({
      step_no: a.step_no,
      position_id: a.position_id,
      assignee_id: a.assignee_id,
    })),
  });
  if (error) throw error;

  const first = assignments.find((a) => a.step_no === 1);
  if (first) {
    await notifyUsers([first.assignee_id], {
      type: 'approval',
      title: 'New approval request',
      body: file.name,
      link: '/app/approvals',
    });
  }
}

export async function listApproverOffices(excludeOrgId: string): Promise<ApproverOffice[]> {
  const { data, error } = await supabase.rpc('list_approver_offices', { p_exclude_org: excludeOrgId });
  if (error) throw error;
  return (data as ApproverOffice[]) ?? [];
}

export async function createCrossOfficeRequest(file: FileItem, targetOrgId: string, message: string): Promise<void> {
  // approver assignments + notifications are created server-side by the RPC
  const { error } = await supabase.rpc('request_cross_office_approval', {
    p_file: file.id, p_message: message, p_target_org: targetOrgId,
  });
  if (error) throw error;
}

/** Requests where the current user is the assignee of the active (pending) step. */
export async function listToReview(userId: string): Promise<ApprovalRequest[]> {
  const { data: steps } = await supabase
    .from('approval_step_assignments')
    .select('request_id')
    .eq('assignee_id', userId)
    .eq('status', 'pending');
  const ids = [...new Set((steps ?? []).map((s) => s.request_id))];
  if (!ids.length) return [];
  const { data } = await supabase
    .from('approval_requests')
    .select(`*, ${FILES}, ${REQ}`)
    .in('id', ids)
    .order('created_at', { ascending: false });
  return (data as ApprovalRequest[]) ?? [];
}

export async function listMyRequests(userId: string): Promise<ApprovalRequest[]> {
  const { data } = await supabase
    .from('approval_requests')
    .select(`*, ${FILES}, ${REQ}`)
    .eq('requester_id', userId)
    .order('created_at', { ascending: false });
  return (data as ApprovalRequest[]) ?? [];
}

export async function getRequestSteps(requestId: string): Promise<ApprovalStep[]> {
  const { data } = await supabase
    .from('approval_step_assignments')
    .select('*, position:positions(name), assignee:profiles!approval_step_assignments_assignee_id_fkey(*)')
    .eq('request_id', requestId)
    .order('step_no');
  return (data as ApprovalStep[]) ?? [];
}

export async function getLatestRequestForFile(fileId: string): Promise<ApprovalRequest | null> {
  const { data } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ApprovalRequest) ?? null;
}

export async function decideApprovalStep(
  request: ApprovalRequest,
  decision: 'approved' | 'rejected',
  comment?: string,
): Promise<void> {
  const { error } = await supabase.rpc('decide_approval', {
    p_request: request.id,
    p_decision: decision,
    p_comment: comment ?? null,
  });
  if (error) throw error;

  const fileName = request.files?.name ?? 'A document';
  if (decision === 'rejected') {
    await notifyUsers([request.requester_id], { type: 'approval', title: 'Your document was rejected', body: fileName, link: '/app/approvals' });
    return;
  }
  // Approved: notify the next pending approver, or the requester if finished.
  const steps = await getRequestSteps(request.id);
  const nextPending = steps.find((s) => s.status === 'pending');
  if (nextPending?.assignee_id) {
    await notifyUsers([nextPending.assignee_id], { type: 'approval', title: 'New approval request', body: fileName, link: '/app/approvals' });
  } else {
    await notifyUsers([request.requester_id], { type: 'approval', title: 'Your document was approved', body: fileName, link: '/app/approvals' });
  }
}

export async function listRequestComments(requestId: string): Promise<ApprovalComment[]> {
  const { data } = await supabase
    .from('approval_comments')
    .select('*, author:profiles!approval_comments_author_id_fkey(*)')
    .eq('request_id', requestId)
    .order('created_at');
  return (data as ApprovalComment[]) ?? [];
}

export async function addRequestComment(requestId: string, body: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase.from('approval_comments').insert({ request_id: requestId, author_id: userId, body });
  if (error) throw error;
}

/** Manually publish an approved (non-auto-released) file to the office feed. */
export async function releaseFile(file: FileItem): Promise<void> {
  const { error } = await supabase
    .from('files')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', file.id);
  if (error) throw error;

  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', file.org_id)
    .eq('status', 'active');
  const recipients = (members ?? []).map((m) => m.user_id).filter((id) => id !== file.owner_id);
  await notifyUsers(recipients, { type: 'release', title: 'New released paper', body: file.name, link: '/app/released' });
}
