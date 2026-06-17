# 🚀 Deployment Checklist

Follow the five guides in order, then verify. Tick each box.

## Order of operations
1. **Supabase** — [`SETUP_SUPABASE.md`](SETUP_SUPABASE.md)
   - [ ] Project created
   - [ ] `schema.sql` run successfully
   - [ ] `seed.sql` run (System Admin email registered)
   - [ ] `documents` + `avatars` buckets exist
   - [ ] Email confirmation ON, Google provider configured
   - [ ] Redirect URLs include localhost + Vercel domain
   - [ ] Copied Project URL, anon key, service-role key
2. **Brevo** — [`SETUP_BREVO.md`](SETUP_BREVO.md)
   - [ ] Sender verified
   - [ ] SMTP credentials added to Supabase Custom SMTP
   - [ ] API key created (for Railway)
3. **GitHub** — [`SETUP_GITHUB.md`](SETUP_GITHUB.md)
   - [ ] Repo pushed to `main`
4. **Vercel** — [`SETUP_VERCEL.md`](SETUP_VERCEL.md)
   - [ ] Root = `frontend`, env vars set
   - [ ] Deployed; domain added back to Supabase redirect URLs
5. **Railway** — [`SETUP_RAILWAY.md`](SETUP_RAILWAY.md)
   - [ ] Root = `backend`, env vars set
   - [ ] `/healthz` returns ok
   - [ ] `VITE_API_URL` in Vercel points to Railway; Vercel redeployed

---

## Environment variables at a glance

**Frontend (Vercel / `frontend/.env`)**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=
```

**Backend (Railway / `backend/.env`)**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=DYCI Document Management System
FRONTEND_ORIGIN=
APP_URL=
PORT=8787
```

---

## First-run smoke test

1. **System Admin**: register/sign in with the seeded email (`lemmuelalinea@gmail.com`) → confirm email → you land on the **Admin Console**.
2. Create an organization (e.g. `CCS`) → **Assign admin** (an email).
3. Sign in as that **Org Admin** → **Members → Invite member** (staff + approver).
4. As **Staff**: My Drive → **Upload** a PDF → open it → **Request approval** → pick the approver.
5. As **Approver**: **Approvals → To review** → comment → **Approve**.
6. As **Staff**: open the approved file → **Release paper** → it appears in **Released Papers** with owner + approver.
7. **Share** a file to an org member (Shared with me) and **Send to email** (check the Brevo inbox).
8. **Archive** a file → restore; **Move to Bin** → recover → delete forever.
9. **Settings**: toggle **dark mode**, change notification prefs, send yourself a **password reset** email.

---

## Local development (run everything on your machine)

```bash
# Terminal 1 — frontend
cd frontend && npm install && npm run dev      # http://localhost:5173

# Terminal 2 — backend
cd backend && npm install && npm run dev        # http://localhost:8787
```
Make sure both `.env` files are filled and Supabase's Site URL / Redirect URLs include `http://localhost:5173`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Google login loops back to /login | Add your exact domain to Supabase **Redirect URLs** and **Site URL**. |
| Confirmation email never arrives | Check Supabase **Custom SMTP** (Brevo) creds; verify the Brevo sender; check spam. |
| “Origin not allowed” from backend | Add your Vercel domain to Railway `FRONTEND_ORIGIN`. |
| Uploads fail / can't download | Confirm both storage buckets exist and `schema.sql` ran fully (storage policies). |
| Admin reports show “backend unreachable” | Start/redeploy the Railway backend and set `VITE_API_URL`. |
| Sharing to email fails | Set `BREVO_API_KEY` and a **verified** `BREVO_SENDER_EMAIL` on Railway; attachments must be ≤ ~18 MB. |
