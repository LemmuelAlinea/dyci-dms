import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { brandedEmail, sendEmail, type Attachment } from '../lib/brevo.js';
import { buildAttachments } from '../lib/attachments.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const messagesRouter = Router();

const schema = z.object({
  toEmails: z.array(z.string().email()).min(1),
  subject: z.string().min(1).max(200),
  body: z.string().max(8000).optional(),
  fileIds: z.array(z.string().uuid()).optional(),
  orgId: z.string().uuid().optional(),
});

/** Direct email to anyone (members or outsiders), with optional attachments. */
messagesRouter.post('/email', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { toEmails, subject, body, fileIds, orgId } = parsed.data;

  try {
    const attachments: Attachment[] = fileIds?.length ? await buildAttachments(req.user!.id, fileIds) : [];
    const { data: sender } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', req.user!.id)
      .single();

    const messageId = await sendEmail({
      to: toEmails.map((email) => ({ email })),
      replyTo: sender ? { email: sender.email, name: sender.full_name ?? undefined } : undefined,
      subject,
      htmlContent: brandedEmail(
        subject,
        `${body ? `<p>${body.replace(/\n/g, '<br/>')}</p>` : ''}${
          attachments.length ? `<p>Attached: <strong>${attachments.map((a) => a.name).join(', ')}</strong></p>` : ''
        }<p style="color:#9aa0b4;font-size:12px;margin-top:18px;">Sent by ${sender?.full_name ?? 'a DYCI office'} via DYCI DMS.</p>`,
      ),
      attachments,
    });

    for (const to of toEmails) {
      await supabaseAdmin.from('email_log').insert({
        org_id: orgId ?? null,
        sender_id: req.user!.id,
        to_email: to,
        subject,
        body: body ?? null,
        attachment_meta: attachments.map((a) => ({ name: a.name })),
        brevo_message_id: messageId,
      });

      // If the recipient is an app user, also drop an in-app notification.
      const { data: recipient } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('email', to)
        .maybeSingle();
      if (recipient && recipient.id !== req.user!.id) {
        await supabaseAdmin.from('notifications').insert({
          user_id: recipient.id,
          type: 'message',
          title: 'New message',
          body: `${sender?.full_name ?? 'Someone'}: ${subject}`,
          link: '/app/messages',
        });
      }
    }
    return res.json({ ok: true, messageId });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});
