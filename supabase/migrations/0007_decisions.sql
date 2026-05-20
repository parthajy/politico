-- Decision history — every cabinet decision logged with the signal(s) that
-- triggered it. Institutional memory + the "why did we hire you" demo line.

create type decision_kind as enum (
  'policy_change', 'public_statement', 'cabinet_decision', 'minister_directive',
  'investigation', 'visit', 'communication_freeze', 'other'
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  kind decision_kind not null default 'other',
  decided_on date not null default current_date,
  decided_by_role text,                       -- 'CM', 'Cabinet', 'Minister: Mama Natung', etc.
  scope_type threat_scope,                    -- which entity it relates to (reuses threat_scope enum)
  scope_id int,                               -- mla_id or constituency_id
  triggering_event_ids uuid[] default '{}',   -- which events surfaced this
  outcome text,                               -- observed outcome (optional, filled in later)
  recorded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index decisions_decided_on_idx on decisions (decided_on desc);
create index decisions_scope_idx on decisions (scope_type, scope_id);
create index decisions_kind_idx on decisions (kind);

alter table decisions enable row level security;

-- Firm: full read + write
create policy decisions_firm_read on decisions for select to authenticated using (public.is_firm());
create policy decisions_firm_write on decisions for all to authenticated
  using (public.is_firm()) with check (public.is_firm());

-- Party: read all (CMO sees the institutional history)
create policy decisions_party_read on decisions for select to authenticated using (public.is_party());
