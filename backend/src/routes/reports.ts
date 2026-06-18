import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const reportsRouter = Router();

// Scaffold — office and platform report endpoints are added in later plans.
reportsRouter.get('/_ping', requireAuth, (_req: AuthedRequest, res) => res.json({ ok: true }));
