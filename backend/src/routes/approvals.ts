import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { brandedEmail, sendEmail } from '../lib/brevo.js';
import { env } from '../lib/env.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const approvalsRouter = Router();

const schema = z.object({
  event: z.enum(['requested', 'approved', 'rejected', 'commented']),
});

/** Notify the relevant party about an approval lifecycle event (email + in-app). */
approvalsRouter.post('/:id/notify', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { event } = parsed.data;
  const approvalId = req.params.id;

  const { data: approval } = await supabaseAdmin
    .from('approvals')
    .select('id, file_id, requester_id, approver_id, status, files(name)')
    .eq('id', approvalId)
    .single();
  if (!approval) return res.status(404).json({ error: 'Approval not found' });

  // Decide who is notified.
  const recipientId = event === 'requested' ? approval.approver_id : approval.requester_id;
  const { data: recipient } = await supabaseAdmin
    .from('profiles')
    .select('email, full_name, notif_prefs')
    .eq('id', recipientId)
    .single();
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

  const fileName = (approval as any).files?.name ?? 'a document';
  const copy: Record<string, { title: string; body: string }> = {
    requested: { title: 'New approval request', body: `You have a new approval request for <strong>${fileName}</strong>.` },
    approved: { title: 'Your document was approved', body: `<strong>${fileName}</strong> has been approved.` },
    rejected: { title: 'Your document was rejected', body: `<strong>${fileName}</strong> was rejected. Open it to read the reviewer's comments.` },
    commented: { title: 'New comment on your document', body: `There is a new comment on <strong>${fileName}</strong>.` },
  };
  const { title, body } = copy[event];

  // Note: the in-app notification is created client-side (so it works in
  // real-time even if this email step is unavailable). Here we only send email.
  try {
    const messageId = await sendEmail({
      to: [{ email: recipient.email, name: recipient.full_name ?? undefined }],
      subject: `${title} · DYCI DMS`,
      htmlContent: brandedEmail(title, body, `${env.appUrl}/app/approvals`, 'Open approvals'),
    });
    return res.json({ ok: true, messageId });
  } catch (e) {
    return res.json({ ok: true, emailError: (e as Error).message });
  }
});
