import { getOpenAI, MODEL_CLASSIFIER } from "@/lib/ai/openai";

// Use gpt-4o-mini's vision capability to OCR + summarise a screenshot.
// Caller passes a data URL ("data:image/png;base64,..."). Returns the
// transcribed text + a short caption.

export type OcrResult = {
  transcript: string;
  caption: string;
};

const SYSTEM = `You are reading a screenshot of a social media post or news clipping for a political-intelligence platform.
Return JSON {"transcript": "...", "caption": "..."} where:
- transcript: all readable text in the image, in reading order, preserving line breaks. If non-English, transcribe in the original language. Do NOT translate.
- caption: ONE sentence describing what the image shows (who posted, what platform if visible, what it's about). 20 words max.
Output strict JSON only.`;

export async function ocrImage(dataUrl: string): Promise<OcrResult> {
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) {
    throw new Error("Invalid image data URL");
  }
  const openai = getOpenAI();
  const r = await openai.chat.completions.create({
    model: MODEL_CLASSIFIER,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe this screenshot." },
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
        ],
      },
    ],
  });
  const raw = r.choices[0]?.message?.content;
  if (!raw) throw new Error("OCR returned empty response");
  try {
    const out = JSON.parse(raw) as Partial<OcrResult>;
    return {
      transcript: (out.transcript ?? "").slice(0, 3000),
      caption: (out.caption ?? "").slice(0, 200),
    };
  } catch {
    throw new Error("OCR response was not valid JSON");
  }
}
