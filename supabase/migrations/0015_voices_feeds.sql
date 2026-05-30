-- 0015: voices CRM fields + sources/feeds registry.

-- ─────────────────────────────────────────────────────────────────────────────
-- Voices — add CRM-grade contact + relationship fields.
-- We keep the existing rich columns from 0006 (social_handles, coverage_topics,
-- reach_estimate, response_rate, placement_count, last_outreach_at,
-- relationship_notes) and add the explicit primary-contact fields below.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.voices
  add column if not exists outlet_name text,                        -- "Arunachal Times", "EastMojo", "Independent" etc.
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists relationship_status text default 'unknown'
    check (relationship_status in ('warm', 'cool', 'hostile', 'unknown')),
  add column if not exists languages text[] default '{}';

create index if not exists voices_outlet_idx on public.voices (outlet_name);
create index if not exists voices_relationship_idx on public.voices (relationship_status);


-- ─────────────────────────────────────────────────────────────────────────────
-- feed_registry — every RSS / Google News feed we ingest from, in a table
-- the analyst can read + edit via /firm/sources. Replaces the hardcoded list
-- in src/lib/sources/rss.ts.
--
-- Seeded below with the exact set of feeds currently configured in code —
-- this migration is the cutover from code-config to db-config.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.feed_registry (
  id bigserial primary key,
  source text not null check (source in ('rss', 'google_news')),
  tag text not null unique,             -- short identifier e.g. 'eastmojo_ap'
  display_name text not null,           -- "EastMojo · AP page" for the UI
  url text not null,                    -- the actual feed URL
  is_broad boolean default false,       -- apply the AP-keyword filter (for national feeds)
  active boolean not null default true,
  last_fetched_at timestamptz,
  last_item_at timestamptz,
  last_item_count int default 0,        -- items fetched on the most recent run
  fetch_error text,                     -- last error message if any
  created_at timestamptz default now(),
  created_by uuid references public.users(id) on delete set null
);
create index if not exists feed_registry_active_idx on public.feed_registry (active);
create index if not exists feed_registry_source_idx on public.feed_registry (source);

alter table public.feed_registry enable row level security;

-- Firm + superadmin can read and write the registry.
drop policy if exists feed_registry_firm_read on public.feed_registry;
create policy feed_registry_firm_read on public.feed_registry
  for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','firm_intern','superadmin')));

drop policy if exists feed_registry_firm_write on public.feed_registry;
create policy feed_registry_firm_write on public.feed_registry
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','superadmin')))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('firm_admin','firm_analyst','superadmin')));

-- Seed the registry with everything currently in src/lib/sources/rss.ts
-- (insert-if-not-exists by tag).
insert into public.feed_registry (source, tag, display_name, url, is_broad, active) values
  -- National outlets (broad → AP-keyword filtered)
  ('rss',         'thehindu',           'The Hindu · other states',          'https://www.thehindu.com/news/national/other-states/feeder/default.rss', true,  true),
  ('rss',         'indian_express',     'Indian Express · NE India',         'https://indianexpress.com/section/north-east-india/feed/',               false, true),
  ('rss',         'hindustan_times',    'Hindustan Times · India news',      'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',       true,  true),
  ('rss',         'ndtv',               'NDTV · India news',                  'https://feeds.feedburner.com/ndtvnews-india-news',                       true,  true),
  -- Local AP outlets
  ('rss',         'arunachal_times',    'Arunachal Times',                    'https://arunachaltimes.in/index.php/feed/',                              false, true),
  ('rss',         'arunachal_front',    'Arunachal Front',                    'https://arunachalfront.com/feed/',                                       false, true),
  ('rss',         'echo_of_arunachal',  'Echo of Arunachal',                  'https://www.echoofarunachal.in/feed/',                                   false, true),
  ('rss',         'eastmojo_ap',        'EastMojo · AP page',                 'https://www.eastmojo.com/state/arunachal-pradesh/feed/',                 false, true),
  ('rss',         'nenow_ap',           'NE Now · AP page',                   'https://nenow.in/north-east-news/arunachal-pradesh/feed',                false, true),
  ('rss',         'sentinel_ap',        'Sentinel Assam · AP topic',          'https://www.sentinelassam.com/topic/arunachal-pradesh/feed',             false, true),
  ('rss',         'nelive_ap',          'NELive · AP page',                   'https://nelive.in/section/arunachal-pradesh/feed',                       false, true),
  -- PIB (Press Information Bureau)
  ('rss',         'pib_north_east',     'PIB · North-East regional',          'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3',                 false, true),
  ('rss',         'pib_national',       'PIB · national (AP-filtered)',       'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=0',                 true,  true),
  -- Nitter (X/Twitter via RSS proxy)
  ('rss',         'x_cm_khandu',        'X · @PemaKhanduBJP (CM)',            'https://nitter.privacydev.net/PemaKhanduBJP/rss',                        false, true),
  ('rss',         'x_dycm_mein',        'X · @ChownaMeinBJP (DyCM)',          'https://nitter.privacydev.net/ChownaMeinBJP/rss',                        false, true),
  ('rss',         'x_cmo',              'X · @ArunachalCMO',                  'https://nitter.privacydev.net/ArunachalCMO/rss',                         false, true),
  ('rss',         'x_search_arunachal', 'X · #arunachal search',              'https://nitter.privacydev.net/search/rss?f=tweets&q=arunachal',          true,  true),
  -- Google News searches
  ('google_news', 'itanagar',           'Google News · Itanagar',             'https://news.google.com/rss/search?q=Itanagar+Arunachal+Pradesh&hl=en-IN&gl=IN&ceid=IN:en', false, true),
  ('google_news', 'tawang',             'Google News · Tawang',               'https://news.google.com/rss/search?q=Tawang+Arunachal&hl=en-IN&gl=IN&ceid=IN:en',          false, true),
  ('google_news', 'east_siang',         'Google News · East Siang Pasighat',  'https://news.google.com/rss/search?q=East+Siang+Pasighat&hl=en-IN&gl=IN&ceid=IN:en',      false, true),
  ('google_news', 'west_kameng',        'Google News · West Kameng Bomdila',  'https://news.google.com/rss/search?q=West+Kameng+Bomdila&hl=en-IN&gl=IN&ceid=IN:en',      false, true),
  ('google_news', 'changlang',          'Google News · Changlang',            'https://news.google.com/rss/search?q=Changlang+Arunachal&hl=en-IN&gl=IN&ceid=IN:en',      false, true),
  ('google_news', 'cm_khandu',          'Google News · Pema Khandu',          'https://news.google.com/rss/search?q=%22Pema+Khandu%22&hl=en-IN&gl=IN&ceid=IN:en',         false, true),
  ('google_news', 'dycm_mein',          'Google News · Chowna Mein',          'https://news.google.com/rss/search?q=%22Chowna+Mein%22&hl=en-IN&gl=IN&ceid=IN:en',         false, true),
  ('google_news', 'issue_lac',          'Google News · LAC border',           'https://news.google.com/rss/search?q=Arunachal+China+LAC+border&hl=en-IN&gl=IN&ceid=IN:en', false, true),
  ('google_news', 'issue_roads',        'Google News · road connectivity',    'https://news.google.com/rss/search?q=Arunachal+road+connectivity&hl=en-IN&gl=IN&ceid=IN:en', false, true),
  ('google_news', 'issue_hydropower',   'Google News · hydropower Siang',     'https://news.google.com/rss/search?q=Arunachal+Pradesh+hydropower+Siang&hl=en-IN&gl=IN&ceid=IN:en', false, true)
on conflict (tag) do nothing;
