// DEPRECATED — kept only to avoid breaking unaudited imports. All AI calls
// have moved to Anthropic Claude. New code should import from "./anthropic".
//
// If you see this file referenced in a new module, replace it.

export {
  getAnthropic as getOpenAI,
  MODEL_CLASSIFIER,
  MODEL_BRIEF,
} from "./anthropic";
