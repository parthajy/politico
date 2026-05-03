-- Threat radar — AI-generated forward-looking risk assessments per entity.
-- Persisted so the CMO summary can read the last assessment without re-running.

create type threat_scope as enum ('cm', 'minister', 'constituency');
create type threat_band as enum ('low', 'medium', 'high', 'critical');

create table threat_assessments (
  id uuid primary key default gen_random_uuid(),
  scope_type threat_scope not null,
  scope_id int,                       -- mla_id or constituency_id; null for the cm rollup
  entity_name text not null,           -- 'Pema Khandu' / 'Mama Natung' / 'Itanagar' for display
  threat_score numeric not null check (threat_score between 0 and 1),
  threat_band threat_band not null,
  headline text not null,              -- one-line CMO summary (used by /party views)
  threats jsonb not null,              -- [{title, description, time_horizon, severity}]
  recommended_actions jsonb not null,  -- [{action, owner, urgency}]
  evidence_event_ids uuid[] not null default '{}',
  generated_at timestamptz not null default now(),
  generated_by uuid references users(id) on delete set null,
  model_version text,
  unique (scope_type, scope_id)
);
create index threats_band_idx on threat_assessments (threat_band);
create index threats_generated_idx on threat_assessments (generated_at desc);

alter table threat_assessments enable row level security;

-- Firm: full read + write
create policy threats_firm_read on threat_assessments for select to authenticated using (public.is_firm());
create policy threats_firm_write on threat_assessments for all to authenticated
  using (public.is_firm()) with check (public.is_firm());

-- Party: summary read only — they see entity_name, threat_band, headline, generated_at
-- via a view that excludes the strategic detail (actions + evidence).
create policy threats_party_read on threat_assessments for select to authenticated using (public.is_party());

create or replace view threat_assessments_summary as
  select
    id,
    scope_type,
    scope_id,
    entity_name,
    threat_band,
    headline,
    generated_at
  from threat_assessments;

grant select on threat_assessments_summary to authenticated;
