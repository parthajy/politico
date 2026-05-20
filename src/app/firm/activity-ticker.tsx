import { createClient } from "@/lib/supabase/server";
import { formatDistanceToNowStrict } from "date-fns";

// A Bloomberg-ish desk activity strip — the last actions across the firm,
// from the audit log. Gives the inbox a "live war room" feel.

const ACTION_LABEL: Record<string, { verb: string; tone: "escalate" | "story" | "brief" | "ai" | "neutral" }> = {
  triage_escalated: { verb: "escalated a signal", tone: "escalate" },
  triage_monitoring: { verb: "moved a signal to monitoring", tone: "neutral" },
  triage_closed: { verb: "closed a signal", tone: "neutral" },
  story_create: { verb: "created a story idea", tone: "story" },
  story_in_production: { verb: "moved a story into production", tone: "story" },
  story_published: { verb: "published a story", tone: "story" },
  brief_generate: { verb: "generated the morning brief", tone: "brief" },
  brief_publish: { verb: "published the brief to the cabinet", tone: "brief" },
  agenda_generate: { verb: "generated the cabinet agenda", tone: "brief" },
  ai_inbox_recommend: { verb: "ran Today's Call", tone: "ai" },
  ai_story_suggest: { verb: "ran story suggestions", tone: "ai" },
  ai_narratives: { verb: "ran narrative detection", tone: "ai" },
  threat_generate: { verb: "refreshed a threat assessment", tone: "escalate" },
  threat_generate_all: { verb: "refreshed the threat radar", tone: "escalate" },
  decision_record: { verb: "recorded a cabinet decision", tone: "brief" },
  event_star: { verb: "starred a signal", tone: "neutral" },
  ask_desk: { verb: "queried the desk", tone: "ai" },
};

const TONE_COLOR: Record<string, string> = {
  escalate: "var(--severity-1)",
  story: "var(--bronze)",
  brief: "var(--navy)",
  ai: "#5BA976",
  neutral: "var(--muted)",
};

export async function ActivityTicker() {
  const sb = createClient();
  const { data } = await sb
    .from("audit_log")
    .select("id, action, created_at, users(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(12);

  const rows = (data ?? []).filter((r) => ACTION_LABEL[r.action]);
  if (rows.length === 0) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-border bg-navy text-white">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/70">Desk activity · live</span>
      </div>
      <ul className="divide-y divide-white/5">
        {rows.slice(0, 6).map((r) => {
          const meta = ACTION_LABEL[r.action];
          const u = (r.users as unknown) as { full_name: string | null; email: string } | null;
          const who = u?.full_name ?? u?.email?.split("@")[0] ?? "Desk";
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_COLOR[meta.tone] }} />
              <span className="flex-1">
                <span className="font-medium text-white">{who}</span>
                <span className="text-white/70"> {meta.verb}</span>
              </span>
              <span className="shrink-0 text-[11px] text-white/40">{formatDistanceToNowStrict(new Date(r.created_at))} ago</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
