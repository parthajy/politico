import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAI() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// Models — mapped from the brief's Anthropic choices.
// Swap these to `claude-haiku-4-5` / `claude-sonnet-4-6` when migrating.
export const MODEL_CLASSIFIER = "gpt-4o-mini";
export const MODEL_BRIEF = "gpt-4o";
