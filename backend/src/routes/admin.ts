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
