-- 0014: watch lists (pin entities) + daily-digest preferences.

-- ─────────────────────────────────────────────────────────────────────────────
-- watch_items — what each user is following.
-- Kind = minister / constituency / district / topic / narrative.
-- ref_id = the foreign key as text (so we can support topic strings + numeric ids
-- in the same column without per-kind tables).
-- label = denormalised display name so the watchlist page doesn't need to join
-- back to mlas/constituencies/etc on every render.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.watch_items (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('minister', 'constituency', 'district', 'topic', 'narrative')),
  ref_id text not null,
  label text not null,
  notify_threshold numeric default 0.6 check (notify_threshold between 0 and 1),
  last_notified_event_id uuid,
  last_notified_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (user_id, kind, ref_id)
);
create index if not exists watch_items_user_idx on public.watch_items (user_id);

alter table public.watch_items enable row level security;

drop policy if exists watch_items_own_read on public.watch_items;
create policy watch_items_own_read on public.watch_items
  for select to authenticated using (user_id = auth.uid());

drop policy if exists watch_items_own_write on public.watch_items;
create policy watch_items_own_write on public.watch_items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- Daily digest preferences — bolt onto the existing users table.
-- daily_digest_enabled defaults true so every team member opts in by default;
-- they can disable per-user from /firm/watch or /party/watch.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists daily_digest_enabled boolean default true;
alter table public.users
  add column if not exists daily_digest_last_sent_at timestamptz;

-- Sent-digest log so the cron is idempotent (re-running on the same day is a no-op)
create table if not exists public.digest_sends (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  for_date date not null,
  sent_at timestamptz not null default now(),
  resend_message_id text,
  item_count int default 0,
  unique (user_id, for_date)
);
create index if not exists digest_sends_date_idx on public.digest_sends (for_date desc);
