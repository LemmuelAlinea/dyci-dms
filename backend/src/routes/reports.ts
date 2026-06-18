import { Router, type Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { isSystemAdmin, requireAuth, roleInOrg, type AuthedRequest } from '../middleware/auth.js';

export const reportsRouter = Router();

async function authorizeOrg(req: AuthedRequest, res: Response, orgId: string, allowed: string[]): Promise<boolean> {
  const role = await roleInOrg(req.user!.id, orgId);
  if (!role || !allowed.includes(role)) {
    res.status(403).json({ error: 'You are not allowed to view this report' });
    return false;
  }
  return true;
}

const fullName = (p: unknown) => (p as { full_name?: string } | null)?.full_name ?? null;
const dayEnd = (d: string) => `${d}T23:59:59`;

// ── Office Summary (admin) ───────────────────────────────────────────────────
reportsRouter.get('/org/:orgId/summary', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin']))) return;
  const [{ data: org }, membersRes, filesRes, catsRes, typesRes, pendingRes] = await Promise.all([
    supabaseAdmin.from('organizations').select('name, code, storage_used_bytes, storage_quota_bytes').eq('id', orgId).single(),
    supabaseAdmin.from('organization_members').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
    supabaseAdmin.from('files').select('status, category_id, document_type_id').eq('org_id', orgId).neq('state', 'trashed'),
    supabaseAdmin.from('categories').select('id, name').eq('org_id', orgId),
    supabaseAdmin.from('document_types').select('id, name').eq('org_id', orgId),
    supabaseAdmin.from('approval_requests').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending'),
  ]);
  const files = (filesRes.data ?? []) as { status: string; category_id: string | null; document_type_id: string | null }[];
  const byStatus: Record<string, number> = { draft: 0, pending: 0, approved: 0, released: 0, rejected: 0 };
  const byCat: Record<string, number> = {};
  const byType: Record<string, number> = {};
  files.forEach((f) => {
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    if (f.category_id) byCat[f.category_id] = (byCat[f.category_id] ?? 0) + 1;
    if (f.document_type_id) byType[f.document_type_id] = (byType[f.document_type_id] ?? 0) + 1;
  });
  const catName = new Map((catsRes.data ?? []).map((c) => [c.id, c.name]));
  const typeName = new Map((typesRes.data ?? []).map((t) => [t.id, t.name]));
  res.json({
    org,
    members: membersRes.count ?? 0,
    totalFiles: files.length,
    byStatus,
    byCategory: Object.entries(byCat).map(([id, count]) => ({ name: catName.get(id) ?? '—', count })),
    byType: Object.entries(byType).map(([id, count]) => ({ name: typeName.get(id) ?? '—', count })),
    released: byStatus.released,
    pendingApprovals: pendingRes.count ?? 0,
  });
});

// ── Document Register (admin, co_admin) ──────────────────────────────────────
reportsRouter.get('/org/:orgId/documents', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin', 'co_admin']))) return;
  const { status, type, category, owner, from, to } = req.query as Record<string, string>;
  let q = supabaseAdmin
    .from('files')
    .select('id, reference_no, name, status, created_at, released_at, owner:profiles!files_owner_id_fkey(full_name), document_type:document_types(name), category:categories(name)')
    .eq('org_id', orgId).neq('state', 'trashed').order('created_at', { ascending: false }).limit(2000);
  if (status) q = q.eq('status', status);
  if (type) q = q.eq('document_type_id', type);
  if (category) q = q.eq('category_id', category);
  if (owner) q = q.eq('owner_id', owner);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', dayEnd(to));
  const { data } = await q;
  res.json({
    rows: (data ?? []).map((r: any) => ({
      id: r.id, reference_no: r.reference_no, name: r.name, status: r.status, created_at: r.created_at, released_at: r.released_at,
      type_name: r.document_type?.name ?? null, category_name: r.category?.name ?? null, owner_name: fullName(r.owner),
    })),
  });
});

// ── Approval Report (admin, co_admin) ────────────────────────────────────────
reportsRouter.get('/org/:orgId/approvals', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin', 'co_admin']))) return;
  const { status, approver, from, to } = req.query as Record<string, string>;
  let q = supabaseAdmin
    .from('approval_requests')
    .select('id, status, current_step, created_at, files(name, reference_no), requester:profiles!approval_requests_requester_id_fkey(full_name)')
    .eq('org_id', orgId).order('created_at', { ascending: false }).limit(2000);
  if (status) q = q.eq('status', status);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', dayEnd(to));
  const { data: reqs } = await q;
  const ids = (reqs ?? []).map((r: any) => r.id);
  const stepsByReq = new Map<string, any[]>();
  const workload = new Map<string, { approver: string; pending: number; approved: number }>();
  if (ids.length) {
    const { data: steps } = await supabaseAdmin
      .from('approval_step_assignments')
      .select('request_id, step_no, status, decided_at, assignee_id, assignee:profiles!approval_step_assignments_assignee_id_fkey(full_name)')
      .in('request_id', ids);
    (steps ?? []).forEach((s: any) => {
      const arr = stepsByReq.get(s.request_id) ?? []; arr.push(s); stepsByReq.set(s.request_id, arr);
      if (!s.assignee_id) return;
      const w = workload.get(s.assignee_id) ?? { approver: fullName(s.assignee) ?? '—', pending: 0, approved: 0 };
      if (s.status === 'pending') w.pending += 1;
      if (s.status === 'approved') w.approved += 1;
      workload.set(s.assignee_id, w);
    });
  }
  let rows = (reqs ?? []).map((r: any) => {
    const ss = stepsByReq.get(r.id) ?? [];
    const cur = ss.find((s) => s.step_no === r.current_step);
    const decided = ss.map((s) => s.decided_at).filter(Boolean).sort().pop() ?? null;
    return { id: r.id, file_name: r.files?.name ?? '—', reference_no: r.files?.reference_no ?? null, requester: fullName(r.requester), current_approver: fullName(cur?.assignee), status: r.status, created_at: r.created_at, decided_at: r.status === 'pending' ? null : decided };
  });
  if (approver) {
    const allowed = new Set<string>();
    stepsByReq.forEach((ss, reqId) => { if (ss.some((s) => s.assignee_id === approver)) allowed.add(reqId); });
    rows = rows.filter((r) => allowed.has(r.id));
  }
  res.json({ rows, workload: [...workload.values()] });
});

// ── Member Activity (admin) ──────────────────────────────────────────────────
reportsRouter.get('/org/:orgId/members', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin']))) return;
  const [membersRes, posRes, filesRes, stepsRes] = await Promise.all([
    supabaseAdmin.from('organization_members').select('user_id, role, joined_at, profiles:profiles!organization_members_user_id_fkey(full_name, email)').eq('org_id', orgId).order('role'),
    supabaseAdmin.from('member_positions').select('user_id, positions(name)').eq('org_id', orgId),
    supabaseAdmin.from('files').select('owner_id, size_bytes, created_at').eq('org_id', orgId).neq('state', 'trashed'),
    supabaseAdmin.from('approval_step_assignments').select('assignee_id, status').eq('org_id', orgId).eq('status', 'approved'),
  ]);
  const posByUser = new Map<string, string[]>();
  (posRes.data ?? []).forEach((p: any) => { const a = posByUser.get(p.user_id) ?? []; if (p.positions?.name) a.push(p.positions.name); posByUser.set(p.user_id, a); });
  const upBy = new Map<string, number>(); const sizeBy = new Map<string, number>(); const lastBy = new Map<string, string>();
  (filesRes.data ?? []).forEach((f: any) => {
    upBy.set(f.owner_id, (upBy.get(f.owner_id) ?? 0) + 1);
    sizeBy.set(f.owner_id, (sizeBy.get(f.owner_id) ?? 0) + (f.size_bytes ?? 0));
    const cur = lastBy.get(f.owner_id); if (!cur || f.created_at > cur) lastBy.set(f.owner_id, f.created_at);
  });
  const apprBy = new Map<string, number>();
  (stepsRes.data ?? []).forEach((s: any) => { if (s.assignee_id) apprBy.set(s.assignee_id, (apprBy.get(s.assignee_id) ?? 0) + 1); });
  res.json({
    rows: (membersRes.data ?? []).map((m: any) => ({
      user_id: m.user_id, full_name: m.profiles?.full_name ?? null, email: m.profiles?.email ?? null, role: m.role,
      positions: (posByUser.get(m.user_id) ?? []).join(', '), uploads: upBy.get(m.user_id) ?? 0,
      approvals: apprBy.get(m.user_id) ?? 0, storage_bytes: sizeBy.get(m.user_id) ?? 0, last_active: lastBy.get(m.user_id) ?? null,
    })),
  });
});

// ── Member Directory (admin, co_admin) ───────────────────────────────────────
reportsRouter.get('/org/:orgId/members-directory', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin', 'co_admin']))) return;
  const [membersRes, posRes] = await Promise.all([
    supabaseAdmin.from('organization_members').select('user_id, role, joined_at, profiles:profiles!organization_members_user_id_fkey(full_name, email)').eq('org_id', orgId).order('role'),
    supabaseAdmin.from('member_positions').select('user_id, positions(name)').eq('org_id', orgId),
  ]);
  const posByUser = new Map<string, string[]>();
  (posRes.data ?? []).forEach((p: any) => { const a = posByUser.get(p.user_id) ?? []; if (p.positions?.name) a.push(p.positions.name); posByUser.set(p.user_id, a); });
  res.json({
    rows: (membersRes.data ?? []).map((m: any) => ({
      full_name: m.profiles?.full_name ?? null, email: m.profiles?.email ?? null, role: m.role,
      positions: (posByUser.get(m.user_id) ?? []).join(', '), joined_at: m.joined_at,
    })),
  });
});

// ── Released Register (admin, co_admin) ──────────────────────────────────────
reportsRouter.get('/org/:orgId/released', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin', 'co_admin']))) return;
  const { type, category, from, to } = req.query as Record<string, string>;
  let q = supabaseAdmin
    .from('files')
    .select('id, reference_no, name, released_at, owner:profiles!files_owner_id_fkey(full_name), approver:profiles!files_approved_by_fkey(full_name), document_type:document_types(name), category:categories(name)')
    .eq('org_id', orgId).eq('status', 'released').eq('state', 'active').order('released_at', { ascending: false }).limit(2000);
  if (type) q = q.eq('document_type_id', type);
  if (category) q = q.eq('category_id', category);
  if (from) q = q.gte('released_at', from);
  if (to) q = q.lte('released_at', dayEnd(to));
  const { data } = await q;
  res.json({
    rows: (data ?? []).map((r: any) => ({
      id: r.id, reference_no: r.reference_no, name: r.name, released_at: r.released_at,
      owner_name: fullName(r.owner), approver_name: fullName(r.approver), type_name: r.document_type?.name ?? null, category_name: r.category?.name ?? null,
    })),
  });
});

// ── Document-Type Report (admin) ─────────────────────────────────────────────
reportsRouter.get('/org/:orgId/by-type', requireAuth, async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  if (!(await authorizeOrg(req, res, orgId, ['admin']))) return;
  const { documentTypeId, status, from, to } = req.query as Record<string, string>;
  if (!documentTypeId) return res.json({ name: null, fields: [], rows: [] });
  const { data: dt } = await supabaseAdmin.from('document_types').select('name, fields').eq('id', documentTypeId).eq('org_id', orgId).single();
  let q = supabaseAdmin
    .from('files')
    .select('id, reference_no, status, created_at, metadata, owner:profiles!files_owner_id_fkey(full_name)')
    .eq('org_id', orgId).eq('document_type_id', documentTypeId).neq('state', 'trashed').order('created_at', { ascending: false }).limit(2000);
  if (status) q = q.eq('status', status);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', dayEnd(to));
  const { data } = await q;
  res.json({
    name: dt?.name ?? null,
    fields: dt?.fields ?? [],
    rows: (data ?? []).map((r: any) => ({ id: r.id, reference_no: r.reference_no, status: r.status, created_at: r.created_at, owner_name: fullName(r.owner), metadata: r.metadata ?? {} })),
  });
});

// ── Platform Overview (system admin) ─────────────────────────────────────────
reportsRouter.get('/admin/overview', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isSystemAdmin(req.user!.id))) return res.status(403).json({ error: 'System admin only' });
  const [{ count: orgCount }, { count: userCount }, { count: fileCount }, { data: orgs }] = await Promise.all([
    supabaseAdmin.from('organizations').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('files').select('*', { count: 'exact', head: true }).neq('state', 'trashed'),
    supabaseAdmin.from('organizations').select('type, storage_used_bytes'),
  ]);
  const byType: Record<string, { count: number; storage: number }> = {};
  let totalStorage = 0;
  (orgs ?? []).forEach((o: any) => {
    const t = o.type ?? 'general';
    if (!byType[t]) byType[t] = { count: 0, storage: 0 };
    byType[t].count += 1;
    byType[t].storage += Number(o.storage_used_bytes ?? 0);
    totalStorage += Number(o.storage_used_bytes ?? 0);
  });
  res.json({
    organizations: orgCount ?? 0,
    users: userCount ?? 0,
    documents: fileCount ?? 0,
    storageBytes: totalStorage,
    byType: Object.entries(byType).map(([type, v]) => ({ type, count: v.count, storage: v.storage })),
  });
});

// ── Organizations Directory (system admin) ───────────────────────────────────
reportsRouter.get('/admin/organizations', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isSystemAdmin(req.user!.id))) return res.status(403).json({ error: 'System admin only' });
  const [{ data: orgs }, { data: members }, { data: files }, { data: admins }] = await Promise.all([
    supabaseAdmin.from('organizations').select('id, code, name, type, storage_used_bytes, storage_quota_bytes, admin_id, created_at').order('created_at', { ascending: false }),
    supabaseAdmin.from('organization_members').select('org_id'),
    supabaseAdmin.from('files').select('org_id').neq('state', 'trashed'),
    supabaseAdmin.from('profiles').select('id, full_name'),
  ]);
  const memberCount: Record<string, number> = {};
  (members ?? []).forEach((m: any) => (memberCount[m.org_id] = (memberCount[m.org_id] ?? 0) + 1));
  const docCount: Record<string, number> = {};
  (files ?? []).forEach((f: any) => (docCount[f.org_id] = (docCount[f.org_id] ?? 0) + 1));
  const adminName = new Map((admins ?? []).map((a: any) => [a.id, a.full_name]));
  res.json({
    rows: (orgs ?? []).map((o: any) => ({
      id: o.id, code: o.code, name: o.name, type: o.type,
      admin_name: o.admin_id ? adminName.get(o.admin_id) ?? null : null,
      members: memberCount[o.id] ?? 0, documents: docCount[o.id] ?? 0,
      storage_used: o.storage_used_bytes, storage_quota: o.storage_quota_bytes, created_at: o.created_at,
    })),
  });
});

// ── Storage Utilization (system admin) ───────────────────────────────────────
reportsRouter.get('/admin/storage', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isSystemAdmin(req.user!.id))) return res.status(403).json({ error: 'System admin only' });
  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('id, code, name, type, storage_used_bytes, storage_quota_bytes')
    .order('storage_used_bytes', { ascending: false });
  res.json({
    rows: (orgs ?? []).map((o: any) => {
      const pct = o.storage_quota_bytes ? (Number(o.storage_used_bytes) / Number(o.storage_quota_bytes)) * 100 : 0;
      return {
        id: o.id, code: o.code, name: o.name, type: o.type,
        storage_used: o.storage_used_bytes, storage_quota: o.storage_quota_bytes,
        percent: pct, health: pct < 60 ? 'Healthy' : pct < 85 ? 'Moderate' : 'Critical',
      };
    }),
  });
});
