import { z } from "zod";
import { getOpenAI, MODEL_BRIEF } from "./openai";

export const Narrative = z.object({
  label: z.string().min(4),
  summary: z.string().min(20),
  sentiment_lean: z.enum(["hostile", "mixed", "supportive"]),
  trajectory: z.enum(["rising", "steady", "fading"]),
  key_event_ids: z.array(z.string()),
  recommended_response: z.string().min(10),
});
export type Narrative = z.infer<typeof Narrative>;

const Batch = z.object({ narratives: z.array(Narrative) });

export type NarrativeInput = {
  event_id: string;
  title: string;
  body: string | null;
  source: string;
  snt_score: number | null;
  sentiment: number | null;
  district: string | null;
  constituency: string | null;
  topic_tags: string[];
  published_at: string | null;
};

const SYSTEM = `You cluster the last 7 days of political signals into 3-6 emerging NARRATIVES.

A narrative is a coherent storyline that's forming across multiple events — not a topic tag, not a single story. Examples:
- "Cabinet under fiscal scrutiny after CBI probe" (multiple events about contracts, transparency)
- "Hydropower vs indigenous land rights" (multiple events about Siang dam, protests, environment)
- "Border anxiety reasserting after LAC headlines" (multiple events about China, infrastructure, Tawang)

For each narrative return:
- label: 4-7 word headline
- summary: 1-2 sentences explaining what's coalescing and why it matters
- sentiment_lean: hostile (mostly anti-govt), mixed, or supportive
- trajectory: rising (more events recently), steady (constant flow), or fading
- key_event_ids: 2-5 event_ids that anchor this narrative
- recommended_response: 1 sentence on how the firm should engage (e.g., counter-narrative push via X, ground-level voice piece via Y, monitor only)

Rules:
- 3-6 narratives. Quality over coverage. Skip events that don't fit.
- Recommended_response should reference outlets, voices, or constituencies by name when possible.
- If only 1-2 narratives exist worth surfacing, return only those — don't pad.

Output strict JSON: {"narratives": [...]}`;

export async function detectNarratives(events: NarrativeInput[]): Promise<Narrative[]> {
  if (events.length < 3) return [];
  const openai = getOpenAI();
  const r = await openai.chat.completions.create({
    model: MODEL_BRIEF,
    response_format: { type: "json_object" },
    temperature: 0.4,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify({ events: events.map((e) => ({
        event_id: e.event_id, title: e.title, body: (e.body ?? "").slice(0, 250),
        source: e.source, snt_score: e.snt_score, sentiment: e.sentiment,
        district: e.district, constituency: e.constituency, topic_tags: e.topic_tags,
        published_at: e.published_at,
      })) }) },
    ],
  });
  const raw = r.choices[0]?.message?.content;
  if (!raw) throw new Error("empty response");
  const parsed = Batch.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error(`schema mismatch: ${parsed.error.message.slice(0, 200)}`);
  const valid = new Set(events.map((e) => e.event_id));
  return parsed.data.narratives.map((n) => ({ ...n, key_event_ids: n.key_event_ids.filter((id) => valid.has(id)) }));
}
