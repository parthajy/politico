import { z } from "zod";
import { getOpenAI, MODEL_CLASSIFIER } from "./openai";
import { CONSTITUENCIES, DISTRICTS, ISSUES } from "@/lib/seed/ap-data";

// Output schema (matches /classifications table). Names are returned by the
// model; we resolve them to FK ids in the persistence layer.
const Entity = z.object({
  type: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
});

const ClassifyOne = z.object({
  source_id: z.string(),
  language: z.string(),
  entities: z.array(Entity),
  sentiment: z.number().min(-1).max(1),
  sentiment_justification: z.string(),
  district: z.string().nullable(),
  constituency: z.string().nullable(),
  mla: z.string().nullable(),
  topic_tags: z.array(z.string()),
  snt_velocity: z.number().min(0).max(1),
  snt_credibility: z.number().min(0).max(1),
  snt_vector: z.number().min(0).max(1),
});

export type ClassifyOne = z.infer<typeof ClassifyOne>;

const ClassifyBatch = z.object({
  results: z.array(ClassifyOne),
});

export type ClassifyInput = {
  source_id: string;
  source: string;
  title: string;
  body?: string | null;
  url?: string | null;
};

const DISTRICT_NAMES = DISTRICTS.map((d) => d.name);
const CONSTITUENCY_NAMES = CONSTITUENCIES.map((c) => c.name);
const MLA_NAMES = CONSTITUENCIES.map((c) => c.mla_name);

const SYSTEM = `You are a political-intelligence classifier for the Indian state of Arunachal Pradesh (AP).

Given a batch of social/news events, return a JSON object {"results": [...]} where each result has these fields:
- source_id: echo the input source_id verbatim
- language: ISO-639-1 code ("en", "hi", "as", "ne", etc.) of the dominant language in the event text. Default "en" if unsure.
- entities: array of {type, value, confidence} where type is one of: person, organisation, place, party, event. Confidence in [0,1].
- sentiment: number in [-1.0, 1.0]. Negative = critical of govt/state, positive = supportive, 0 = neutral. Be rigorous, not generous.
- sentiment_justification: one sentence explaining the score.
- district: must be EXACTLY one name from this list, or null if unclear. List: ${DISTRICT_NAMES.join(", ")}.
- constituency: must be EXACTLY one name from this list, or null if unclear. List: ${CONSTITUENCY_NAMES.join(" | ")}.
- mla: must be EXACTLY one name from this list, or null if unclear. List: ${MLA_NAMES.join(" | ")}.
- topic_tags: array (1-3 items) drawn from these canonical issues, free-text additions allowed if clearly distinct: ${ISSUES.join(" | ")}.
- snt_velocity: 0-1, how rapidly this signal is spreading (high for trending, low for isolated post).
- snt_credibility: 0-1, source quality + factual specificity.
- snt_vector: 0-1, potential to escalate into a political problem if ignored.

Rules:
- For non-AP content (e.g. national news with no AP angle), set district/constituency/mla null and snt_vector low.
- Do NOT invent constituency or MLA names not in the lists above.
- Output JSON only. No prose.`;

function compositeScore(velocity: number, credibility: number, vector: number) {
  // Weighted: vector and velocity matter more than credibility for prioritisation.
  return 0.4 * vector + 0.4 * velocity + 0.2 * credibility;
}

export async function classifyBatch(events: ClassifyInput[]): Promise<Array<ClassifyOne & { snt_score: number }>> {
  if (events.length === 0) return [];
  const openai = getOpenAI();

  const userPayload = events.map((e) => ({
    source_id: e.source_id,
    source: e.source,
    title: e.title,
    body: (e.body ?? "").slice(0, 1500),
    url: e.url ?? "",
  }));

  const response = await openai.chat.completions.create({
    model: MODEL_CLASSIFIER,
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify({ events: userPayload }) },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("classifier: empty response");

  const parsed = ClassifyBatch.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`classifier: schema mismatch — ${parsed.error.message.slice(0, 200)}`);
  }

  return parsed.data.results.map((r) => ({
    ...r,
    snt_score: Math.min(1, Math.max(0, compositeScore(r.snt_velocity, r.snt_credibility, r.snt_vector))),
  }));
}
