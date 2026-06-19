# OnlyOffice Docs — Setup Runbook

DYCI DMS edits Word/Excel/PowerPoint files in the browser using a self-hosted
**OnlyOffice Docs Community** server (free). It runs as its own Docker container,
**separate** from the frontend (Vercel) and backend (Railway). This guide is the
human/infrastructure part of Plan 3 — do these steps once, then the app's editor
will work.

> **Cost:** $0 on Oracle Cloud's Always-Free tier. The only optional cost is a
> domain name (~$10/yr) for HTTPS — or use a free subdomain (see Step 4).

---

## Overview of what you're building

```
  Browser ──loads editor script──> OnlyOffice server (this guide)
     │                                   │
     │                                   └──fetches the file──> Supabase (signed URL)
     │
     └── on save, OnlyOffice ──POST edited file──> your Backend ──> Supabase (new version)
```

You need the OnlyOffice server reachable over **HTTPS** from the browser, able to
reach Supabase (outbound), and your backend able to reach it (for the save callback).

---

## Step 1 — Create a host (Oracle Cloud Always-Free)

1. Sign up at https://www.oracle.com/cloud/free/ (requires a card for identity; the
   Always-Free resources are not charged).
2. Create a **Compute Instance**:
   - **Shape:** `VM.Standard.A1.Flex` (ARM Ampere) — set **4 OCPU / 24 GB RAM**
     (all within Always-Free). OnlyOffice needs ~2 GB minimum; give it headroom.
   - **Image:** Canonical Ubuntu 22.04.
   - **Networking:** assign a public IPv4. Save the **SSH private key** it offers.
3. **Open the firewall — two layers (both required on Oracle):**
   - **VCN Security List / NSG (cloud firewall):** add **Ingress** rules allowing
     TCP `80` and `443` from `0.0.0.0/0`.
   - **OS firewall (Oracle Ubuntu ships with restrictive iptables):** SSH in and run:
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```

> Alternative hosts: any VPS with ≥2 GB RAM (DigitalOcean, Hetzner, etc.), or
> **Railway** (paid; deploy the `onlyoffice/documentserver` Docker image, set the
> env vars from Step 3, and it gives you an HTTPS URL automatically — if you use
> Railway you can skip Steps 1, 2, and 4).

---

## Step 2 — Install Docker

SSH into the VM, then:

```bash
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl enable --now docker
```

---

## Step 3 — Pick a JWT secret and run OnlyOffice

The JWT secret is a password **you invent** that the OnlyOffice server and your
backend share so they trust each other. Generate one and keep it:

```bash
openssl rand -hex 32
# example output: 9f1c...e7  (copy YOUR value)
```

Run the container (replace `PASTE_YOUR_SECRET`):

```bash
sudo docker run -i -t -d -p 8080:80 \
  -e JWT_ENABLED=true \
  -e JWT_SECRET=PASTE_YOUR_SECRET \
  --restart=always \
  --name onlyoffice onlyoffice/documentserver
```

Wait ~1–2 minutes for first boot, then check locally on the VM:

```bash
curl -s http://localhost:8080/healthcheck
# expect: true
```

---

## Step 4 — Put it behind HTTPS (required)

Browsers block an HTTP editor loaded into your HTTPS site, so OnlyOffice **must**
be served over HTTPS.

1. **Get a hostname** pointing at the VM's public IP. Either:
   - a subdomain you own (e.g. `office.yourdomain.com` → an `A` record to the IP), or
   - a free wildcard-DNS hostname like `nip.io` for testing: `office.<PUBLIC_IP>.nip.io`
     (no DNS setup needed; resolves to the IP automatically).
2. **Install Caddy** (auto-HTTPS via Let's Encrypt):
   ```bash
   sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt-get update && sudo apt-get install -y caddy
   ```
3. **Configure the reverse proxy.** Edit `/etc/caddy/Caddyfile` so it contains only:
   ```
   office.yourdomain.com {
       reverse_proxy localhost:8080
   }
   ```
   (Use your real hostname / the nip.io one.) Then:
   ```bash
   sudo systemctl restart caddy
   ```
4. **Verify** from your laptop:
   ```
   https://office.yourdomain.com/healthcheck   → true
   https://office.yourdomain.com/welcome       → OnlyOffice welcome page
   ```

---

## Step 5 — Wire environment variables

**Backend (Railway → your service → Variables):**

| Variable | Value |
|---|---|
| `ONLYOFFICE_URL` | `https://office.yourdomain.com` |
| `ONLYOFFICE_JWT_SECRET` | the secret from Step 3 (exact same value) |
| `BACKEND_PUBLIC_URL` | your backend's public URL, e.g. `https://dyci-dms-backend.up.railway.app` |

**Frontend (Vercel):** no OnlyOffice-specific environment variable is needed — the
editor script URL is supplied by the backend's `/onlyoffice/config` response (driven
by the backend's `ONLYOFFICE_URL`).

Redeploy the backend after setting its variables.

For **local development**, add the three backend variables to `backend/.env`. The
OnlyOffice server must still be able to reach your Supabase signed URLs, and must be
reachable from your browser.

---

## Step 6 — Connectivity checklist

- [ ] `https://<onlyoffice>/healthcheck` returns `true` from your browser.
- [ ] The OnlyOffice VM has outbound HTTPS (can reach your Supabase project URL). Test on the VM:
      `curl -sI https://<your-project>.supabase.co | head -1` → `HTTP/2 200` (or 404, anything but a timeout).
- [ ] Your backend can reach the OnlyOffice host (same network/public internet — usually fine).
- [ ] `ONLYOFFICE_JWT_SECRET` is **identical** on the container and the backend (a mismatch = editor shows "Download failed" / token errors).

---

## Step 7 — Smoke test (after the app code is deployed)

1. Upload a `.docx` (status: draft) in DYCI DMS.
2. Open its detail page → the preview card shows the editor with a Word-style toolbar.
3. Click **Edit** → full-screen editor → type something → **Close**.
4. Within a few seconds, a **new version** appears in Version history, attributed to you,
   note "Edited in browser (OnlyOffice)".

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Editor area blank / script fails to load | Backend `ONLYOFFICE_URL` wrong/unset, or HTTPS not working on the OnlyOffice host. Re-check Steps 4–5. |
| "Download failed" inside the editor | OnlyOffice can't fetch the Supabase signed URL (VM has no outbound HTTPS), or signed-URL TTL too short. Check Step 6. |
| Token / JWT errors | `ONLYOFFICE_JWT_SECRET` mismatch between container and backend. Must be identical. |
| Edits never become a new version | Backend `/onlyoffice/callback` not reachable from the OnlyOffice host, or `BACKEND_PUBLIC_URL` wrong. Check backend logs. |
| Editor loads but read-only when you expect edit | File isn't `draft`/`rejected`, or you're not the owner / don't have an `edit` share. By design. |

---

## What the app code does (no action needed — implemented in Plan 3)

- `POST /onlyoffice/config` verifies your permission and returns a JWT-signed editor config.
- `POST /onlyoffice/callback` receives the saved file from OnlyOffice and writes it as a new
  version using the Supabase service role (so your owner-only storage rules stay unchanged).
- The frontend `OnlyOfficeEditor` component embeds the editor in the file detail page.
