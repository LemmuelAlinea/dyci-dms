# 2 · Brevo Setup (Email)

Brevo sends two kinds of email:
- **Auth emails** (confirm email, password reset) — through **SMTP**, configured inside Supabase.
- **App emails** (share a file, direct message, invitations) — through the **API**, used by the Railway backend.

---

## 2.1 Create an account & verify a sender

1. Go to **https://www.brevo.com** → sign up (free tier is fine to start).
2. **Senders, Domains & Dedicated IPs** → **Senders** → **Add a sender**.
   - Use an email you control, e.g. `no-reply@yourdomain.com` (or your Gmail to test).
   - Brevo emails you a verification link — click it.
3. (Recommended for production) **Domains** → add and authenticate your domain (SPF/DKIM) so emails don't land in spam.

---

## 2.2 Get the SMTP credentials (for Supabase)

1. Top-right menu → **SMTP & API** → **SMTP** tab.
2. Note these values:
   - **SMTP server:** `smtp-relay.brevo.com`
   - **Port:** `587`
   - **Login:** shown on the page (e.g. `8xxxxx@smtp-brevo.com`)
   - **Master password / SMTP key:** click **Generate a new SMTP key**, copy it.
3. Put these into Supabase → **Custom SMTP** (see [`SETUP_SUPABASE.md`](SETUP_SUPABASE.md) §1.4).

---

## 2.3 Get the API key (for Railway backend)

1. Same page → **API Keys** tab → **Generate a new API key**.
2. Name it `dyci-dms-backend`, copy the key (starts with `xkeysib-…`).
3. You'll paste this into Railway as `BREVO_API_KEY` (see [`SETUP_RAILWAY.md`](SETUP_RAILWAY.md)).

---

## 2.4 Local `.env` for the backend

In `backend/`, copy `.env.example` → `.env` and fill the Brevo values:
```
BREVO_API_KEY=xkeysib-your-key
BREVO_SENDER_EMAIL=no-reply@yourdomain.com
BREVO_SENDER_NAME=DYCI Document Management System
```

> The `BREVO_SENDER_EMAIL` **must** be a sender you verified in §2.1, or Brevo will reject the send.

➡️ Next: [`SETUP_GITHUB.md`](SETUP_GITHUB.md)
