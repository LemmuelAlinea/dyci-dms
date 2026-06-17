# Branded Supabase Auth Email Templates

DYCI-branded HTML for the Supabase authentication emails (navy + gold, matching the app), with a support contact in the footer.

## How to apply

1. Go to **Supabase Dashboard → Authentication → Emails → Templates**.
2. Pick a template tab and paste the matching file's contents into the **Message body (HTML)** field:
   | Supabase template | File |
   |---|---|
   | **Confirm signup** | [`confirm-signup.html`](confirm-signup.html) |
   | **Reset password** (Recovery) | [`reset-password.html`](reset-password.html) |
3. Suggested **Subject** lines:
   - Confirm signup → `Confirm your email · DYCI DMS`
   - Reset password → `Reset your password · DYCI DMS`
4. Click **Save**. Send a test (register / request a reset) to confirm it renders.

## Notes
- The `{{ .ConfirmationURL }}` placeholder is Supabase's — keep it exactly as-is.
- Support contact in the footer: **lemmuelalinea@gmail.com**.
- These emails are delivered through your Brevo SMTP (configured under Authentication → SMTP Settings).
- You can reuse the same look for the other templates (Invite, Magic Link, Change Email) by copying one of these and changing the heading/body text.
