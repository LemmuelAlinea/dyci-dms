import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { brandedEmail, sendEmail } from '../lib/brevo.js';
import { env } from '../lib/env.js';
import { requireAuth, roleInOrg, type AuthedRequest } from '../middleware/auth.js';

export const invitationsRouter = Router();

const schema = z.object({
  orgId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['co_admin', 'staff', 'approver']).default('staff'),
});

invitationsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { orgId, email, role } = parsed.data;

  // Only org admin or co-admin can invite.
  const callerRole = await roleInOrg(req.user!.id, orgId);
  if (callerRole !== 'admin' && callerRole !== 'co_admin') {
    return res.status(403).json({ error: 'Only the organization admin or co-admin can invite members.' });
  }
  // Co-admins cannot create another co-admin.
  if (callerRole === 'co_admin' && role === 'co_admin') {
    return res.status(403).json({ error: 'Co-admins cannot assign the co-admin role.' });
  }

  const { data: org } = await supabaseAdmin.from('organizations').select('name, code').eq('id', orgId).single();

  const { data: invite, error } = await supabaseAdmin
    .from('invitations')
    .insert({ org_id: orgId, email: email.toLowerCase(), role, invited_by: req.user!.id })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // If the invitee already has an account, add them to the org immediately.
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  let addedNow = false;
  if (existing) {
    await supabaseAdmin
      .from('organization_members')
      .upsert(
        { org_id: orgId, user_id: existing.id, role, status: 'active', invited_by: req.user!.id },
        { onConflict: 'org_id,user_id' },
      );
    await supabaseAdmin.from('invitations').update({ status: 'accepted' }).eq('id', invite.id);
    addedNow = true;
  }

  const link = `${env.appUrl}/register?invite=${invite.token}&email=${encodeURIComponent(email)}`;
  try {
    const messageId = await sendEmail({
      to: [{ email }],
      subject: addedNow
        ? `You've been added to ${org?.name ?? 'an organization'} on DYCI DMS`
        : `You're invited to ${org?.name ?? 'an organization'} on DYCI DMS`,
      htmlContent: brandedEmail(
        `${addedNow ? 'Added to' : 'Invitation to'} ${org?.name ?? 'an organization'} (${org?.code ?? ''})`,
        addedNow
          ? `You have been added to the <strong>${org?.name ?? ''}</strong> office on the DYCI Document Management System as <strong>${role.replace('_', '-')}</strong>. Sign in to get started.`
          : `You have been invited to join the <strong>${org?.name ?? ''}</strong> office on the DYCI Document Management System as <strong>${role.replace('_', '-')}</strong>.<br/><br/>Click the button below to create your account with this email to accept.`,
        addedNow ? `${env.appUrl}/login` : link,
        addedNow ? 'Sign in' : 'Accept invitation',
      ),
    });
    return res.json({ invitation: invite, addedNow, emailMessageId: messageId });
  } catch (e) {
    // Invitation is still created even if the email fails; surface a soft error.
    return res.json({ invitation: invite, emailError: (e as Error).message });
  }
});
