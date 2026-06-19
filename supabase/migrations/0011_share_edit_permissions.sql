-- 0011_share_edit_permissions.sql
-- Adds an 'edit' access level plus per-share download/reshare flags to shares.
-- Safe to re-run.

alter table public.shares
  add column if not exists can_download boolean not null default true,
  add column if not exists can_reshare  boolean not null default false;

-- Widen the permission CHECK to include 'edit'.
-- (The inline CHECK from schema.sql is auto-named shares_permission_check.)
alter table public.shares drop constraint if exists shares_permission_check;
alter table public.shares
  add constraint shares_permission_check check (permission in ('view','edit','download'));

-- Normalize any legacy 'download' rows to access level 'view' + can_download=true.
update public.shares
  set can_download = true, permission = 'view'
  where permission = 'download';
