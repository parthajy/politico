import { getAnthropic, MODEL_BRIEF } from "./anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { format, subDays, subHours } from "date-fns";

// Build the context block fed into gpt-4o for the daily brief.
export type BriefContext = {
  date: string; // YYYY-MM-DD
  date_label: string; // "Saturday, 3 May 2026"
  top_events: { title: string; source: string; snt_score: number; sentiment: number; constituency: string | null; district: string | null; topic_tags: string[]; sentiment_justification: string | null; published_at: string | null; url: string | null }[];
  state_sentiment_today: number | null;
  state_sentiment_yesterday: number | null;
  alerts: { severity: string; title: string; body: string | null }[];
};

export async function buildBriefContext(briefDate: Date = new Date()): Promise<BriefContext> {
  const sb = createAdminClient();
  const date = format(briefDate, "yyyy-MM-dd");
  const date_label = format(briefDate, "EEEE, d MMMM yyyy");
  const since24h = subHours(briefDate, 24).toISOString();
  const today = format(briefDate, "yyyy-MM-dd");
  const yesterday = format(subDays(briefDate, 1), "yyyy-MM-dd");

  const [evRes, alertsRes, todaySnap, yesterdaySnap] = await Promise.all([
    sb
      .from("classifications")
      .select("snt_score, sentiment, sentiment_justification, topic_tags, events!inner(title, source, published_at, url), districts(name), constituencies(name)")
      .gte("classified_at", since24h)
      .order("snt_score", { ascending: false, nullsFirst: false })
      .limit(15),
    sb
      .from("alerts")
      .select("severity, title, body")
      .is("resolved_at", null)
      .in("severity", ["s1", "s2"])
      .order("created_at", { ascending: false })
      .limit(10),
    sb.from("sentiment_snapshots").select("net_sentiment").eq("scope_type", "state").eq("date", today).maybeSingle(),
    sb.from("sentiment_snapshots").select("net_sentiment").eq("scope_type", "state").eq("date", yesterday).maybeSingle(),
  ]);

  return {
    date,
    date_label,
    top_events: (evRes.data ?? []).map((r) => {
      const ev = (r.events as unknown) as { title: string; source: string; published_at: string | null; url: string | null };
      return {
        title: ev.title,
        source: ev.source,
        snt_score: Number(r.snt_score ?? 0),
        sentiment: Number(r.sentiment ?? 0),
        constituency: ((r.constituencies as unknown) as { name: string } | null)?.name ?? null,
        district: ((r.districts as unknown) as { name: string } | null)?.name ?? null,
        topic_tags: r.topic_tags ?? [],
        sentiment_justification: r.sentiment_justification,
        published_at: ev.published_at,
        url: ev.url,
      };
    }),
    state_sentiment_today: todaySnap.data?.net_sentiment != null ? Number(todaySnap.data.net_sentiment) : null,
    state_sentiment_yesterday: yesterdaySnap.data?.net_sentiment != null ? Number(yesterdaySnap.data.net_sentiment) : null,
    alerts: (alertsRes.data ?? []).map((a) => ({ severity: a.severity, title: a.title, body: a.body })),
  };
}

const SYSTEM = `You are writing the Morning Signal Brief for the Chief Minister of Arunachal Pradesh.

Style:
- Editorial, informed, never alarmist. No jargon, no consultancy doctrine-speak.
- Treat the CM as a senior, busy reader. Lead with what they need to know.
- Cite specific events and constituencies by name. Don't generalise.
- Two pages, ~700 words. Clean Markdown.

Required sections (use these exact level-2 headings):
## Top of mind
## What moved overnight
## Watch list
## Field colour

Tone rules:
- Never say "the situation" or "the matter" — name the thing.
- No bullet-point salads — write in paragraphs that flow.
- "Field colour" should be observational and human (a teacher in Daporijo, a mason in Tezu) — not statistics.
- If something looks like a hostile narrative gaining ground, call it that. If it doesn't, don't manufacture drama.

Output: Markdown only. No preamble, no signature.`;

export function userPrompt(ctx: BriefContext): string {
  const parts: string[] = [];
  parts.push(`Date: ${ctx.date_label}`);
  parts.push("");

  if (ctx.state_sentiment_today != null) {
    const delta = (ctx.state_sentiment_today ?? 0) - (ctx.state_sentiment_yesterday ?? 0);
    parts.push(`State net sentiment: ${ctx.state_sentiment_today.toFixed(2)} (Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} vs yesterday).`);
  }

  if (ctx.alerts.length > 0) {
    parts.push("");
    parts.push("Active S1/S2 alerts:");
    for (const a of ctx.alerts) {
      parts.push(`- [${a.severity.toUpperCase()}] ${a.title}${a.body ? ` — ${a.body}` : ""}`);
    }
  }

  parts.push("");
  parts.push(`Top ${ctx.top_events.length} signals from the last 24 hours (highest SNT first):`);
  for (let i = 0; i < ctx.top_events.length; i++) {
    const e = ctx.top_events[i];
    const tag = [e.constituency, e.district].filter(Boolean).join(" · ") || "(unscoped)";
    parts.push(`${i + 1}. [SNT ${e.snt_score.toFixed(2)} · sent ${e.sentiment.toFixed(2)}] ${e.title}`);
    parts.push(`   tagged: ${tag}${e.topic_tags.length ? ` · topics: ${e.topic_tags.slice(0, 2).join(", ")}` : ""}`);
    if (e.sentiment_justification) parts.push(`   why: ${e.sentiment_justification}`);
  }

  parts.push("");
  parts.push("Write the brief now.");
  return parts.join("\n");
}

export async function* streamBrief(ctx: BriefContext): AsyncGenerator<string> {
  const client = getAnthropic();
  const stream = client.messages.stream({
    model: MODEL_BRIEF,
    system: SYSTEM,
    max_tokens: 4096,
    temperature: 0.6,
    messages: [{ role: "user", content: userPrompt(ctx) }],
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
