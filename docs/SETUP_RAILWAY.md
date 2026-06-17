# 5 · Railway Setup (Backend Deployment)

Railway hosts the Express backend (the `backend/` folder). It holds the secret keys (Supabase service-role + Brevo API) and handles email/attachments, invitations, and admin reports.

---

## 5.1 Create the service

1. Go to **https://railway.app** → sign in with GitHub → **New Project** → **Deploy from GitHub repo**.
2. Pick your `dyci-dms` repository.
3. Railway creates a service. Open it → **Settings**.

---

## 5.2 Point Railway at the `backend` folder

In the service **Settings**:

| Setting | Value |
|---|---|
| **Root Directory** | `backend` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start` |

> A `railway.json` is included in `backend/` with these defaults, but set the **Root Directory** to `backend` in the UI to be safe.

---

## 5.3 Environment Variables

Service → **Variables** → add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | your Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase **service_role** secret key |
| `BREVO_API_KEY` | your Brevo API key (`xkeysib-…`) |
| `BREVO_SENDER_EMAIL` | your verified Brevo sender email |
| `BREVO_SENDER_NAME` | `DYCI Document Management System` |
| `FRONTEND_ORIGIN` | your Vercel URL, e.g. `https://dyci-dms.vercel.app` (comma-separate to allow several, e.g. add `,http://localhost:5173`) |
| `APP_URL` | your Vercel URL (used in email links) |
| `PORT` | `8787` (Railway also injects its own `PORT`; the app respects it) |

---

## 5.4 Generate a public URL

1. Service → **Settings → Networking** → **Generate Domain**.
2. Copy the URL, e.g. `https://dyci-dms-backend.up.railway.app`.
3. Test it: open `https://YOUR-RAILWAY-URL/healthz` — you should see `{"ok":true,...}`.

---

## 5.5 Connect the frontend to the backend

1. In **Vercel → Settings → Environment Variables**, set `VITE_API_URL` to your Railway URL (no trailing slash).
2. **Redeploy** the Vercel project.
3. In Railway, make sure `FRONTEND_ORIGIN` includes your exact Vercel domain (this is the CORS allow-list).

---

## 5.6 Local backend

To run the backend locally instead:
```bash
cd backend
npm install
cp .env.example .env   # fill in the same variables
npm run dev            # http://localhost:8787
```
Keep `FRONTEND_ORIGIN=http://localhost:5173` for local dev.

➡️ Final checklist: [`DEPLOYMENT.md`](DEPLOYMENT.md)
