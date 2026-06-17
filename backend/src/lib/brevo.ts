import { env } from './env.js';

export interface Attachment {
  name: string;
  content: string; // base64
}

export interface SendEmailInput {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  attachments?: Attachment[];
  replyTo?: { email: string; name?: string };
}

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/** Send a transactional email via the Brevo API. Returns the Brevo messageId. */
export async function sendEmail(input: SendEmailInput): Promise<string> {
  if (!env.brevoApiKey) throw new Error('BREVO_API_KEY is not configured');

  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': env.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: env.brevoSenderEmail, name: env.brevoSenderName },
      to: input.to,
      subject: input.subject,
      htmlContent: input.htmlContent,
      textContent: input.textContent,
      attachment: input.attachments?.length ? input.attachments : undefined,
      replyTo: input.replyTo,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Brevo send failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { messageId?: string };
  return json.messageId ?? '';
}

/** A small branded email wrapper in DYCI colors. */
export function brandedEmail(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string): string {
  const cta = ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:20px;padding:12px 26px;background:#1e2a78;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">${ctaLabel ?? 'Open'}</a>`
    : '';
  return `
  <div style="background:#f6f7fb;padding:32px 0;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(16,22,59,.12);">
      <div style="background:linear-gradient(135deg,#10163b,#1e2a78 60%,#2a3a9e);padding:24px 28px;">
        <div style="color:#eab02e;font-weight:800;font-size:18px;letter-spacing:.4px;">DYCI · Document Management System</div>
        <div style="color:#aab2e8;font-size:12px;margin-top:2px;">Dr. Yanga's Colleges, Inc. — Bocaue, Bulacan</div>
      </div>
      <div style="padding:28px;">
        <h1 style="margin:0 0 12px;color:#10163b;font-size:20px;">${title}</h1>
        <div style="color:#374151;font-size:14px;line-height:1.6;">${bodyHtml}</div>
        ${cta}
      </div>
      <div style="padding:16px 28px;background:#f6f7fb;color:#9aa0b4;font-size:11px;">
        This is an automated message from the DYCI DMS. If you didn't expect it, you can ignore it.
      </div>
    </div>
  </div>`;
}
