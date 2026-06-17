import { supabase } from './supabase';
import type { Organization, Profile } from './types';

export interface OrgWithMeta extends Organization {
  admin?: Profile | null;
  adminInviteEmail?: string | null; // assigned but not yet registered
  member_count?: number;
}

interface MemberRow {
  org_id: string;
  role: string;
  profiles?: Profile | null;
}

export async function listOrganizations(): Promise<OrgWithMeta[]> {
  // The admin is whoever holds role='admin' in organization_members (the source
  // of truth) — not just organizations.admin_id, which is only set when the
  // admin already had an account at assign time.
  const [{ data: orgs }, { data: members }, { data: invites }] = await Promise.all([
    supabase.from('organizations').select('*').order('created_at', { ascending: false }),
    supabase
      .from('organization_members')
      .select('org_id, role, profiles:profiles!organization_members_user_id_fkey(*)'),
    supabase.from('invitations').select('org_id, email').eq('role', 'admin').eq('status', 'pending'),
  ]);

  const counts: Record<string, number> = {};
  const adminByOrg: Record<string, Profile> = {};
  ((members ?? []) as unknown as MemberRow[]).forEach((m) => {
    counts[m.org_id] = (counts[m.org_id] ?? 0) + 1;
    if (m.role === 'admin' && m.profiles) adminByOrg[m.org_id] = m.profiles;
  });

  const inviteByOrg: Record<string, string> = {};
  (invites ?? []).forEach((i) => {
    if (!inviteByOrg[i.org_id]) inviteByOrg[i.org_id] = i.email;
  });

  return (orgs ?? []).map((o) => ({
    ...(o as Organization),
    member_count: counts[o.id] ?? 0,
    admin: adminByOrg[o.id] ?? null,
    adminInviteEmail: adminByOrg[o.id] ? null : inviteByOrg[o.id] ?? null,
  }));
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
