# 4 · Vercel Setup (Frontend Deployment)

Vercel hosts the React frontend (the `frontend/` folder).

---

## 4.1 Import the project

1. Go to **https://vercel.com** → sign in with GitHub → **Add New… → Project**.
2. **Import** your `dyci-dms` repository.

---

## 4.2 Configure the build

On the configure screen:

| Setting | Value |
|---|---|
| **Root Directory** | `frontend`  ← click **Edit** and select the `frontend` folder |
| **Framework Preset** | Vite (auto-detected) |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `dist` (default) |
| **Install Command** | `npm install` (default) |

---

## 4.3 Environment Variables

Add these under **Environment Variables** (apply to Production, Preview, Development):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | your Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon public key |
| `VITE_API_URL` | your Railway backend URL (set this after [`SETUP_RAILWAY.md`](SETUP_RAILWAY.md); use `http://localhost:8787` as a placeholder for now) |

---

## 4.4 Deploy

1. Click **Deploy**. Wait for the build to finish.
2. You'll get a URL like `https://dyci-dms.vercel.app`.

---

## 4.5 Wire the domain back into Supabase

1. Copy your Vercel domain.
2. In **Supabase → Authentication → URL Configuration**:
   - Set **Site URL** to your Vercel domain.
   - Add `https://YOUR-DOMAIN.vercel.app/**` to **Redirect URLs**.
3. This makes Google sign-in and email confirmation redirect correctly in production.

> The included `vercel.json` already handles SPA routing (so deep links like `/app/drive` work on refresh).

---

## 4.6 Redeploy after setting the backend URL

Once Railway is live (next guide), update `VITE_API_URL` in Vercel → **Settings → Environment Variables** to the Railway URL, then **Redeploy** (Deployments → ⋯ → Redeploy).

➡️ Next: [`SETUP_RAILWAY.md`](SETUP_RAILWAY.md)
