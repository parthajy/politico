-- 0012: per-minister scoping for party_viewer accounts.
--
-- A party_viewer with scope_mla_id = NULL is the CMO/CM (sees the whole state).
-- A party_viewer with scope_mla_id pointing at an mlas row is a cabinet minister
-- and is restricted in-app to ONLY their own constituency, threats, decisions, etc.
--
-- Enforcement is done at the application layer (lib/auth.getScope() returns the
-- bounding box and every party/* page checks it). We do NOT add RLS predicates
-- here because (a) the queries are already keyed off scope_mla_id in the app,
-- (b) party_viewer RLS today is permissive read-everything, and (c) the
-- migration risk of changing RLS mid-demo is real.

alter table public.users
  add column if not exists scope_mla_id int references public.mlas(id) on delete set null;

create index if not exists users_scope_mla_id_idx on public.users(scope_mla_id);

comment on column public.users.scope_mla_id is
  'For party_viewer accounts: when non-null, the user is a cabinet minister scoped to this MLA. App-layer enforcement only.';
