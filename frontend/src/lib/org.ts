import { supabase } from './supabase';
import type { OrgMembership, OrgRole, Profile } from './types';

export async function listMembers(orgId: string): Promise<OrgMembership[]> {
  // organization_members has two FKs to profiles (user_id, invited_by), so the
  // embed must name the relationship explicitly or PostgREST errors out.
  const { data, error } = await supabase
    .from('organization_members')
    .select('*, profiles:profiles!organization_members_user_id_fkey(*)')
    .eq('org_id', orgId)
    .order('role');
  if (error) throw error;
  return (data as OrgMembership[]) ?? [];
}

export async function updateMemberRole(membershipId: string, role: OrgRole) {
  const { error } = await supabase.from('organization_members').update({ role }).eq('id', membershipId);
  if (error) throw error;
}

export async function removeMember(membershipId: string) {
  const { error } = await supabase.from('organization_members').delete().eq('id', membershipId);
  if (error) throw error;
}

export interface ShareOptions {
  access: 'view' | 'edit';
  canDownload: boolean;
  canReshare: boolean;
}

export async function shareFileWithMember(
  orgId: string,
  fileId: string,
  targetUserId: string,
  opts: ShareOptions,
) {
  const { error } = await supabase.from('shares').insert({
    org_id: orgId,
    target_type: 'file',
    target_id: fileId,
    shared_by: (await supabase.auth.getUser()).data.user?.id,
    shared_with_user_id: targetUserId,
    permission: opts.access,
    can_download: opts.canDownload,
    can_reshare: opts.canReshare,
  });
  if (error) throw error;
}

export type MemberProfile = OrgMembership & { profiles?: Profile };
