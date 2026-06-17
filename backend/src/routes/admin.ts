import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { isSystemAdmin, requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const adminRouter = Router();

/** Aggregate platform metrics for the System Admin dashboard. */
adminRouter.get('/reports', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isSystemAdmin(req.user!.id))) {
    return res.status(403).json({ error: 'System admin only' });
  }

  const [{ count: orgCount }, { count: userCount }, { count: fileCount }, { data: orgs }, { data: activity }] =
    await Promise.all([
      supabaseAdmin.from('organizations').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('files').select('*', { count: 'exact', head: true }),
      supabaseAdmin
        .from('organizations')
        .select('id, name, code, storage_used_bytes, storage_quota_bytes, created_at'),
      supabaseAdmin
        .from('activity_log')
        .select('id, action, entity, created_at, org_id')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

  const totalStorage = (orgs ?? []).reduce((s, o) => s + Number(o.storage_used_bytes ?? 0), 0);

  return res.json({
    totals: { organizations: orgCount ?? 0, users: userCount ?? 0, files: fileCount ?? 0, storageBytes: totalStorage },
    organizations: orgs ?? [],
    recentActivity: activity ?? [],
  });
});

interface ActivityEvent {
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

/** Unified, org-filterable activity feed derived from existing data. */
adminRouter.get('/activity', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isSystemAdmin(req.user!.id))) {
    return res.status(403).json({ error: 'System admin only' });
  }
  const orgFilter = (req.query.orgId as string) || null;

  const orgsQuery = supabaseAdmin.from('organizations').select('id, name, code, created_at');
  if (orgFilter) orgsQuery.eq('id', orgFilter);

  const membersQuery = supabaseAdmin
    .from('organization_members')
    .select('id, org_id, role, joined_at, profiles:profiles!organization_members_user_id_fkey(full_name)')
    .order('joined_at', { ascending: false })
    .limit(60);
  if (orgFilter) membersQuery.eq('org_id', orgFilter);

  const filesQuery = supabaseAdmin
    .from('files')
    .select('id, org_id, name, created_at, released_at, owner:profiles!files_owner_id_fkey(full_name), approver:profiles!files_approved_by_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (orgFilter) filesQuery.eq('org_id', orgFilter);

  const approvalsQuery = supabaseAdmin
    .from('approvals')
    .select('id, org_id, status, created_at, decided_at, files(name), requester:profiles!approvals_requester_id_fkey(full_name), approver:profiles!approvals_approver_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (orgFilter) approvalsQuery.eq('org_id', orgFilter);

  const [{ data: orgs }, { data: members }, { data: files }, { data: approvals }] = await Promise.all([
    orgsQuery,
    membersQuery,
    filesQuery,
    approvalsQuery,
  ]);

  const orgMeta: Record<string, { name: string; code: string }> = {};
  (orgs ?? []).forEach((o) => (orgMeta[o.id] = { name: o.name, code: o.code }));
  const meta = (id: string | null) => (id && orgMeta[id]) || { name: null, code: null };

  const events: ActivityEvent[] = [];
  const name = (p: unknown) => (p as { full_name?: string } | null)?.full_name ?? null;

  (orgs ?? []).forEach((o) =>
    events.push({ id: `org-${o.id}`, type: 'org_created', action: 'Organization created', actor: null, target: o.name, org_id: o.id, org_name: o.name, org_code: o.code, at: o.created_at }),
  );

  (members ?? []).forEach((m: any) =>
    events.push({ id: `mem-${m.id}`, type: 'member_added', action: `Joined as ${String(m.role).replace('_', '-')}`, actor: name(m.profiles), target: name(m.profiles), org_id: m.org_id, org_name: meta(m.org_id).name, org_code: meta(m.org_id).code, at: m.joined_at }),
  );

  (files ?? []).forEach((f: any) => {
    events.push({ id: `file-${f.id}`, type: 'upload', action: 'Uploaded a document', actor: name(f.owner), target: f.name, org_id: f.org_id, org_name: meta(f.org_id).name, org_code: meta(f.org_id).code, at: f.created_at });
    if (f.released_at) {
      events.push({ id: `rel-${f.id}`, type: 'release', action: 'Released a paper', actor: name(f.approver) ?? name(f.owner), target: f.name, org_id: f.org_id, org_name: meta(f.org_id).name, org_code: meta(f.org_id).code, at: f.released_at });
    }
  });

  (approvals ?? []).forEach((a: any) => {
    events.push({ id: `req-${a.id}`, type: 'approval_request', action: 'Requested approval', actor: name(a.requester), target: a.files?.name ?? null, org_id: a.org_id, org_name: meta(a.org_id).name, org_code: meta(a.org_id).code, at: a.created_at });
    if (a.decided_at && a.status !== 'pending') {
      events.push({ id: `dec-${a.id}`, type: a.status, action: a.status === 'approved' ? 'Approved a document' : 'Rejected a document', actor: name(a.approver), target: a.files?.name ?? null, org_id: a.org_id, org_name: meta(a.org_id).name, org_code: meta(a.org_id).code, at: a.decided_at });
    }
  });

  events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  return res.json({ events: events.slice(0, 120) });
});

/** Full detail for one organization (System Admin monitoring). */
adminRouter.get('/org/:id', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isSystemAdmin(req.user!.id))) {
    return res.status(403).json({ error: 'System admin only' });
  }
  const orgId = req.params.id;

  const { data: org } = await supabaseAdmin.from('organizations').select('*').eq('id', orgId).single();
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  const [{ data: members }, { data: files }, { data: invite }] = await Promise.all([
    supabaseAdmin
      .from('organization_members')
      .select('id, role, joined_at, user_id, profiles:profiles!organization_members_user_id_fkey(id, full_name, email, avatar_url)')
      .eq('org_id', orgId)
      .order('role'),
    supabaseAdmin.from('files').select('status, state, size_bytes').eq('org_id', orgId),
    supabaseAdmin
      .from('invitations')
      .select('email')
      .eq('org_id', orgId)
      .eq('role', 'admin')
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle(),
  ]);

  const roleBreakdown = { admin: 0, co_admin: 0, staff: 0, approver: 0 } as Record<string, number>;
  let adminProfile: unknown = null;
  (members ?? []).forEach((m: any) => {
    roleBreakdown[m.role] = (roleBreakdown[m.role] ?? 0) + 1;
    if (m.role === 'admin') adminProfile = m.profiles;
  });

  const filesByStatus = { draft: 0, pending: 0, approved: 0, released: 0, rejected: 0 } as Record<string, number>;
  let totalFiles = 0;
  let archivedCount = 0;
  let trashedCount = 0;
  (files ?? []).forEach((f: any) => {
    if (f.state === 'trashed') {
      trashedCount += 1;
      return;
    }
    if (f.state === 'archived') archivedCount += 1;
    totalFiles += 1;
    filesByStatus[f.status] = (filesByStatus[f.status] ?? 0) + 1;
  });

  return res.json({
    org,
    admin: adminProfile,
    adminInviteEmail: adminProfile ? null : invite?.email ?? null,
    members: (members ?? []).map((m: any) => ({ id: m.id, role: m.role, joined_at: m.joined_at, profile: m.profiles })),
    memberCount: members?.length ?? 0,
    roleBreakdown,
    totalFiles,
    archivedCount,
    trashedCount,
    filesByStatus,
  });
});
