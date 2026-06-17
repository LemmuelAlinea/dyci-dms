-- ============================================================================
-- DYCI DMS — SEED
-- Run this AFTER schema.sql.
-- Registers the System Admin email. When that email signs up (or signs in with
-- Google) it is automatically promoted to System Admin by the handle_new_user
-- trigger. If the account already exists, the UPDATE below promotes it too.
-- ============================================================================

-- 1) Allowlist the System Admin email (change if needed).
insert into public.system_admin_allowlist (email)
values ('lemmuelalinea@gmail.com')
on conflict (email) do nothing;

-- 2) If that user already registered before seeding, promote them now.
update public.profiles
set is_system_admin = true
where lower(email) = lower('lemmuelalinea@gmail.com');

-- ─── Optional: add more System Admins later ─────────────────────────────────
-- insert into public.system_admin_allowlist (email) values ('another.admin@dyci.edu.ph')
--   on conflict (email) do nothing;
