-- 0013: feedback table + persistent narratives.
--
-- Two unrelated tables piggybacking on the same migration because both are
-- additive and run together in the same wave.

-- ─────────────────────────────────────────────────────────────────────────────
-- feedback  — in-app "Report bug / Suggest feature" button writes here.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete set null,
  user_email text,
  user_role text,
  kind text not null check (kind in ('bug', 'idea', 'praise', 'other')),
  message text not null,
  page text,             -- pathname where the user opened the modal
  user_agent text,
  metadata jsonb default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'triaged', 'in_progress', 'done', 'wontfix')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx  on public.feedback (status);
create index if not exists feedback_kind_idx    on public.feedback (kind);

alter table public.feedback enable row level security;

-- Anyone signed-in can INSERT (we want every user to be able to flag issues).
drop policy if exists feedback_insert_signed_in on public.feedback;
create policy feedback_insert_signed_in on public.feedback
  for insert to authenticated
  with check (auth.uid() is not null);

-- Only superadmin can read/update — bug triage is their job.
drop policy if exists feedback_read_superadmin on public.feedback;
create policy feedback_read_superadmin on public.feedback
  for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'superadmin'));

drop policy if exists feedback_update_superadmin on public.feedback;
create policy feedback_update_superadmin on public.feedback
  for update to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'superadmin'));


-- ─────────────────────────────────────────────────────────────────────────────
-- narratives  — persistent storage so generated narratives survive a refresh
-- AND so each new generation can evolve / merge with existing ones rather
-- than starting from scratch every time.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.narratives (
  id bigserial primary key,
  label text not null,                  -- short headline ("Cabinet under fiscal scrutiny")
  summary text not null,                -- 1-2 sentence current description
  sentiment_lean text not null check (sentiment_lean in ('hostile', 'mixed', 'supportive')),
  trajectory text not null check (trajectory in ('rising', 'steady', 'fading')),
  tier text not null default 'forming' check (tier in ('urgent', 'forming', 'established', 'decaying', 'dormant')),
  status text not null default 'active' check (status in ('active', 'archived')),
  recommended_response text,
  first_seen_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  last_event_at  timestamptz,           -- newest event in this narrative
  event_count int not null default 0,
  peak_snt numeric,                     -- highest SNT in the cluster
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb default '{}'::jsonb
);
create index if not exists narratives_tier_idx     on public.narratives (tier);
create index if not exists narratives_status_idx   on public.narratives (status);
create index if not exists narratives_updated_idx  on public.narratives (last_updated_at desc);

-- Many-to-many: which events anchor each narrative.
create table if not exists public.narrative_events (
  narrative_id bigint not null references public.narratives(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  weight numeric default 1.0,            -- how strongly this event represents the narrative
  added_at timestamptz not null default now(),
  primary key (narrative_id, event_id)
);
create index if not exists narrative_events_event_idx on public.narrative_events (event_id);

-- History — every time the AI re-clusters and updates a narrative, snapshot
-- the prior label/summary/tier/trajectory so we can show how it evolved.
create table if not exists public.narrative_revisions (
  id bigserial primary key,
  narrative_id bigint not null references public.narratives(id) on delete cascade,
  label text not null,
  summary text not null,
  tier text not null,
  trajectory text not null,
  sentiment_lean text not null,
  event_count_at_revision int,
  reason text,                           -- "auto-merge", "tier-bump-to-urgent", etc.
  revised_at timestamptz not null default now(),
  revised_by uuid references public.users(id) on delete set null
);
create index if not exists narrative_revisions_narrative_idx on public.narrative_revisions (narrative_id, revised_at desc);

alter table public.narratives enable row level security;
alter table public.narrative_events enable row level security;
alter table public.narrative_revisions enable row level security;

-- Firm-side + superadmin can read all narrative data. CMO/ministers can read
-- too (the narratives page is informative for them). Only firm+superadmin can
-- write (via the generation cron or the manual "regenerate" button).
do $$ begin
  -- read policies
  drop policy if exists narratives_read on public.narratives;
  create policy narratives_read on public.narratives
    for select to authenticated using (true);

  drop policy if exists narrative_events_read on public.narrative_events;
  create policy narrative_events_read on public.narrative_events
    for select to authenticated using (true);

  drop policy if exists narrative_revisions_read on public.narrative_revisions;
  create policy narrative_revisions_read on public.narrative_revisions
    for select to authenticated using (true);

  -- write policies (firm side only via service-role / admin client — app-layer)
  drop policy if exists narratives_write_firm on public.narratives;
  create policy narratives_write_firm on public.narratives
    for all to authenticated
    using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','superadmin')))
    with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','superadmin')));

  drop policy if exists narrative_events_write_firm on public.narrative_events;
  create policy narrative_events_write_firm on public.narrative_events
    for all to authenticated
    using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','superadmin')))
    with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','superadmin')));

  drop policy if exists narrative_revisions_write_firm on public.narrative_revisions;
  create policy narrative_revisions_write_firm on public.narrative_revisions
    for all to authenticated
    using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','superadmin')))
    with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','superadmin')));
end $$;
