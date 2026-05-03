-- Signal Desk — initial schema
-- All tables RLS-enabled. Defence in depth.

create extension if not exists "pgcrypto";

-- Enums ---------------------------------------------------------------
create type user_role as enum ('firm_admin', 'firm_analyst', 'party_viewer');
create type event_source as enum ('reddit', 'youtube', 'gdelt', 'google_news', 'rss', 'manual');
create type triage_status as enum ('new', 'monitoring', 'escalated', 'closed');
create type story_status as enum ('idea', 'in_production', 'published');
create type alert_severity as enum ('s1', 's2', 's3');
create type snapshot_scope as enum ('state', 'district', 'constituency', 'minister');

-- Reference tables ----------------------------------------------------
create table districts (
  id serial primary key,
  name text not null unique,
  hq text,
  population_est int,
  tier int check (tier in (1, 2, 3)),
  dominant_communities text[]
);

create table constituencies (
  id serial primary key,
  number int unique check (number between 1 and 60),
  name text not null,
  district_id int references districts(id) on delete restrict,
  current_mla_id int,
  last_election_margin_pct numeric
);

create table mlas (
  id serial primary key,
  name text not null,
  party text,
  constituency_id int references constituencies(id) on delete set null,
  is_minister bool default false,
  portfolio text,
  is_cm bool default false,
  is_deputy_cm bool default false
);

alter table constituencies
  add constraint constituencies_mla_fk
  foreign key (current_mla_id) references mlas(id) on delete set null;

-- Users ---------------------------------------------------------------
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role user_role not null default 'firm_analyst',
  created_at timestamptz default now()
);

-- Events + classifications -------------------------------------------
create table events (
  id uuid primary key default gen_random_uuid(),
  source event_source not null,
  source_id text not null,
  url text,
  title text,
  body text,
  published_at timestamptz,
  ingested_at timestamptz default now(),
  raw_payload jsonb,
  unique (source, source_id)
);
create index events_published_at_idx on events (published_at desc);
create index events_source_idx on events (source);

create table classifications (
  event_id uuid primary key references events(id) on delete cascade,
  language text,
  entities jsonb,
  sentiment numeric check (sentiment between -1 and 1),
  sentiment_justification text,
  district_id int references districts(id) on delete set null,
  constituency_id int references constituencies(id) on delete set null,
  mla_id int references mlas(id) on delete set null,
  topic_tags text[],
  snt_velocity numeric check (snt_velocity between 0 and 1),
  snt_credibility numeric check (snt_credibility between 0 and 1),
  snt_vector numeric check (snt_vector between 0 and 1),
  snt_score numeric check (snt_score between 0 and 1),
  classified_at timestamptz default now(),
  model_version text
);
create index classifications_district_idx on classifications (district_id);
create index classifications_constituency_idx on classifications (constituency_id);
create index classifications_snt_idx on classifications (snt_score desc);
create index classifications_classified_at_idx on classifications (classified_at desc);

-- Triage --------------------------------------------------------------
create table triage (
  event_id uuid primary key references events(id) on delete cascade,
  status triage_status not null default 'new',
  assigned_to uuid references users(id) on delete set null,
  notes text,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz default now()
);
create index triage_status_idx on triage (status);

-- Voices --------------------------------------------------------------
create table voices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  district_id int references districts(id) on delete set null,
  constituency_id int references constituencies(id) on delete set null,
  active bool default true,
  joined_at date,
  last_engagement_at date,
  notes text,
  ever_paid bool not null default false,
  ever_scripted bool not null default false
);
create index voices_district_idx on voices (district_id);

-- Stories -------------------------------------------------------------
create table stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  district_id int references districts(id) on delete set null,
  constituency_id int references constituencies(id) on delete set null,
  status story_status not null default 'idea',
  outlet text,
  url text,
  reach_estimate int,
  voice_id uuid references voices(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz default now()
);
create index stories_status_idx on stories (status);

-- Briefs --------------------------------------------------------------
create table briefs (
  id uuid primary key default gen_random_uuid(),
  brief_date date not null unique,
  body_md text,
  generated_at timestamptz default now(),
  generated_by_model text,
  approved_by uuid references users(id) on delete set null,
  published_at timestamptz
);
create index briefs_published_idx on briefs (published_at desc);

-- Alerts --------------------------------------------------------------
create table alerts (
  id uuid primary key default gen_random_uuid(),
  severity alert_severity not null,
  title text not null,
  body text,
  event_id uuid references events(id) on delete set null,
  created_at timestamptz default now(),
  resolved_at timestamptz
);
create index alerts_severity_idx on alerts (severity);
create index alerts_created_idx on alerts (created_at desc);

-- Audit log -----------------------------------------------------------
create table audit_log (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz default now()
);
create index audit_user_idx on audit_log (user_id);
create index audit_created_idx on audit_log (created_at desc);

-- Sentiment snapshots -------------------------------------------------
create table sentiment_snapshots (
  id bigserial primary key,
  date date not null,
  scope_type snapshot_scope not null,
  scope_id int,
  net_sentiment numeric,
  sample_size int
);
create index sentiment_scope_idx on sentiment_snapshots (scope_type, scope_id, date desc);

-- Auto-create user profile on signup ---------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'firm_analyst')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
