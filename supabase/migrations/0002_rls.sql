-- Signal Desk — Row Level Security policies
-- Roles: firm_admin, firm_analyst, party_viewer

-- Helpers -------------------------------------------------------------
create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_firm()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role() in ('firm_admin', 'firm_analyst');
$$;

create or replace function public.is_firm_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role() = 'firm_admin';
$$;

create or replace function public.is_party()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role() = 'party_viewer';
$$;

-- Enable RLS ----------------------------------------------------------
alter table users enable row level security;
alter table districts enable row level security;
alter table constituencies enable row level security;
alter table mlas enable row level security;
alter table events enable row level security;
alter table classifications enable row level security;
alter table triage enable row level security;
alter table voices enable row level security;
alter table stories enable row level security;
alter table briefs enable row level security;
alter table alerts enable row level security;
alter table audit_log enable row level security;
alter table sentiment_snapshots enable row level security;

-- users: each user can read their own row; firm sees all
create policy users_self_read on users for select to authenticated
  using (id = auth.uid() or public.is_firm());

-- Reference tables: any authenticated user can read
create policy ref_districts_read on districts for select to authenticated using (true);
create policy ref_constituencies_read on constituencies for select to authenticated using (true);
create policy ref_mlas_read on mlas for select to authenticated using (true);

-- events: firm reads all; party reads only events with classification + high enough SNT
create policy events_firm_read on events for select to authenticated
  using (public.is_firm());
create policy events_party_read on events for select to authenticated
  using (public.is_party() and exists (
    select 1 from classifications c where c.event_id = events.id
  ));

-- classifications: firm reads all; party reads all (joined via events)
create policy classifications_firm_read on classifications for select to authenticated
  using (public.is_firm());
create policy classifications_party_read on classifications for select to authenticated
  using (public.is_party());

-- triage: firm only
create policy triage_firm_read on triage for select to authenticated using (public.is_firm());
create policy triage_firm_write on triage for all to authenticated
  using (public.is_firm()) with check (public.is_firm());

-- voices: firm full access; party can read but NOT the notes column (enforced via view in app)
create policy voices_firm_read on voices for select to authenticated using (public.is_firm());
create policy voices_firm_write on voices for all to authenticated
  using (public.is_firm()) with check (public.is_firm());
create policy voices_party_read on voices for select to authenticated using (public.is_party());

-- stories: firm full; party reads only published
create policy stories_firm_read on stories for select to authenticated using (public.is_firm());
create policy stories_firm_write on stories for all to authenticated
  using (public.is_firm()) with check (public.is_firm());
create policy stories_party_read on stories for select to authenticated
  using (public.is_party() and status = 'published');

-- briefs: firm full; party reads only published
create policy briefs_firm_read on briefs for select to authenticated using (public.is_firm());
create policy briefs_firm_write on briefs for all to authenticated
  using (public.is_firm()) with check (public.is_firm());
create policy briefs_party_read on briefs for select to authenticated
  using (public.is_party() and published_at is not null);

-- alerts: firm full; party reads all
create policy alerts_firm_read on alerts for select to authenticated using (public.is_firm());
create policy alerts_firm_write on alerts for all to authenticated
  using (public.is_firm()) with check (public.is_firm());
create policy alerts_party_read on alerts for select to authenticated using (public.is_party());

-- audit_log: firm_admin only; insert via service role (bypasses RLS)
create policy audit_admin_read on audit_log for select to authenticated using (public.is_firm_admin());

-- sentiment_snapshots: any authenticated user can read
create policy sentiment_read on sentiment_snapshots for select to authenticated using (true);

-- Party-safe voices view (no notes column)
create or replace view voices_public as
  select id, name, role, district_id, constituency_id, active, joined_at,
         last_engagement_at, ever_paid, ever_scripted
  from voices;
grant select on voices_public to authenticated;
