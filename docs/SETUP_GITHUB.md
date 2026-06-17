# 3 · GitHub Setup (Version Control)

Push this project to GitHub so Vercel and Railway can auto-deploy from it. This is a **monorepo**: `frontend/` deploys to Vercel and `backend/` deploys to Railway.

---

## 3.1 Install Git (if needed)

- Windows: install **Git for Windows** from https://git-scm.com/download/win.
- Verify in a terminal: `git --version`.

---

## 3.2 Initialize and commit

Open a terminal in the project root (`DYCI_DMS/`) and run:

```bash
git init
git add .
git commit -m "Initial commit: DYCI Document Management System"
```

> The included `.gitignore` already excludes `node_modules/`, `.env`, and build output, so your secrets won't be committed.

---

## 3.3 Create the GitHub repository

**Option A — GitHub website**
1. Go to https://github.com/new.
2. Repository name: `dyci-dms`. Visibility: **Private** (recommended).
3. **Do NOT** initialize with a README/.gitignore (you already have them).
4. **Create repository**, then run the commands GitHub shows under “…or push an existing repository”:
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/dyci-dms.git
   git branch -M main
   git push -u origin main
   ```

**Option B — GitHub CLI**
```bash
gh auth login
gh repo create dyci-dms --private --source=. --remote=origin --push
```

---

## 3.4 Future updates

Whenever you change code:
```bash
git add .
git commit -m "Describe your change"
git push
```
Vercel and Railway redeploy automatically on every push to `main`.

➡️ Next: [`SETUP_VERCEL.md`](SETUP_VERCEL.md)
