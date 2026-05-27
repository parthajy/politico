import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Models — locked-in for production.
// Haiku 4.5 is fast + cheap for classifier and OCR.
// Sonnet 4.6 is the senior-analyst model for briefs, triage, narratives, threat, ask-desk, agenda.
export const MODEL_CLASSIFIER = "claude-haiku-4-5-20251001";
export const MODEL_BRIEF = "claude-sonnet-4-6";

/**
 * Run a JSON-mode call by forcing a single tool. The tool's `input` will
 * conform to the supplied JSON schema, so callers can `JSON.parse` and
 * validate with zod without prefill/regex tricks.
 */
export async function jsonCall<T = unknown>(opts: {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  toolName?: string;
  toolDescription?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const client = getAnthropic();
  const toolName = opts.toolName ?? "emit";
  const r = await client.messages.create({
    model: opts.model,
    system: opts.system,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
    tool_choice: { type: "tool", name: toolName },
    tools: [
      {
        name: toolName,
        description: opts.toolDescription ?? "Emit the structured result.",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input_schema: opts.schema as any,
      },
    ],
    messages: [{ role: "user", content: opts.user }],
  });
  const toolUse = r.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Anthropic tool-use call returned no tool_use block");
  }
  return toolUse.input as T;
}
