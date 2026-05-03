-- Star-and-read: CMO can star events. The firm sees what the boss reads.
-- Doctrine 6 in action — the leader's attention IS the strategic signal.

create table event_stars (
  user_id uuid not null references users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index event_stars_event_idx on event_stars (event_id);
create index event_stars_created_idx on event_stars (created_at desc);

alter table event_stars enable row level security;

-- Each user manages their own stars
create policy event_stars_self_all on event_stars
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Firm can read all stars (so the firm sees what the CMO is reading)
create policy event_stars_firm_read on event_stars
  for select to authenticated
  using (public.is_firm());
