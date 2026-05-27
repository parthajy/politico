import { getAnthropic, MODEL_CLASSIFIER } from "@/lib/ai/anthropic";

// Use claude-haiku-4-5's vision capability to OCR + summarise a screenshot.
// Caller passes a data URL ("data:image/png;base64,..."). Returns the
// transcribed text + a short caption.

export type OcrResult = {
  transcript: string;
  caption: string;
};

const SYSTEM = `You are reading a screenshot of a social media post or news clipping for a political-intelligence platform.
Return JSON {"transcript": "...", "caption": "..."} where:
- transcript: all readable text in the image, in reading order, preserving line breaks. If non-English, transcribe in the original language. Do NOT translate.
- caption: ONE sentence describing what the image shows (who posted, what platform if visible, what it's about). 20 words max.`;

const SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    caption: { type: "string" },
  },
  required: ["transcript", "caption"],
};

export async function ocrImage(dataUrl: string): Promise<OcrResult> {
  const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data URL");
  const ext = match[1] === "jpg" ? "jpeg" : match[1];
  const mediaType = `image/${ext}` as "image/png" | "image/jpeg" | "image/webp";
  const base64 = match[2];

  const client = getAnthropic();
  const r = await client.messages.create({
    model: MODEL_CLASSIFIER,
    system: SYSTEM,
    max_tokens: 2048,
    temperature: 0,
    tool_choice: { type: "tool", name: "emit_ocr" },
    tools: [
      {
        name: "emit_ocr",
        description: "Emit the OCR transcript and caption.",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input_schema: SCHEMA as any,
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: "Transcribe this screenshot." },
        ],
      },
    ],
  });

  const toolUse = r.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("OCR returned no tool_use block");
  }
  const out = toolUse.input as Partial<OcrResult>;
  return {
    transcript: (out.transcript ?? "").slice(0, 3000),
    caption: (out.caption ?? "").slice(0, 200),
  };
}
