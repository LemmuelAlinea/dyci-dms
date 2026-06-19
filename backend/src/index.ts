import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './lib/env.js';
import { invitationsRouter } from './routes/invitations.js';
import { shareRouter } from './routes/share.js';
import { messagesRouter } from './routes/messages.js';
import { approvalsRouter } from './routes/approvals.js';
import { adminRouter } from './routes/admin.js';
import { reportsRouter } from './routes/reports.js';
import { filesRouter } from './routes/files.js';

const app = express();

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true; // same-origin, curl, health checks
  if (env.frontendOrigins.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (hostname.endsWith('.vercel.app')) return true; // production + preview deploys
  } catch {
    /* malformed origin */
  }
  return false;
}

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      cb(new Error(`Origin not allowed: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));

app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'dyci-dms-backend', time: new Date().toISOString() }));

app.use('/invitations', invitationsRouter);
app.use('/share', shareRouter);
app.use('/messages', messagesRouter);
app.use('/approvals', approvalsRouter);
app.use('/admin', adminRouter);
app.use('/reports', reportsRouter);
app.use('/files', filesRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Internal error' });
});

app.listen(env.port, () => {
  console.log(`DYCI DMS backend listening on :${env.port}`);
  console.log(`Allowed origins: ${env.frontendOrigins.join(', ')}`);
});
