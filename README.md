# DYCI Document Management System (DMS)

A web-based **Document Management System** for the offices of **Dr. Yanga's Colleges, Inc. (DYCI)** — Bocaue, Bulacan. It works like a focused, office-oriented Google Drive with a document **approval + release** workflow on top.

> **For offices only** (no students). Examples of offices/organizations: *Office of Student Affairs (SOA)*, *College of Computer Studies (CCS)*, *College of Business (CBEA)*.

---

## ✨ Features

- **Two-sided system**
  - **System Admin** — creates organizations (offices), assigns one Organization Admin each, and monitors the whole platform (orgs, users, storage, activity). Has no drive of their own.
  - **Organizations** — isolated office workspaces with 4 roles: `admin`, `co_admin`, `staff`, `approver`.
- **Personal drive** per member: My Drive, Shared with me, Released Papers, Approvals, Archive, Bin, Messages, Settings.
- **Folders & files** — nested folders, modern breadcrumbs, drag-drop upload (PDF / Word `.docx` / Excel `.xlsx` / Google-exported files), grid & list views, detail pages.
- **Versioning** — every re-upload creates a new version; full history with restore.
- **Approvals** — request approval from any org member; assigned approver reviews in a viewer with **threaded comments**; approve / reject → **release**.
- **Released Papers** — org-wide feed of released documents with owner + approver names, version badges, and search.
- **Hybrid sharing** — share to org members (access grants) or send to any email address (real attachment via Brevo).
- **Archive & Bin** — archive ⇄ restore, or move to Bin (recover / permanent delete). Released papers are archive-only.
- **Settings** — profile, avatar, light/dark mode, notification preferences, password reset (email confirmation).
- **Security** — Supabase Row Level Security, org isolation, signed download URLs, server-only secrets.
- **Design** — DYCI brand colors (navy + gold), fully responsive (desktop / tablet / phone), collapsible sidebar, smooth animations.

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + Framer Motion (→ **Vercel**) |
| Auth / DB / Storage | **Supabase** (Postgres + RLS + Auth + Storage) |
| Backend API | Node.js + Express + TypeScript (→ **Railway**) |
| Email | **Brevo** (SMTP for auth emails, API for app emails) |
| Versioning / CI | **GitHub** → Vercel + Railway auto-deploy |

---

## 📁 Repository Structure

```
DYCI_DMS/
├─ frontend/        # React + Vite app  (deploy to Vercel)
├─ backend/         # Express API        (deploy to Railway)
├─ supabase/        # schema.sql + seed.sql  (paste into Supabase SQL editor)
├─ docs/            # step-by-step setup guides
└─ README.md
```

---

## 🚀 Quick Start (local)

```bash
# 1. Frontend
cd frontend
npm install
cp .env.example .env        # fill in Supabase + API values
npm run dev                 # http://localhost:5173

# 2. Backend (separate terminal)
cd backend
npm install
cp .env.example .env        # fill in Supabase service-role + Brevo values
npm run dev                 # http://localhost:8787
```

Then open `supabase/schema.sql` and `supabase/seed.sql` and paste them into your Supabase SQL editor.

---

## 📚 Setup & Deployment Guides

Follow these in order:

1. [`docs/SETUP_SUPABASE.md`](docs/SETUP_SUPABASE.md) — database, auth, storage
2. [`docs/SETUP_BREVO.md`](docs/SETUP_BREVO.md) — email (SMTP + API)
3. [`docs/SETUP_GITHUB.md`](docs/SETUP_GITHUB.md) — push the repo
4. [`docs/SETUP_VERCEL.md`](docs/SETUP_VERCEL.md) — deploy the frontend
5. [`docs/SETUP_RAILWAY.md`](docs/SETUP_RAILWAY.md) — deploy the backend

A consolidated checklist lives in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## 🔐 The first login

The System Admin account is seeded for **lemmuelalinea@gmail.com**. Register (or sign in with Google) using that email, confirm it, and you'll land on the System Admin dashboard where you can create organizations and assign their admins.

---

© Dr. Yanga's Colleges, Inc. — Bocaue, Bulacan. Internal use.
