import { z } from "zod";
import { getOpenAI, MODEL_BRIEF } from "./openai";

export const StorySuggestion = z.object({
  source_event_id: z.string().uuid(),
  angle: z.string().min(10),
  why_now: z.string().min(10),
  suggested_voice_name: z.string().nullable(),
  suggested_outlet: z.string().nullable(),
  draft_pitch: z.string().min(20),
});
export type StorySuggestion = z.infer<typeof StorySuggestion>;

const Batch = z.object({ suggestions: z.array(StorySuggestion) });

export type SuggestInput = {
  event: { id: string; title: string; body: string | null; source: string; snt_score: number; sentiment: number; constituency: string | null; district: string | null; topic_tags: string[] };
  voices_in_district: { name: string; role: string | null }[];
};

const OUTLETS = [
  "Arunachal Times", "Echo of Arunachal", "Arunachal Front", "The Hindu (NE bureau)",
  "Indian Express (NE bureau)", "ANI", "PTI", "EastMojo", "The Sentinel", "Pratidin Time",
];

const SYSTEM = `You are a senior political-comms strategist advising the Government of Arunachal Pradesh on which signals to convert into proactive stories the firm should brief out.

Govt comms ALWAYS finds an angle. Every event has at least one of:
- a counter-frame (negative news → highlight what the govt is actively doing about it)
- a redirect (national-level story → spotlight a constituency win that contrasts)
- a context-setter (controversy → publish ground reality from the affected community)
- an amplification (positive ground signal → scale it via outlet partnership)

For EVERY input event you receive, propose exactly ONE story angle. The angle should:
- Lead with a constructive, govt-affirming frame even when the underlying signal is negative.
- Be locally rooted: reference the actual constituency, district, or community.
- Match the rhythm of the regional press cycle (next 48–72 hours).
- Pick a credible LOCAL voice (from the voices_in_district list provided) to be the human anchor.
- Pick ONE realistic outlet from: ${OUTLETS.join(", ")}.

For each event return:
- source_event_id (echo verbatim)
- angle: the headline/one-line frame the story takes
- why_now: ONE sentence on the timing window — what makes this the moment
- suggested_voice_name: the exact name from the voices_in_district list, or null if none fit
- suggested_outlet: one of the outlets above
- draft_pitch: 2–3 sentences the firm could literally WhatsApp the desk editor — concrete, no jargon, no AI tells

Examples of angle reframing:
- "CBI probe announced" → "Govt welcomes scrutiny: CMO publishes contract trail proactively"
- "Landslide kills three" → "On-ground response: govt teams reach affected villages within X hours"
- "Bandh paralyses Itanagar" → "Stakeholder dialogue: govt convenes community leaders on immigration concerns"

Output strict JSON: {"suggestions": [...]}. Always return at least one suggestion per input event.`;

export async function suggestStories(inputs: SuggestInput[]): Promise<StorySuggestion[]> {
  if (inputs.length === 0) return [];
  const openai = getOpenAI();
  const payload = inputs.map((i) => ({
    event_id: i.event.id,
    title: i.event.title,
    body: (i.event.body ?? "").slice(0, 400),
    source: i.event.source,
    snt_score: i.event.snt_score,
    sentiment: i.event.sentiment,
    constituency: i.event.constituency,
    district: i.event.district,
    topic_tags: i.event.topic_tags,
    voices_in_district: i.voices_in_district.slice(0, 8),
  }));

  const r = await openai.chat.completions.create({
    model: MODEL_BRIEF,
    response_format: { type: "json_object" },
    temperature: 0.7,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify({ events: payload }) },
    ],
  });

  const raw = r.choices[0]?.message?.content;
  if (!raw) throw new Error("empty response");
  const parsed = Batch.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error(`schema mismatch: ${parsed.error.message.slice(0, 200)}`);
  const valid = new Set(inputs.map((i) => i.event.id));
  return parsed.data.suggestions.filter((s) => valid.has(s.source_event_id));
}
