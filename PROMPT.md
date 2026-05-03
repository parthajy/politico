# Signal Desk — Build Brief

> Paste this into a fresh Claude Code session. Save it in the repo root as `PROMPT.md` so it stays in working memory across sessions.

---

## 1. What you are building

**Signal Desk** is a political intelligence platform for an Indian political consultancy firm pitching to senior leadership of the Arunachal Pradesh state government. This build is a **client demo** — production-grade polish, deployed and demo-able from any laptop, but operating on free-tier data sources. Premium tools the firm will purchase post-contract (Meltwater, Cision, TAM, Konnect Insights, Maltego) appear as visible placeholder cards so the client sees exactly what the upgrade unlocks.

The platform ingests signals from public sources, classifies them with Claude, and exposes them through **two distinct interfaces backed by one shared database**:

- **Firm view** (`/firm/*`) — the analyst workbench the consultancy's team uses every day.
- **Party view** (`/party/*`) — the read-only dashboard the CM's office and the party state unit see.

The "wow moment" in the demo is showing both views on adjacent monitors, watching a single event flow: ingested from Reddit → classified by Claude → tagged to a constituency → escalated on firm side → reflected on party side, all in under 90 seconds.

The audience is a Chief Minister-tier principal plus their senior political advisor. Polish matters. Reliability matters more. **If anything breaks during the demo, the entire pitch fails.**

---

## 2. Locked architectural decisions

Do not revisit any of these. They were chosen deliberately.

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router, TypeScript strict mode |
| Hosting | Vercel |
| Database + Auth | Supabase free tier (Postgres + Auth) |
| OTP delivery | Resend free tier |
| AI | Anthropic SDK — Claude Haiku for classification (high volume), Claude Sonnet for brief generation |
| Styling | Tailwind CSS + shadcn/ui |
| Cron | Vercel Cron Jobs (15-min cadence) |
| Charts | Recharts |
| Maps | react-simple-maps with custom AP district GeoJSON |
| State | Server Components by default; TanStack Query for client mutations |
| Forms | react-hook-form + zod |
| Testing | Skip unit tests for this build. Manual demo-flow verification only. |

**No** Redux, no tRPC, no Prisma (use Supabase client directly), no microservices, no Docker, no Storybook, no monorepo tooling. Every dependency you add costs reliability — justify each one.

---

## 3. Data sources

### Five free sources — wire these for real

| Source | Method | Cadence | Notes |
|---|---|---|---|
| Reddit | Public JSON endpoints, no auth | 15 min | r/arunachalpradesh, r/northeastindia, r/india, r/IndiaSpeaks |
| YouTube Data API v3 | API key, free tier (10K units/day) | 30 min | Search regional channels; pull title, description, comment count |
| GDELT 2.0 | HTTP, no auth | 15 min | Filter `Locations` field for India + AP keywords |
| Google News RSS | RSS, query-based | 30 min | One feed per district + per minister + per top issue |
| Indian outlet RSS | Direct RSS | 30 min | The Hindu, Indian Express, Hindustan Times, NDTV, Arunachal Times, Echo of Arunachal, Arunachal Front |

### Five premium placeholders — UI only, never wire

- **Meltwater** — primary social + media listening
- **Cision India** — print monitoring
- **TAM Media** — broadcast TV
- **Konnect Insights** — regional + Hindi depth
- **Maltego** — OSINT workbench

These render as cards on `/firm/sources` with a greyed-out state, a status pill reading "Available — not connected", and a "Connect" button that opens a modal explaining what each unlocks (volume multipliers, primetime TV, network mapping, etc.). The visual presence of these cards is non-negotiable — the client must see where post-contract money goes.

---

## 4. Data model

Use Supabase migrations (SQL files in `/supabase/migrations`). Enable RLS on every table.

```
users
  id uuid pk (from supabase auth)
  email text
  full_name text
  role enum: 'firm_admin' | 'firm_analyst' | 'party_viewer'
  created_at timestamptz

districts
  id serial pk
  name text
  hq text
  population_est int
  tier int  -- 1, 2, or 3
  dominant_communities text[]

constituencies
  id serial pk
  number int  -- 1 to 60
  name text
  district_id int fk
  current_mla_id int fk
  last_election_margin_pct numeric

mlas
  id serial pk
  name text
  party text
  constituency_id int fk
  is_minister bool
  portfolio text  -- null if not a minister
  is_cm bool
  is_deputy_cm bool

events  -- raw signals from all sources
  id uuid pk
  source enum: 'reddit' | 'youtube' | 'gdelt' | 'google_news' | 'rss' | 'manual'
  source_id text  -- original ID from source for dedup
  url text
  title text
  body text
  published_at timestamptz
  ingested_at timestamptz
  raw_payload jsonb

classifications  -- one per event, written by Claude
  event_id uuid pk fk
  language text
  entities jsonb  -- [{type, value, confidence}]
  sentiment numeric  -- -1.0 to 1.0
  sentiment_justification text
  district_id int fk null
  constituency_id int fk null
  mla_id int fk null
  topic_tags text[]
  snt_velocity numeric  -- 0-1
  snt_credibility numeric  -- 0-1
  snt_vector numeric  -- 0-1
  snt_score numeric  -- composite, 0-1
  classified_at timestamptz
  model_version text  -- 'haiku-3.5' etc

triage  -- analyst actions on events
  event_id uuid pk fk
  status enum: 'new' | 'monitoring' | 'escalated' | 'closed'
  assigned_to uuid fk users null
  notes text
  updated_by uuid fk users
  updated_at timestamptz

voices  -- community voice CRM (mocked for demo)
  id uuid pk
  name text
  role text  -- 'teacher', 'doctor', 'farmer', etc
  district_id int fk
  constituency_id int fk null
  active bool
  joined_at date
  last_engagement_at date
  notes text
  -- Doctrine 4 audit columns:
  ever_paid bool default false
  ever_scripted bool default false

stories  -- story pipeline
  id uuid pk
  title text
  district_id int fk
  constituency_id int fk null
  status enum: 'idea' | 'in_production' | 'published'
  outlet text null
  url text null
  reach_estimate int null
  voice_id uuid fk null  -- which community voice spoke
  published_at timestamptz null
  created_at timestamptz

briefs  -- daily morning briefs
  id uuid pk
  brief_date date unique
  body_md text  -- full markdown body
  generated_at timestamptz
  generated_by_model text  -- 'sonnet-4.6' etc
  approved_by uuid fk users null
  published_at timestamptz null

alerts
  id uuid pk
  severity enum: 's1' | 's2' | 's3'
  title text
  body text
  event_id uuid fk null
  created_at timestamptz
  resolved_at timestamptz null

audit_log
  id bigserial pk
  user_id uuid fk
  action text  -- 'view_constituency', 'escalate_event', 'generate_brief', etc
  entity_type text
  entity_id text
  metadata jsonb
  created_at timestamptz

sentiment_snapshots  -- for trend lines
  id bigserial pk
  date date
  scope_type enum: 'state' | 'district' | 'constituency' | 'minister'
  scope_id int null
  net_sentiment numeric
  sample_size int
```

### RLS policies — enforce role separation

- `firm_admin` and `firm_analyst`: full read on all tables; write on `triage`, `voices`, `stories`, `briefs`. `firm_admin` only on `audit_log` reads and source config.
- `party_viewer`: read-only on `events` + `classifications` (joined view), `briefs` where `published_at is not null`, `stories` where `status = 'published'`, `alerts`, `sentiment_snapshots`, plus all reference tables (`districts`, `constituencies`, `mlas`, `voices` excluding notes column).
- Block cross-role access at Next.js middleware **and** at RLS — defence in depth.

---

## 5. Routes and views

### Firm view (`/firm/*`)

| Route | Purpose |
|---|---|
| `/firm` | Daily signal inbox — events table ranked by SNT score, filterable by source/district/severity. Click row → side panel with full classification, triage actions. |
| `/firm/constituency/[id]` | Per-seat drill-down: MLA card, demographics, last-3 results, recent events, sentiment trend (last 30 days), top voices, story pipeline scoped to seat. |
| `/firm/voices` | Community voice CRM — table view, filters by district/active, click for detail page. Audit columns visible (`ever_paid`, `ever_scripted`) — demonstrates Doctrine 4 compliance. |
| `/firm/stories` | Three-column kanban: Ideas → In Production → Published. Drag-and-drop. Click card for detail. |
| `/firm/sources` | Source health dashboard. Live sources show last-sync timestamp + events-pulled-today count. Premium placeholders show "Connect" button + info modal. |
| `/firm/briefs` | List of past briefs + "Generate Today's Brief" button. Click → editor view, can mark approved + published. |
| `/firm/audit` | Full audit log table, paginated, filterable by user/action/date. Admin-only. |

### Party view (`/party/*`)

| Route | Purpose |
|---|---|
| `/party` | Hero dashboard. Top: AP district heat map, sentiment-coloured. Right: today's headline number — net sentiment delta vs baseline, with sparkline. Below: today's published brief preview, top 5 alerts, top 5 weekly stories. |
| `/party/constituency/[id]` | Read-only mirror of firm constituency view. No triage actions. |
| `/party/cabinet` | Grid of minister cards: photo placeholder, portfolio, sentiment trend sparkline, recent footprint count, click for detail. |
| `/party/brief` | Today's published brief, full text. Archive in sidebar. |
| `/party/alerts` | Alert feed + alert subscription preferences. |

### Auth flow

- Landing page with two CTAs based on email domain detection — but always allow manual role selection for demo.
- OTP via Resend → 6-digit code, 10-minute expiry, single-use.
- Post-login redirect by role: firm → `/firm`, party → `/party`.
- Logout from any nav.
- For demo, seed 4 test accounts:
  - `firm.admin@signaldesk.demo` (firm_admin)
  - `firm.analyst@signaldesk.demo` (firm_analyst)
  - `party.cm@signaldesk.demo` (party_viewer)
  - `party.advisor@signaldesk.demo` (party_viewer)

---

## 6. AP-specific data to seed

Before building any UI, **research and seed** the following. Use web search at build time — do not hardcode anything you cannot verify.

1. **25 districts of Arunachal Pradesh** with current names, HQ towns, approximate population, dominant communities, and a Tier 1/2/3 designation (you choose tiers — make Itanagar, Tawang, East Siang, West Kameng, Changlang priority Tier 1).
2. **60 Assembly constituencies** with constituency number, name, and current MLA name + party. Verify against the most recent election + by-elections.
3. **Cabinet** — current Chief Minister, Deputy Chief Minister (if any), all ministers with portfolios.
4. **Top 15 governance issues** for AP — terrain-aware: roads/connectivity, border infrastructure, education, primary healthcare, electricity, telecom dead zones, employment, agriculture & horticulture, tribal welfare, tourism, illegal immigration, environmental conservation, language preservation, NEFA-era institutional reforms, BSF/Army-civilian coordination.
5. **30 days of historical events** — generate ~25 events per day, ~750 total. Distribute plausibly across the 5 sources, across districts (Tier 1 districts get more), across the 15 issues. Use Claude (Sonnet) to generate this seed batch — give it the constituency list, the issue list, and ask for realistic-sounding signal data with correct AP geography. Run them through the same classification pipeline so they have proper SNT scores and entity tags.
6. **Sentiment baseline** — fabricate a baseline measurement at day 0 (30 days ago) for state, each district, each Tier-1 constituency, and the top 5 ministers. Then generate plausible sentiment_snapshot rows for each day so trend lines have shape.
7. **Community voices** — 70 mocked voices distributed across districts (more in Tier 1). Realistic names + roles + join dates. Mark all `ever_paid = false` and `ever_scripted = false` to demonstrate Doctrine 4.

> **Important:** Verify MLA names and cabinet composition via web search at build time. Indian state cabinets reshuffle. If you cannot verify a fact, mark the field with a clearly-labelled placeholder rather than invent.

---

## 7. Design system

Match the proposal aesthetic exactly — this deck and this app must look like one product family.

### Tokens

```css
--navy: #0F2942;
--navy-deep: #081D33;
--bronze: #C7944C;
--bronze-dark: #A6783B;
--sand: #F4F1EA;
--sand-deep: #E8E4DC;
--white: #FFFFFF;
--text: #1A1A1A;
--muted: #6B7280;
--border: #D4D4D4;

/* Semantic */
--severity-1: #B91C1C;
--severity-2: #C7944C;  /* bronze */
--severity-3: #6B7280;
--positive: #15803D;
--negative: #B91C1C;
```

### Typography

- **Headings**: Georgia, bold. Use for page titles, card titles, big numbers.
- **Body**: Inter (load via next/font). Regular and medium weights only.
- **Numerics in callouts**: Georgia, bold, large. The deck uses 56pt for hero numbers — replicate that gravitas.
- **No** display fonts beyond Georgia. **No** monospace except for code/IDs.

### Hard rules

- No gradients anywhere
- No glassmorphism, no blur effects
- No emojis in UI
- No accent lines under titles (a hallmark of generic AI UI)
- Subtle shadows only (`shadow-sm` max in Tailwind terms)
- Borders, not glows
- Sand backgrounds for cards on white pages; navy backgrounds reserved for hero/CTA moments
- Bronze is the **only** accent color — use it for active states, key numbers, and severity-2 indicators. Never for body text.

### Component library

- shadcn/ui as base — Card, Button, Input, Dialog, Table, Tabs, Badge, Sheet, Command, Sonner (toasts).
- Customise `globals.css` to map shadcn variables to the tokens above.
- Build a small set of opinionated wrappers in `/components/ui/`: `StatCallout`, `ConstituencyCard`, `SeverityBadge`, `SentimentTrend`, `SourceCard`. These keep the look consistent across pages.

---

## 8. AI integration

### Classification pipeline (Claude Haiku)

Every ingested event runs through this prompt structure:

```
System: You are a political intelligence classifier for the Indian state of
Arunachal Pradesh. Given an event, return a strict JSON object with these
fields: language, entities, sentiment, sentiment_justification, district,
constituency, mla, topic_tags, snt_velocity, snt_credibility, snt_vector.

[Include the full constituency + MLA + issue lists as context]

Output: Valid JSON only, no preamble.

User: [event title + body + source]
```

- Use the Anthropic SDK with `response_format` JSON mode where supported.
- Validate with zod before insert.
- On parse failure, log to `audit_log` and skip — do not crash.
- Cost target: under ₹100/day on Haiku for the demo's volume. Batch in groups of 5–10 events per call to amortise.

### Brief generation (Claude Sonnet)

`/firm/briefs` "Generate" action:

```
System: You are writing the Morning Signal Brief for [date] for the Chief
Minister of Arunachal Pradesh. Style: editorial, informed, never alarmist,
no jargon, no doctrine-speak. Two pages, ~700 words. Sections: Top of mind,
What moved overnight, Watch list, Field colour. Cite specific events and
constituencies by name.

[Last 24h of high-SNT events as context]
[Yesterday's sentiment snapshots]
[Active S-1 and S-2 alerts]

Output: Markdown.
```

- Must complete in under 90 seconds.
- Show streaming output in the UI.
- Save draft → analyst can edit → click Publish → moves to party view.

### Cost guardrails

- Haiku classification: ₹100/day budget
- Sonnet brief: ₹50 per generation, max 1/day
- Hard-cap monthly Anthropic spend at ₹5,000 via env-checked counter — fail-loud, not silent.

---

## 9. Phased build plan

Work in vertical slices. Ship each day end-to-end before starting the next.

### Day 1 — Foundation

- [ ] `npx create-next-app` with TypeScript, App Router, Tailwind
- [ ] Install shadcn/ui, configure with tokens above
- [ ] Create Supabase project, get connection details
- [ ] Migrations for all tables in §4 with RLS
- [ ] Resend account, API key, sender domain verified
- [ ] Auth flow: email + OTP, role-based redirect, middleware enforcing role boundaries
- [ ] Seed all reference data (districts, constituencies, MLAs, cabinet, issues, voices)
- [ ] 4 test accounts created
- [ ] Base layout shell for `/firm` and `/party` with role-appropriate nav
- [ ] Deploy to Vercel — confirm OTP delivery + login work in production

**Day 1 acceptance:** All four test accounts can log in via OTP and land on their correct route. Two empty dashboards, but they're real.

### Day 2 — Ingestion + Classification

- [ ] Reddit fetcher (15-min Vercel cron)
- [ ] GDELT fetcher
- [ ] RSS aggregator (Indian outlets + Google News)
- [ ] YouTube fetcher
- [ ] Dedup logic (source + source_id unique constraint)
- [ ] Claude Haiku classification worker
- [ ] Generate 30-day historical seed (Sonnet, run once at build time)
- [ ] Generate sentiment_snapshots for trend lines
- [ ] `/firm/sources` page showing source health + premium placeholders

**Day 2 acceptance:** A fresh event from Reddit appears in the Supabase events table within 15 minutes of being posted, gets classified within 60 seconds of ingestion, and the classification is queryable. Historical seed visible. Source health page shows 5 green + 5 grey.

### Day 3 — The two views

- [ ] `/firm` signal inbox with SNT-ranked table, side panel, triage actions
- [ ] `/firm/constituency/[id]` drill-down
- [ ] `/firm/voices` CRM
- [ ] `/firm/stories` kanban
- [ ] `/party` hero dashboard with AP heat map, sentiment delta, brief preview
- [ ] `/party/constituency/[id]` read-only
- [ ] `/party/cabinet` grid
- [ ] All RLS verified — confirm party_viewer cannot reach firm routes

**Day 3 acceptance:** Both views populated and navigable. The 90-second demo flow works locally.

### Day 4 — Polish

- [ ] Brief generation (Sonnet, streaming, save → publish)
- [ ] Audit log writes from every mutating action + every page view on `/party`
- [ ] `/firm/audit` page
- [ ] Alerts panel with severity filters
- [ ] Loading states, empty states, error states for every async surface
- [ ] Print-stylesheet for briefs (the client may want to hand them to the CM on paper)
- [ ] Re-deploy
- [ ] Run the 90-second flow on the deployed URL three times
- [ ] Record a 5-minute Loom walkthrough as a backup for the live demo
- [ ] Write a one-page README with login credentials and demo flow

**Day 4 acceptance:** Deployed URL passes the 90-second flow with no manual intervention. Demo-ready.

---

## 10. The 90-second demo flow — final acceptance test

Before declaring the build done, this exact sequence must work on the **deployed** URL with no developer touching anything:

1. Open laptop in front of the client. Two browser windows side by side.
2. Window 1: log in as `firm.analyst@signaldesk.demo`, land on `/firm`.
3. Window 2: log in as `party.advisor@signaldesk.demo`, land on `/party`.
4. **Wait** for a real new event to appear in the firm signal inbox (it will — Reddit and GDELT are constant).
5. Click the event. Side panel shows: source, full text, Claude's classification (entity, sentiment, district, constituency, SNT score with breakdown).
6. Click "Escalate". Status changes, audit log records it.
7. Switch to party window — refresh. Event count up by one. If SNT was high enough, alert visible.
8. Click into the event's constituency on the party heat map. See it in MLA context with sentiment trend.
9. Switch back to firm window. Click `/firm/briefs` → "Generate Today's Brief".
10. Watch streaming generation, ~30 seconds. Edit one paragraph. Click "Publish".
11. Switch to party window. `/party/brief` shows the new brief with a "published just now" timestamp.

**If any step requires the developer to intervene, the demo is not done.**

---

## 11. How to work — instructions for you, Claude Code

### Ground rules

- Read this entire file before writing a single line of code.
- Confirm understanding by listing the four days' deliverables back to me before starting.
- Ask only about genuine ambiguities — not bikeshed questions.
- Work in small, atomic commits with descriptive messages. Show me your commit log at the end of each day.
- Server Components by default. Client Components only when interactivity demands it.
- TypeScript strict — no `any`, no `@ts-ignore`, no `@ts-expect-error` without a comment explaining why.
- Use Supabase client directly. No ORMs.
- Hit external APIs through dedicated functions in `/lib/sources/*`. One file per source.
- Centralise Claude calls in `/lib/ai/*`. Never call Anthropic directly from a route handler — go through the lib.
- All AP-specific data verification happens via web search at build time. If you cannot verify, use a clearly-labelled placeholder, never invent.
- No new dependencies without justification. If you reach for a library, first ask: can I do this in 20 lines?

### What to do first

1. Read this brief end to end.
2. List the four days' deliverables back to me.
3. Print a checklist of the env vars you'll need:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `YOUTUBE_API_KEY`
4. **Stop and wait** for me to confirm I have those keys. Do not proceed past this point unprompted.
5. Once I confirm, start Day 1.

### What not to do

- Do not start by scaffolding all four days' folders. Build vertically.
- Do not build a settings page, an admin panel, a user management UI, or any feature not in §5. We will have these one day. Not today.
- Do not "improve" the design system. Match it exactly. The visual coherence with the proposal deck is part of what the client buys.
- Do not write tests. We will manually verify against §10. If you have spare time at the end of Day 4, write a single Playwright script that walks the 90-second flow.
- Do not deploy until Day 1 is end-to-end working locally.
- Do not invent AP political facts. Web-search them.

---

## 12. Reference: the consultancy's proposal context

This app exists because a consultancy is pitching a 3-year, ₹12 Cr engagement to the Arunachal Pradesh state government. The proposal's seven operating doctrines are encoded in the platform:

1. **Bigger Reality** — the Story Pipeline is the visible-work engine, not a press-release tool.
2. **Time is the Weapon** — sentiment trend lines are 30 days deep, designed to show compounding.
3. **Local Voice First** — the Voice CRM is a first-class object, not a contact list.
4. **No Paid Narrative** — Voice records carry hard audit columns proving no payments, no scripts.
5. **Visual Proof Over Claims** — Story records carry outlet, URL, reach data.
6. **Leader, Not Respondent** — there is no "respond to allegation" workflow. By design.
7. **Signal Over Noise** — every event has an SNT score, and the inbox is ranked by it.

When in doubt about a feature decision, return to these. They are the product.

---

**End of brief. Ready to begin? List the four days' deliverables and the env-var checklist, then stop.**
