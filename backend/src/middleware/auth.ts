import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export interface AuthedRequest extends Request {
  user?: { id: string; email: string };
}

/** Verifies the Supabase access token in the Authorization header. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Invalid or expired token' });

    req.user = { id: data.user.id, email: data.user.email ?? '' };
    next();
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

/** Returns the caller's active role within an org, or null. */
export async function roleInOrg(userId: string, orgId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  return data?.role ?? null;
}

export async function isSystemAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('is_system_admin')
    .eq('id', userId)
    .maybeSingle();
  return Boolean(data?.is_system_admin);
}
