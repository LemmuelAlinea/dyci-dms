-- approval_comments now belong to EITHER a legacy approval (approval_id) OR a
-- multi-step request (request_id). Drop the NOT NULL on approval_id so request
-- comments (which only set request_id) can be inserted.
-- Paste into Supabase SQL Editor and run. Safe to re-run.

alter table public.approval_comments alter column approval_id drop not null;
