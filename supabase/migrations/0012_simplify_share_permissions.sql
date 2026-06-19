-- 0012_simplify_share_permissions.sql
-- Three-tier sharing: permission alone encodes view/download/edit.
-- Drops the now-redundant per-share boolean flags. Safe to re-run.
alter table public.shares drop column if exists can_download;
alter table public.shares drop column if exists can_reshare;
-- permission CHECK ('view','download','edit') already exists from 0011.
