import { z } from "zod";
import { jsonCall, MODEL_BRIEF } from "./anthropic";

export const Recommendation = z.object({
  event_id: z.string().uuid(),
  bucket: z.enum(["escalate", "watch", "story", "noise"]),
  why: z.string().min(10),
  action_note: z.string().min(5),
});
export type Recommendation = z.infer<typeof Recommendation>;

const RecBatch = z.object({ recommendations: z.array(Recommendation) });

export type InboxEvent = {
  event_id: string;
  title: string;
  body: string | null;
  source: string;
  snt_score: number | null;
  sentiment: number | null;
  district: string | null;
  constituency: string | null;
  topic_tags: string[];
  triage_status: string;
  published_at: string | null;
};

const SYSTEM = `You are the senior analyst at a political consultancy advising the Government of Arunachal Pradesh.

You will be given today's signal inbox — events already classified and ranked by SNT score. Bucket each event into exactly one of:

- **escalate**: time-sensitive. The CMO needs to know within hours. Use for narratives that could spread, S1 incidents, anything implicating the cabinet or opposition manoeuvres.
- **watch**: not urgent yet but worth monitoring. Use for slow-burning issues, recurring themes, signals from a single source you'd want corroborated.
- **story**: worth proactively pushing. The firm could brief a friendly outlet or a community voice on this.
- **noise**: low signal — duplicate, off-topic, or irrelevant to AP politics.

For each event return:
- event_id (echo input verbatim)
- bucket
- why: ONE sentence on why this bucket. Be specific to the event content.
- action_note: ONE sentence the analyst could literally paste into the triage notes / story brief / publish queue. Concrete (mention people, outlets, constituencies). Never generic.

Rules:
- Already-escalated events should still get a recommendation — usually 'watch' to indicate next step.
- Bias toward fewer 'escalate' picks (3–5 max) — the CMO can't absorb more.
- 'story' should be reserved for events with a clear local angle and a sympathetic frame the govt could lead with.`;

const SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          event_id: { type: "string" },
          bucket: { type: "string", enum: ["escalate", "watch", "story", "noise"] },
          why: { type: "string" },
          action_note: { type: "string" },
        },
        required: ["event_id", "bucket", "why", "action_note"],
      },
    },
  },
  required: ["recommendations"],
};

export async function recommendForInbox(events: InboxEvent[]): Promise<Recommendation[]> {
  if (events.length === 0) return [];
  const userPayload = events.map((e) => ({
    event_id: e.event_id,
    title: e.title,
    body: (e.body ?? "").slice(0, 400),
    source: e.source,
    snt_score: e.snt_score,
    sentiment: e.sentiment,
    constituency: e.constituency,
    district: e.district,
    topic_tags: e.topic_tags,
    triage_status: e.triage_status,
  }));

  const raw = await jsonCall<unknown>({
    model: MODEL_BRIEF,
    system: SYSTEM,
    user: JSON.stringify({ events: userPayload }),
    schema: SCHEMA,
    toolName: "emit_recommendations",
    toolDescription: "Bucket each event and return the analyst recommendations.",
    temperature: 0.4,
    maxTokens: Math.min(8192, 800 + events.length * 200),
  });

  const parsed = RecBatch.safeParse(raw);
  if (!parsed.success) throw new Error(`triage schema mismatch: ${parsed.error.message.slice(0, 200)}`);
  // Filter to events we actually sent (defensive — model sometimes invents)
  const valid = new Set(events.map((e) => e.event_id));
  return parsed.data.recommendations.filter((r) => valid.has(r.event_id));
}
