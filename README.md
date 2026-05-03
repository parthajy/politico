# Signal Desk

Political-intelligence platform built as a client demo for an Indian consultancy
pitching to the Government of Arunachal Pradesh. Two interfaces backed by one
shared database:

- **Firm view** (`/firm/*`) — analyst workbench
- **Party view** (`/party/*`) — read-only dashboard for the CMO

## Live demo

**URL:** https://politico-mu.vercel.app

| Login | Password | Role |
|---|---|---|
| `firm.admin@signaldesk.demo` | `SignalDesk2026!` | Firm admin (sees `/firm/audit`) |
| `firm.analyst@signaldesk.demo` | `SignalDesk2026!` | Firm analyst |
| `party.cm@signaldesk.demo` | `SignalDesk2026!` | CMO read-only |

The login page has one-click buttons that pre-fill these credentials.

## The 90-second demo flow

1. Open the URL in two browser windows side by side.
2. Window 1 → log in as `firm.analyst@signaldesk.demo` → land on `/firm`.
3. Window 2 → log in as `party.cm@signaldesk.demo` → land on `/party`.
4. **Firm window:** click **Refresh now** on `/firm/sources` if you want a
   freshly-pulled signal. (Reddit + Google News are constant.) Wait ~15s.
5. Open `/firm`. Click the top SNT-ranked event. Side panel opens with the
   classification (entities, sentiment justification, SNT breakdown, district
   + constituency tags). Click **Escalate**.
6. **Party window:** refresh. The escalation auto-creates an alert visible on
   the dashboard's "Active alerts" panel.
7. Click into the relevant district on the heat map → constituency in MLA
   context with a 30-day sentiment trend.
8. **Firm window:** open `/firm/briefs` → **Generate today's brief**. Modal
   streams the gpt-4o output in ~10–15 seconds. Click **Open editor →**.
9. Edit a paragraph if you want, click **Save edits**, then **Publish to party**.
10. **Party window:** open `/party/brief`. The published brief is there with a
    "published just now" timestamp.

## Architecture

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router · TypeScript strict |
| Hosting | Vercel |
| Database + Auth | Supabase (Postgres + email/password auth) |
| AI | OpenAI — `gpt-4o-mini` (classifier), `gpt-4o` (briefs). Swap to Claude post-demo. |
| Maps | `react-simple-maps` + DataMeet AP district GeoJSON (25/28 districts) |
| Charts | Recharts (sparklines + 30-day trends) |
| Cron | Vercel Cron (daily on Hobby plan; cron-job.org recommended for 15-min cadence) |

## Data sources

**Live (5):** Reddit, GDELT, Google News RSS (per district + minister + issue),
Indian outlet RSS (Hindu, IE, HT, NDTV, Arunachal Times, Arunachal Front),
YouTube Data API v3.

**Premium placeholders (5):** Meltwater, Cision India, TAM Media, Konnect
Insights, Maltego — visible on `/firm/sources` as greyed cards with Connect
modals describing what each unlocks post-contract.

## Local setup

```bash
git clone https://github.com/parthajy/politico
cd politico
npm install

# .env.local — required keys:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL (for migrations),
#   OPENAI_API_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL,
#   YOUTUBE_API_KEY, CRON_SECRET, DEMO_USER_PASSWORD,
#   NEXT_PUBLIC_DEMO_PASSWORD

npm run db:apply       # apply Supabase migrations
npm run seed           # districts, constituencies, MLAs, voices, demo users
npx tsx scripts/test-ingest.ts             # one ingest cycle (~15s)
npx tsx scripts/classify-pending.ts        # backfill any unclassified events
npx tsx scripts/seed-sentiment-snapshots.ts # 30-day trend rows

npm run dev            # http://localhost:3000
```

## Wiring 15-minute cron (free, no Vercel Pro)

Vercel Hobby caps crons at 1/day. For sub-hourly fetches, point a free
external scheduler (cron-job.org) at:

```
URL:    https://politico-mu.vercel.app/api/cron/ingest
Method: GET
Header: Authorization: Bearer <CRON_SECRET from .env.local>
Cadence: every 15 min
```

## Doctrines encoded in the product

1. **Bigger Reality** — Story Pipeline kanban on `/firm/stories`
2. **Time is the Weapon** — 30-day trend lines everywhere
3. **Local Voice First** — `/firm/voices` is a first-class CRM
4. **No Paid Narrative** — `voices.ever_paid` and `voices.ever_scripted`
   are visible audit columns; the `0` count is highlighted in green
5. **Visual Proof Over Claims** — Story records carry outlet, URL, reach
6. **Leader, Not Respondent** — no "respond to allegation" workflow exists
7. **Signal Over Noise** — every event has an SNT score; inbox ranked by it

## Known caveats

- AP heat map covers 25 of 28 districts (DataMeet GeoJSON predates Bichom,
  Keyi Panyor, and Itanagar Capital Complex carve-outs). Missing districts
  render as light-grey "no data" tiles.
- Cabinet minister Nyato Dukam's home constituency couldn't be verified
  online; seeded with `constituency_id = null` per the brief's
  "label rather than invent" rule.
- GDELT rate-limits this IP; cron runs from Vercel IPs see better hit rates.
- Demo accounts use `@signaldesk.demo` (not a real TLD), so password reset
  emails would bounce. The 3 accounts are pre-confirmed on creation.

## Repo layout

```
src/
  app/
    api/                 # /cron/ingest, /ingest/run, /triage, /briefs/*
    firm/                # signal inbox, sources, voices, stories, briefs, audit
    party/               # heat-map dashboard, district, constituency, cabinet, brief, alerts
  components/            # ap-heat-map, sentiment-sparkline, markdown, ui/*
  lib/
    ai/                  # openai client, classifier, brief generator
    sources/             # reddit, gdelt, rss, youtube, util (timeout)
    seed/ap-data.ts      # 28 districts, 60 constituencies + MLAs, 12-member cabinet
    map/ap-districts.json # district GeoJSON
    supabase/            # browser, server, admin clients
    loaders/             # shared server-side data fetchers
    audit.ts             # central audit-log writer
    format.ts            # SNT badge, sentiment color, source short-names
supabase/migrations/
  0001_init.sql          # 12 tables + indexes + auto-create-user trigger
  0002_rls.sql           # RLS policies enforcing firm/party separation
scripts/
  apply-migrations.ts    # runs SQL migrations via direct Postgres connection
  seed.ts                # reference data + voices + demo users
  classify-pending.ts    # backfill classifier for unclassified events
  seed-sentiment-snapshots.ts # 30-day snapshot rows
  test-ingest.ts         # local end-to-end ingest smoke test
  verify-day1.ts         # auth + reference data check
  verify-day3.ts         # 90s-flow simulation against prod
```
