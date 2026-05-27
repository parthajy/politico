import { z } from "zod";
import { jsonCall, MODEL_CLASSIFIER } from "./anthropic";
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
- Do NOT invent constituency or MLA names not in the lists above.`;

// JSON schema enforced by the tool-use call. Anthropic will conform the
// tool input to this; we still validate with zod after.
const SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source_id: { type: "string" },
          language: { type: "string" },
          entities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                value: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["type", "value", "confidence"],
            },
          },
          sentiment: { type: "number" },
          sentiment_justification: { type: "string" },
          district: { type: ["string", "null"] },
          constituency: { type: ["string", "null"] },
          mla: { type: ["string", "null"] },
          topic_tags: { type: "array", items: { type: "string" } },
          snt_velocity: { type: "number" },
          snt_credibility: { type: "number" },
          snt_vector: { type: "number" },
        },
        required: [
          "source_id", "language", "entities", "sentiment", "sentiment_justification",
          "district", "constituency", "mla", "topic_tags",
          "snt_velocity", "snt_credibility", "snt_vector",
        ],
      },
    },
  },
  required: ["results"],
};

function compositeScore(velocity: number, credibility: number, vector: number) {
  // Weighted: vector and velocity matter more than credibility for prioritisation.
  return 0.4 * vector + 0.4 * velocity + 0.2 * credibility;
}

export async function classifyBatch(events: ClassifyInput[]): Promise<Array<ClassifyOne & { snt_score: number }>> {
  if (events.length === 0) return [];

  const userPayload = events.map((e) => ({
    source_id: e.source_id,
    source: e.source,
    title: e.title,
    body: (e.body ?? "").slice(0, 1500),
    url: e.url ?? "",
  }));

  const raw = await jsonCall<unknown>({
    model: MODEL_CLASSIFIER,
    system: SYSTEM,
    user: JSON.stringify({ events: userPayload }),
    schema: SCHEMA,
    toolName: "emit_classifications",
    toolDescription: "Return the array of classification results, one per input event.",
    temperature: 0.1,
    // Scales with batch size — every event can produce a long justification.
    maxTokens: Math.min(8192, 600 + events.length * 400),
  });

  const parsed = ClassifyBatch.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`classifier: schema mismatch — ${parsed.error.message.slice(0, 200)}`);
  }

  return parsed.data.results.map((r) => ({
    ...r,
    snt_score: Math.min(1, Math.max(0, compositeScore(r.snt_velocity, r.snt_credibility, r.snt_vector))),
  }));
}
