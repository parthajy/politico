-- 0016: AI voice extraction + comments-tier intelligence on volunteer submissions.

-- ─────────────────────────────────────────────────────────────────────────────
-- voices: extraction provenance + classification.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.voices
  add column if not exists auto_extracted boolean default false,
  add column if not exists source_event_id uuid references public.events(id) on delete set null,
  add column if not exists profession_category text
    check (profession_category is null or profession_category in (
      'journalist','activist','official','influencer','community_leader','politician','expert','troll','commenter','unknown'
    )),
  add column if not exists confidence_score numeric check (confidence_score is null or confidence_score between 0 and 1),
  add column if not exists platform_handles jsonb default '{}'::jsonb,  -- { twitter: '@x', facebook: '...', instagram: '...' }
  add column if not exists why_they_matter text,
  add column if not exists last_seen_at timestamptz;                    -- newest event they're tied to

create index if not exists voices_auto_extracted_idx on public.voices (auto_extracted) where auto_extracted = true;
create index if not exists voices_profession_idx on public.voices (profession_category);
create index if not exists voices_last_seen_idx on public.voices (last_seen_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- voice_event_links: many-to-many — track every event a voice appears in
-- (whether as the original poster or quoted in the body / comments).
-- This gives us 'how many times has this voice surfaced this month' over time.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.voice_event_links (
  voice_id uuid not null references public.voices(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  role text not null default 'mentioned' check (role in ('author','quoted','mentioned','commenter')),
  sentiment numeric check (sentiment is null or sentiment between -1 and 1),
  detected_at timestamptz not null default now(),
  detected_by text not null default 'ai_extract' check (detected_by in ('ai_extract','manual','ingest_rss','ingest_x')),
  primary key (voice_id, event_id, role)
);
create index if not exists voice_event_links_event_idx on public.voice_event_links (event_id);
create index if not exists voice_event_links_voice_idx on public.voice_event_links (voice_id, detected_at desc);

alter table public.voice_event_links enable row level security;
drop policy if exists vel_firm_read on public.voice_event_links;
create policy vel_firm_read on public.voice_event_links for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','firm_intern','superadmin','party_viewer')));
drop policy if exists vel_firm_write on public.voice_event_links;
create policy vel_firm_write on public.voice_event_links for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','superadmin')))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','superadmin')));


-- ─────────────────────────────────────────────────────────────────────────────
-- field_submissions: multi-screenshot support + comments/context capture.
-- The existing single screenshot_url stays; new array holds additional shots
-- (post + comment thread + audience reactions, etc.). comments_text is the
-- volunteer's free-form note about reactions they observed.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.field_submissions
  add column if not exists extra_screenshot_urls text[] default '{}',
  add column if not exists comments_text text;


-- ─────────────────────────────────────────────────────────────────────────────
-- events: engagement metrics + comments record (carries through from
-- field_submissions when the intern accepts).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.events
  add column if not exists engagement jsonb default '{}'::jsonb,        -- { likes, retweets, comments, shares, views }
  add column if not exists comments_text text,
  add column if not exists extra_screenshot_urls text[] default '{}';


-- ─────────────────────────────────────────────────────────────────────────────
-- WIPE seeded / placeholder voices.
-- User asked for a clean slate — no real users yet, no real stories tied,
-- so a hard delete is safe. From here every voice comes from manual add
-- (the form we shipped in 0015) or AI auto-extraction (this migration).
-- voice_event_links cascades from voices, so it clears automatically.
-- stories.voice_id is ON DELETE SET NULL — historical stories keep working
-- with voice_id=null after the wipe.
-- ─────────────────────────────────────────────────────────────────────────────
delete from public.voices;
