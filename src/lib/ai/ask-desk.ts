import { z } from "zod";
import { getOpenAI, MODEL_BRIEF } from "./openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { subDays } from "date-fns";

export type AskCitation = { event_id: string; title: string; source: string; published_at: string | null; url: string | null; constituency: string | null; district: string | null };

const Answer = z.object({
  answer: z.string().min(20),
  cited_event_ids: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  no_data_caveat: z.string().nullable(),
});
export type Answer = z.infer<typeof Answer>;

const SYSTEM = `You are the desk analyst answering questions from the Chief Minister's office about Arunachal Pradesh political signals.

You will be given:
- the question
- a corpus of recently classified events (title, district, constituency, sentiment, topic tags, source)

Your answer must:
- Be ONE clear paragraph (3-6 sentences). No bullet salads. No preamble like "Based on the data...".
- Cite specific events by their event_id when you reference them (use the cited_event_ids field).
- Cite specific places, MLAs, dates when possible.
- Be honest: if the corpus does not contain enough data to answer, say so in no_data_caveat AND set confidence to "low". Do NOT make things up.
- Tone: senior, calm, direct. The reader is the CM or his principal advisor.

Output strict JSON: { answer, cited_event_ids (array of event_id strings actually referenced), confidence (high/medium/low), no_data_caveat (string or null) }.`;

export async function askDesk(question: string, lookbackDays = 14): Promise<Answer & { citations: AskCitation[] }> {
  const sb = createAdminClient();
  const since = subDays(new Date(), lookbackDays).toISOString();

  // Pull a generous slice of recent classifications. Supabase pg-rest can't do
  // semantic search out of the box; we send the model up to ~80 high-quality
  // events and let it filter by relevance.
  const { data: rows } = await sb
    .from("classifications")
    .select("event_id, snt_score, sentiment, topic_tags, events!inner(title, source, published_at, url), districts(name), constituencies(name)")
    .gte("classified_at", since)
    .order("snt_score", { ascending: false, nullsFirst: false })
    .limit(80);

  const corpus = (rows ?? []).map((r) => {
    const ev = (r.events as unknown) as { title: string; source: string; published_at: string | null; url: string | null };
    return {
      event_id: r.event_id,
      title: ev.title,
      source: ev.source,
      snt_score: r.snt_score,
      sentiment: r.sentiment,
      district: ((r.districts as unknown) as { name: string } | null)?.name ?? null,
      constituency: ((r.constituencies as unknown) as { name: string } | null)?.name ?? null,
      topic_tags: r.topic_tags ?? [],
      published_at: ev.published_at,
      url: ev.url,
    };
  });

  const openai = getOpenAI();
  const r = await openai.chat.completions.create({
    model: MODEL_BRIEF,
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify({ question, lookback_days: lookbackDays, corpus }) },
    ],
  });

  const raw = r.choices[0]?.message?.content;
  if (!raw) throw new Error("empty response");
  const parsed = Answer.parse(JSON.parse(raw));

  // Hydrate citations
  const byId = new Map(corpus.map((c) => [c.event_id, c]));
  const validCited = parsed.cited_event_ids.filter((id) => byId.has(id));
  const citations: AskCitation[] = validCited.map((id) => {
    const c = byId.get(id)!;
    return { event_id: c.event_id, title: c.title, source: c.source, published_at: c.published_at, url: c.url, constituency: c.constituency, district: c.district };
  });

  return { ...parsed, citations };
}
