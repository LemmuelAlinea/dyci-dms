import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { brandedEmail, sendEmail, type Attachment } from '../lib/brevo.js';
import { buildAttachments, zipFolder } from '../lib/attachments.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const shareRouter = Router();

const schema = z.object({
  fileIds: z.array(z.string().uuid()).optional(),
  folderId: z.string().uuid().optional(),
  toEmails: z.array(z.string().email()).min(1),
  message: z.string().max(4000).optional(),
  orgId: z.string().uuid().optional(),
});

/** Send file(s) / a folder to external email addresses as real attachments. */
shareRouter.post('/email', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fileIds, folderId, toEmails, message, orgId } = parsed.data;
  if (!fileIds?.length && !folderId) return res.status(400).json({ error: 'Provide fileIds or folderId.' });

  try {
    const attachments: Attachment[] = [];
    if (fileIds?.length) attachments.push(...(await buildAttachments(req.user!.id, fileIds)));
    if (folderId) attachments.push(await zipFolder(req.user!.id, folderId));

    const { data: sender } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', req.user!.id)
      .single();

    const names = attachments.map((a) => a.name).join(', ');
    const messageId = await sendEmail({
      to: toEmails.map((email) => ({ email })),
      replyTo: sender ? { email: sender.email, name: sender.full_name ?? undefined } : undefined,
      subject: `${sender?.full_name ?? 'Someone'} shared "${names}" with you`,
      htmlContent: brandedEmail(
        `${sender?.full_name ?? 'A DYCI office'} shared a document with you`,
        `${message ? `<p>${message}</p>` : ''}<p>Attached: <strong>${names}</strong></p>`,
      ),
      attachments,
    });

    for (const to of toEmails) {
      await supabaseAdmin.from('email_log').insert({
        org_id: orgId ?? null,
        sender_id: req.user!.id,
        to_email: to,
        subject: `Shared: ${names}`,
        body: message ?? null,
        attachment_meta: attachments.map((a) => ({ name: a.name })),
        brevo_message_id: messageId,
      });
    }
    return res.json({ ok: true, messageId, attachments: attachments.map((a) => a.name) });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});
