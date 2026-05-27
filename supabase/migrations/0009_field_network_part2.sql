-- Field network — part 2: profile fields, sessions, submissions queue, RLS.

-- Profile fields populated mostly for volunteers/interns
alter table users
  add column if not exists photo_url text,
  add column if not exists phone text,
  add column if not exists district_id int references districts(id) on delete set null,
  add column if not exists languages text[] default '{}',
  add column if not exists joined_at date,
  add column if not exists active bool default true,
  add column if not exists notes text;

-- Volunteer sessions: one row per volunteer at most. Enforces "one active
-- device" by rotating the token; the previous device's API calls return 401.
create table if not exists volunteer_sessions (
  user_id uuid primary key references users(id) on delete cascade,
  token text unique not null,
  issued_at timestamptz not null default now(),
  device_label text,
  device_fingerprint text,
  last_seen_at timestamptz default now(),
  expires_at timestamptz not null
);
create index if not exists volunteer_sessions_token_idx on volunteer_sessions (token);

-- Field submission queue
do $$
begin
  if not exists (select 1 from pg_type where typname = 'field_submission_status') then
    create type field_submission_status as enum (
      'pending', 'ai_processed', 'needs_human', 'accepted', 'rejected'
    );
  end if;
end$$;

create table if not exists field_submissions (
  id uuid primary key default gen_random_uuid(),
  submitter_id uuid not null references users(id) on delete cascade,
  url text,
  screenshot_url text,
  screenshot_data_url text,
  ocr_transcript text,
  ocr_caption text,
  note text,
  suggested_district_id int references districts(id) on delete set null,
  platform text,
  extract_quality text,
  ai_title text,
  ai_body text,
  ai_classification jsonb,
  status field_submission_status not null default 'pending',
  reviewer_id uuid references users(id) on delete set null,
  rejection_reason text,
  accepted_event_id uuid references events(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  intern_notes text
);
create index if not exists field_submissions_status_idx on field_submissions (status, created_at desc);
create index if not exists field_submissions_submitter_idx on field_submissions (submitter_id, created_at desc);

-- RLS
alter table volunteer_sessions enable row level security;
alter table field_submissions enable row level security;

-- Volunteer session policies
drop policy if exists volunteer_sessions_firm_read on volunteer_sessions;
drop policy if exists volunteer_sessions_self_read on volunteer_sessions;
drop policy if exists volunteer_sessions_firm_write on volunteer_sessions;
create policy volunteer_sessions_firm_read on volunteer_sessions for select to authenticated
  using (public.is_firm());
create policy volunteer_sessions_self_read on volunteer_sessions for select to authenticated
  using (user_id = auth.uid());
create policy volunteer_sessions_firm_write on volunteer_sessions for all to authenticated
  using (public.is_firm()) with check (public.is_firm());

-- Field submission policies
drop policy if exists field_submissions_volunteer_insert on field_submissions;
drop policy if exists field_submissions_volunteer_read_own on field_submissions;
drop policy if exists field_submissions_firm_all on field_submissions;
create policy field_submissions_volunteer_insert on field_submissions for insert to authenticated
  with check (submitter_id = auth.uid());
create policy field_submissions_volunteer_read_own on field_submissions for select to authenticated
  using (submitter_id = auth.uid());
create policy field_submissions_firm_all on field_submissions for all to authenticated
  using (public.is_firm()) with check (public.is_firm());

-- Helper: is the current user an intern?
create or replace function public.is_intern()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role() = 'firm_intern';
$$;

-- Adjust is_firm() so existing firm-only policies treat interns as firm staff
-- for read purposes on classified events, voices, etc. Interns are firm staff.
create or replace function public.is_firm()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role() in ('firm_admin', 'firm_analyst', 'firm_intern');
$$;
