# 1 · Supabase Setup (Database, Auth, Storage)

Supabase is your database, authentication, and file storage. Do this **first** — everything else needs the keys you get here.

---

## 1.1 Create the project

1. Go to **https://supabase.com** → sign in → **New project**.
2. Name it `dyci-dms`, pick a strong **database password** (save it), choose the region closest to the Philippines (e.g. **Southeast Asia (Singapore)**).
3. Wait ~2 minutes for it to provision.

---

## 1.2 Run the database schema

1. In the left sidebar open **SQL Editor** → **New query**.
2. Open the file [`supabase/schema.sql`](../supabase/schema.sql) from this repo, copy **everything**, paste it into the editor, and click **Run**.
   - This creates all tables, enums, row-level-security policies, triggers, and the two storage buckets.
   - It is safe to re-run.
3. Create another **New query**, copy **everything** from [`supabase/seed.sql`](../supabase/seed.sql), and **Run** it.
   - This registers the System Admin email (`lemmuelalinea@gmail.com`). To use a different email, edit the file before running.

> ✅ You should see “Success. No rows returned.”

---

## 1.3 Confirm the Storage buckets

1. Left sidebar → **Storage**. You should see two buckets created by the schema:
   - **documents** (private)
   - **avatars** (public)
2. If they are missing, create them manually:
   - **New bucket** → name `documents` → **Public: OFF** → Save.
   - **New bucket** → name `avatars` → **Public: ON** → Save.

---

## 1.4 Configure Authentication

### Email confirmation
1. Left sidebar → **Authentication** → **Providers** → **Email**.
2. Make sure **Enable Email provider** is ON and **Confirm email** is ON.
3. Save.

### Google sign-in
1. **Authentication** → **Providers** → **Google** → toggle **Enable**.
2. You need a Google OAuth Client:
   - Go to **https://console.cloud.google.com** → create/select a project.
   - **APIs & Services** → **OAuth consent screen** → External → fill app name + support email → Save.
   - **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.
   - Under **Authorized redirect URIs** add:
     `https://YOUR-PROJECT-ref.supabase.co/auth/v1/callback`
     (copy this exact URL from the Supabase Google provider page — it's shown there.)
   - Create → copy the **Client ID** and **Client secret**.
3. Paste the **Client ID** and **Client secret** into Supabase's Google provider fields → **Save**.

### Redirect URLs (very important)
1. **Authentication** → **URL Configuration**.
2. Set **Site URL** to your frontend URL:
   - Local dev: `http://localhost:5173`
   - Production: your Vercel URL (e.g. `https://dyci-dms.vercel.app`)
3. Under **Redirect URLs**, add **both** (one per line):
   ```
   http://localhost:5173/**
   https://YOUR-VERCEL-DOMAIN.vercel.app/**
   ```
   (Add your real Vercel domain after you deploy in step 4.)

### Custom SMTP (so auth emails come from Brevo)
> Do this **after** you finish [`SETUP_BREVO.md`](SETUP_BREVO.md) — you'll need the Brevo SMTP credentials.
1. **Authentication** → **Emails** (or **Settings** → **Auth** → **SMTP Settings**).
2. Enable **Custom SMTP** and fill in:
   - **Host:** `smtp-relay.brevo.com`
   - **Port:** `587`
   - **Username:** your Brevo SMTP login (looks like `xxxxxx@smtp-brevo.com`)
   - **Password:** your Brevo SMTP key
   - **Sender email:** your verified Brevo sender (e.g. `no-reply@yourdomain.com`)
   - **Sender name:** `DYCI Document Management System`
3. Save. Confirmation + password-reset emails now send through Brevo.

---

## 1.5 Copy your keys

**Project Settings** (gear icon) → **API**:

| Key | Where it's used |
|---|---|
| **Project URL** | `VITE_SUPABASE_URL` (frontend) and `SUPABASE_URL` (backend) |
| **anon public** key | `VITE_SUPABASE_ANON_KEY` (frontend) |
| **service_role** secret key | `SUPABASE_SERVICE_ROLE_KEY` (backend only — **never** put in the frontend) |

Keep the service_role key secret. It bypasses all security rules and is only used server-side on Railway.

---

## 1.6 Local `.env` for the frontend

In `frontend/`, copy `.env.example` → `.env` and fill:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:8787
```

➡️ Next: [`SETUP_BREVO.md`](SETUP_BREVO.md)
