import { supabase } from './supabase';
import { api } from './api';
import { notifyUsers } from './notify';
import type { Approval, ApprovalComment, FileItem } from './types';

const FILES = 'files(*)';
const REQ = 'requester:profiles!approvals_requester_id_fkey(*)';
const APR = 'approver:profiles!approvals_approver_id_fkey(*)';

export async function requestApproval(file: FileItem, approverId: string, message: string) {
  const { data, error } = await supabase
    .from('approvals')
    .insert({
      org_id: file.org_id,
      file_id: file.id,
      version_no: file.current_version,
      requester_id: file.owner_id,
      approver_id: approverId,
      message,
    })
    .select()
    .single();
  if (error) throw error;
  await supabase.from('files').update({ status: 'pending' }).eq('id', file.id);
  await notifyUsers([approverId], {
    type: 'approval',
    title: 'New approval request',
    body: file.name,
    link: '/app/approvals',
  });
  try {
    await api.notifyApproval(data.id, 'requested');
  } catch {
    /* email is best-effort */
  }
  return data as Approval;
}

export async function listMyRequests(userId: string): Promise<Approval[]> {
  const { data } = await supabase
    .from('approvals')
    .select(`*, ${FILES}, ${REQ}, ${APR}`)
    .eq('requester_id', userId)
    .order('created_at', { ascending: false });
  return (data as Approval[]) ?? [];
}

export async function listToReview(userId: string): Promise<Approval[]> {
  const { data } = await supabase
    .from('approvals')
    .select(`*, ${FILES}, ${REQ}, ${APR}`)
    .eq('approver_id', userId)
    .order('created_at', { ascending: false });
  return (data as Approval[]) ?? [];
}

export async function listComments(approvalId: string): Promise<ApprovalComment[]> {
  const { data } = await supabase
    .from('approval_comments')
    .select('*, author:profiles!approval_comments_author_id_fkey(*)')
    .eq('approval_id', approvalId)
    .order('created_at');
  return (data as ApprovalComment[]) ?? [];
}

export async function addComment(approvalId: string, body: string) {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase.from('approval_comments').insert({ approval_id: approvalId, author_id: userId, body });
  if (error) throw error;

  // Notify the other participant (the one who didn't write the comment).
  const { data: a } = await supabase
    .from('approvals')
    .select(`requester_id, approver_id, ${FILES}`)
    .eq('id', approvalId)
    .single();
  if (a) {
    const recipient = a.requester_id === userId ? a.approver_id : a.requester_id;
    await notifyUsers([recipient], {
      type: 'approval',
      title: 'New comment on a document',
      body: (a as { files?: { name?: string } }).files?.name ?? 'A document',
      link: '/app/approvals',
    });
  }
  try {
    await api.notifyApproval(approvalId, 'commented');
  } catch {
    /* noop */
  }
}

export async function decideApproval(approval: Approval, decision: 'approved' | 'rejected') {
  const approverId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase
    .from('approvals')
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq('id', approval.id);
  if (error) throw error;

  await supabase
    .from('files')
    .update(
      decision === 'approved'
        ? { status: 'approved', approved_by: approverId }
        : { status: 'rejected' },
    )
    .eq('id', approval.file_id);

  await notifyUsers([approval.requester_id], {
    type: 'approval',
    title: decision === 'approved' ? 'Your document was approved' : 'Your document was rejected',
    body: approval.files?.name ?? 'A document',
    link: '/app/approvals',
  });
  try {
    await api.notifyApproval(approval.id, decision);
  } catch {
    /* noop */
  }
}

/** Publish an approved file to the office-wide Released Papers feed. */
export async function releaseFile(file: FileItem) {
  const { error } = await supabase
    .from('files')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', file.id);
  if (error) throw error;

  // Notify every active member of the office (except the owner).
  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', file.org_id)
    .eq('status', 'active');
  const recipients = (members ?? []).map((m) => m.user_id).filter((id) => id !== file.owner_id);
  await notifyUsers(recipients, {
    type: 'release',
    title: 'New released paper',
    body: file.name,
    link: '/app/released',
  });
}
