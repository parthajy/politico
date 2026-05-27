import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonCall, MODEL_CLASSIFIER } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// On-demand translation of a non-English event title + body excerpt to English.
// Cheap (haiku-4-5); cached client-side. We don't persist translations to
// keep the schema simple — if a translation is needed twice, we re-call.

const SCHEMA = {
  type: "object",
  properties: {
    translated_title: { type: "string" },
    translated_excerpt: { type: "string" },
  },
  required: ["translated_title", "translated_excerpt"],
};

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data: ev } = await sb.from("events").select("title, body").eq("id", params.id).maybeSingle();
  if (!ev) return NextResponse.json({ ok: false, error: "event not found" }, { status: 404 });

  try {
    const out = await jsonCall<{ translated_title?: string; translated_excerpt?: string }>({
      model: MODEL_CLASSIFIER,
      system: "Translate the given text to clear, neutral English. Excerpt should be ~120 words max. Do not add commentary or hedges.",
      user: JSON.stringify({ title: ev.title, body: (ev.body ?? "").slice(0, 1500) }),
      schema: SCHEMA,
      toolName: "emit_translation",
      toolDescription: "Return translated_title and translated_excerpt.",
      temperature: 0,
      maxTokens: 1500,
    });
    return NextResponse.json({ ok: true, translated_title: out.translated_title ?? null, translated_excerpt: out.translated_excerpt ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
