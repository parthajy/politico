// Single source of truth for the glossary. Used by /glossary, the nav popover,
// and tooltips on column headers.

export type GlossaryItem = { term: string; short: string; long?: string };
export type GlossarySection = { title: string; items: GlossaryItem[] };

export const GLOSSARY: GlossarySection[] = [
  {
    title: "Vocabulary",
    items: [
      {
        term: "SNT score",
        short: "Composite priority — 0 to 1. The inbox is sorted by this.",
        long: "Weighted blend of three sub-scores: 40% velocity (how fast it's spreading), 40% vector (potential to escalate if ignored), 20% credibility (source quality). ≥0.85 = S1 priority; ≥0.6 = S2; ≥0.35 = S3.",
      },
      { term: "Velocity", short: "0–1 — how rapidly the signal is spreading." },
      { term: "Credibility", short: "0–1 — source quality and factual specificity." },
      { term: "Vector", short: "0–1 — potential to escalate into a political problem if ignored." },
      { term: "Sentiment", short: "−1.0 to +1.0 — negative is critical of govt/state, positive is supportive, zero is neutral." },
      {
        term: "Severity (S1 / S2 / S3)",
        short: "Triage tier derived from SNT score.",
        long: "S1 (red) demands immediate attention. S2 (bronze) is on the watch list. S3 (grey) is logged but unscheduled. Any event the firm escalates auto-becomes an alert at the matching severity.",
      },
      { term: "Tagged", short: "Constituency + district the classifier matched (or null if unscoped)." },
    ],
  },
  {
    title: "Triage status",
    items: [
      { term: "New", short: "Just classified, no analyst has touched it." },
      { term: "Monitoring", short: "On the radar, not yet a problem." },
      {
        term: "Escalated",
        short: "Now an alert. Visible on the party dashboard.",
        long: "Auto-creates an S1 or S2 alert (depending on SNT) which the CMO can see on /party and /party/alerts.",
      },
      { term: "Closed", short: "Handled or non-issue. Stays in audit log." },
    ],
  },
  {
    title: "Story pipeline",
    items: [
      { term: "Idea", short: "An angle worth chasing — not yet briefed." },
      { term: "In production", short: "Briefed to a partner outlet or a community voice." },
      { term: "Published", short: "Live with outlet name, URL, and reach data." },
    ],
  },
  {
    title: "Sources",
    items: [
      { term: "Reddit", short: "r/arunachalpradesh, r/northeastindia, r/india, r/IndiaSpeaks. AP-keyword filtered for the broad subs." },
      { term: "GDELT 2.0", short: "Global news event database, India + AP keyword query." },
      { term: "Google News RSS", short: "One feed per Tier-1 district, per CM/Dy CM, per top issue." },
      { term: "Indian outlet RSS", short: "The Hindu, Indian Express, Hindustan Times, NDTV, Arunachal Times, Arunachal Front." },
      { term: "YouTube Data API v3", short: "Search-based video pulls, AP + CM queries." },
      {
        term: "Premium placeholders",
        short: "Meltwater, Cision, TAM, Konnect Insights, Maltego.",
        long: "These appear as greyed cards on /firm/sources. They unlock post-contract — primary social listening at enterprise scale, print monitoring, broadcast TV, regional-language depth, OSINT graph.",
      },
    ],
  },
  {
    title: "Roles",
    items: [
      { term: "Firm admin", short: "Full firm access plus the audit log." },
      { term: "Firm analyst", short: "Inbox, triage, voices, stories, briefs. Cannot see audit log." },
      { term: "Party viewer (CMO)", short: "Read-only dashboard, published briefs, alerts. Cannot see triage notes or unpublished work." },
    ],
  },
  {
    title: "Operating doctrines",
    items: [
      { term: "1 · Bigger Reality", short: "Story Pipeline is the visible-work engine, not a press-release tool." },
      { term: "2 · Time is the Weapon", short: "30-day sentiment trends are designed to show compounding." },
      { term: "3 · Local Voice First", short: "The Voice CRM is a first-class object, not a contact list." },
      { term: "4 · No Paid Narrative", short: "Voice records carry hard audit columns proving no payments, no scripts." },
      { term: "5 · Visual Proof Over Claims", short: "Story records carry outlet, URL, and reach data." },
      { term: "6 · Leader, Not Respondent", short: "There is no 'respond to allegation' workflow. By design." },
      { term: "7 · Signal Over Noise", short: "Every event has an SNT score. The inbox is ranked by it." },
    ],
  },
];

// Quick lookup helper for tooltips
export function defineTerm(term: string): string | null {
  for (const s of GLOSSARY) {
    for (const i of s.items) {
      if (i.term.toLowerCase() === term.toLowerCase()) return i.long ?? i.short;
    }
  }
  return null;
}
