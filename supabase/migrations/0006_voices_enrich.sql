-- Voice CRM upgrade — turn the contact list into a leverage map.
-- Fields added so the firm can track engagement, social reach, and topical relevance.

alter table voices
  add column if not exists social_handles jsonb default '{}'::jsonb,    -- {twitter: "...", facebook: "...", instagram: "..."}
  add column if not exists coverage_topics text[] default '{}',         -- ["education", "border infrastructure"]
  add column if not exists reach_estimate int,                          -- approximate audience reach via owned channels
  add column if not exists response_rate numeric check (response_rate is null or response_rate between 0 and 1),
  add column if not exists placement_count int default 0,               -- stories the firm has placed via this voice
  add column if not exists last_outreach_at timestamptz,                -- distinct from last_engagement_at (contact vs reply)
  add column if not exists relationship_notes text;                     -- private; party_viewer doesn't see this

-- Refresh party-safe voices view to expose only the non-strategic fields
drop view if exists voices_public;
create view voices_public as
  select
    id, name, role, district_id, constituency_id, active,
    joined_at, last_engagement_at,
    social_handles, coverage_topics, reach_estimate,
    ever_paid, ever_scripted
  from voices;
grant select on voices_public to authenticated;
