-- Add a public_posture field — the one-line message the CMO can deploy if asked,
-- which is what they actually need (not the strategic playbook).
alter table threat_assessments
  add column if not exists public_posture text;

-- Replace the summary view with a richer one that includes posture + evidence ids.
-- Strategic detail (threats array, recommended_actions) is still excluded.
drop view if exists threat_assessments_summary;
create view threat_assessments_summary as
  select
    id,
    scope_type,
    scope_id,
    entity_name,
    threat_band,
    headline,
    public_posture,
    evidence_event_ids,
    generated_at
  from threat_assessments;

grant select on threat_assessments_summary to authenticated;
