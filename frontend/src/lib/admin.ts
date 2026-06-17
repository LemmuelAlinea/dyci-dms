import { supabase } from './supabase';
import type { Organization, Profile } from './types';

export interface OrgWithMeta extends Organization {
  admin?: Profile | null;
  member_count?: number;
}

export async function listOrganizations(): Promise<OrgWithMeta[]> {
  const { data: orgs } = await supabase
    .from('organizations')
    .select('*, admin:profiles!organizations_admin_id_fkey(*)')
    .order('created_at', { ascending: false });
  const { data: members } = await supabase.from('organization_members').select('org_id');
  const counts: Record<string, number> = {};
  (members ?? []).forEach((m) => (counts[m.org_id] = (counts[m.org_id] ?? 0) + 1));
  return (orgs ?? []).map((o) => ({ ...(o as OrgWithMeta), member_count: counts[o.id] ?? 0 }));
}

export async function createOrganization(name: string, code: string): Promise<Organization> {
  const me = (await supabase.auth.getUser()).data.user?.id;
  const { data, error } = await supabase
    .from('organizations')
    .insert({ name, code: code.toUpperCase(), created_by: me })
    .select()
    .single();
  if (error) throw error;
  return data as Organization;
}

/**
 * Assign the single Organization Admin by email.
 * - If the user already exists: set as admin membership + organizations.admin_id (demotes any previous admin).
 * - If not: create an admin invitation; the signup trigger will create the membership on registration.
 */
export async function assignOrgAdmin(orgId: string, email: string): Promise<'assigned' | 'invited'> {
  const { data: profile } = await supabase.from('profiles').select('id').ilike('email', email).maybeSingle();

  if (profile) {
    // Demote any existing admin to co-admin to keep a single admin.
    await supabase.from('organization_members').update({ role: 'co_admin' }).eq('org_id', orgId).eq('role', 'admin');
    await supabase
      .from('organization_members')
      .upsert({ org_id: orgId, user_id: profile.id, role: 'admin', status: 'active' }, { onConflict: 'org_id,user_id' });
    await supabase.from('organizations').update({ admin_id: profile.id }).eq('id', orgId);
    return 'assigned';
  }

  await supabase.from('invitations').insert({ org_id: orgId, email: email.toLowerCase(), role: 'admin' });
  return 'invited';
}

export async function updateOrgQuota(orgId: string, quotaBytes: number) {
  const { error } = await supabase.from('organizations').update({ storage_quota_bytes: quotaBytes }).eq('id', orgId);
  if (error) throw error;
}

export async function deleteOrganization(orgId: string) {
  const { error } = await supabase.from('organizations').delete().eq('id', orgId);
  if (error) throw error;
}
