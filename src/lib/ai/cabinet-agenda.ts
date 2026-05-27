import { getAnthropic, MODEL_BRIEF } from "./anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { format, subDays } from "date-fns";

export type AgendaContext = {
  date_label: string;
  week_window: string;
  top_signals: { title: string; constituency: string | null; district: string | null; snt_score: number; sentiment: number; topic_tags: string[]; sentiment_justification: string | null }[];
  active_alerts: { severity: string; title: string }[];
  hot_districts: { name: string; signal_count: number; avg_sentiment: number }[];
  hot_topics: { tag: string; count: number }[];
};

export async function buildAgendaContext(today: Date = new Date()): Promise<AgendaContext> {
  const sb = createAdminClient();
  const since = subDays(today, 7).toISOString();
  const weekStart = subDays(today, 7);
  const date_label = format(today, "EEEE, d MMMM yyyy");
  const week_window = `${format(weekStart, "d MMM")} – ${format(today, "d MMM")}`;

  const [signalsRes, alertsRes, classifsRes] = await Promise.all([
    sb.from("classifications")
      .select("snt_score, sentiment, sentiment_justification, topic_tags, events!inner(title), districts(name), constituencies(name)")
      .gte("classified_at", since)
      .order("snt_score", { ascending: false, nullsFirst: false })
      .limit(20),
    sb.from("alerts").select("severity, title").is("resolved_at", null).in("severity", ["s1", "s2"]).order("created_at", { ascending: false }).limit(10),
    sb.from("classifications").select("district_id, sentiment, topic_tags, districts(name)").gte("classified_at", since).limit(500),
  ]);

  // Hot districts
  const distAcc = new Map<string, { count: number; sum: number }>();
  for (const r of classifsRes.data ?? []) {
    const dn = ((r.districts as unknown) as { name: string } | null)?.name;
    if (!dn) continue;
    const cur = distAcc.get(dn) ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += Number(r.sentiment ?? 0);
    distAcc.set(dn, cur);
  }
  const hot_districts = Array.from(distAcc.entries())
    .map(([name, v]) => ({ name, signal_count: v.count, avg_sentiment: v.sum / v.count }))
    .sort((a, b) => b.signal_count - a.signal_count)
    .slice(0, 5);

  // Hot topics
  const topicAcc = new Map<string, number>();
  for (const r of classifsRes.data ?? []) {
    for (const t of (r.topic_tags ?? []) as string[]) topicAcc.set(t, (topicAcc.get(t) ?? 0) + 1);
  }
  const hot_topics = Array.from(topicAcc.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 6);

  return {
    date_label,
    week_window,
    top_signals: (signalsRes.data ?? []).map((r) => {
      const ev = (r.events as unknown) as { title: string };
      return {
        title: ev.title,
        constituency: ((r.constituencies as unknown) as { name: string } | null)?.name ?? null,
        district: ((r.districts as unknown) as { name: string } | null)?.name ?? null,
        snt_score: Number(r.snt_score ?? 0),
        sentiment: Number(r.sentiment ?? 0),
        topic_tags: r.topic_tags ?? [],
        sentiment_justification: r.sentiment_justification,
      };
    }),
    active_alerts: alertsRes.data ?? [],
    hot_districts,
    hot_topics,
  };
}

const SYSTEM = `You are preparing the weekly Cabinet Meeting agenda for the Government of Arunachal Pradesh, on behalf of the consultancy advising the CMO.

Output a one-page agenda in clean Markdown. Use these EXACT section headings:

## 1. Decisions needed this week
## 2. Discussion items
## 3. For information / monitoring
## 4. Recommended public actions

Rules:
- Cabinet meetings are short. Do NOT pad. 6–10 items total across all sections.
- "Decisions needed" = the cabinet has to choose. Use only when there is a real choice to make.
- "Discussion items" = the cabinet should align on a posture or response.
- "For information" = be aware; no action needed.
- "Recommended public actions" = stories to brief, statements to release, visits to schedule. Concrete.
- Each item is 1-2 sentences MAX. Name the constituency, district, person, or outlet by name.
- Lead each item with a short bold title.
- Tone: senior, even, no doctrine-speak.

Output Markdown only. No preamble.`;

function userPrompt(ctx: AgendaContext): string {
  const parts: string[] = [];
  parts.push(`Cabinet meeting prep for ${ctx.date_label}. Week covered: ${ctx.week_window}.`);
  parts.push("");

  if (ctx.active_alerts.length > 0) {
    parts.push("Active S1/S2 alerts:");
    for (const a of ctx.active_alerts) parts.push(`  - [${a.severity.toUpperCase()}] ${a.title}`);
    parts.push("");
  }

  if (ctx.hot_districts.length > 0) {
    parts.push("Hot districts (volume + avg sentiment over week):");
    for (const d of ctx.hot_districts) parts.push(`  - ${d.name}: ${d.signal_count} signals, avg sent ${d.avg_sentiment.toFixed(2)}`);
    parts.push("");
  }

  if (ctx.hot_topics.length > 0) {
    parts.push("Recurring topics: " + ctx.hot_topics.map((t) => `${t.tag} (${t.count})`).join(", "));
    parts.push("");
  }

  parts.push(`Top ${ctx.top_signals.length} signals from the week:`);
  for (let i = 0; i < ctx.top_signals.length; i++) {
    const e = ctx.top_signals[i];
    const tag = [e.constituency, e.district].filter(Boolean).join(" · ") || "(unscoped)";
    parts.push(`${i + 1}. [SNT ${e.snt_score.toFixed(2)} · sent ${e.sentiment.toFixed(2)}] ${e.title}`);
    parts.push(`   tagged: ${tag}${e.topic_tags.length ? ` · topics: ${e.topic_tags.slice(0, 2).join(", ")}` : ""}`);
    if (e.sentiment_justification) parts.push(`   why: ${e.sentiment_justification}`);
  }

  parts.push("");
  parts.push("Write the cabinet agenda now.");
  return parts.join("\n");
}

export async function* streamAgenda(ctx: AgendaContext): AsyncGenerator<string> {
  const client = getAnthropic();
  const stream = client.messages.stream({
    model: MODEL_BRIEF,
    system: SYSTEM,
    max_tokens: 3000,
    temperature: 0.5,
    messages: [{ role: "user", content: userPrompt(ctx) }],
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
