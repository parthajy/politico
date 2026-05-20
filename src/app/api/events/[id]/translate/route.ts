import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI, MODEL_CLASSIFIER } from "@/lib/ai/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// On-demand translation of a non-English event title + body excerpt to English.
// Cheap (gpt-4o-mini); cached client-side. We don't persist translations to
// keep the schema simple — if a translation is needed twice, we re-call.

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data: ev } = await sb.from("events").select("title, body").eq("id", params.id).maybeSingle();
  if (!ev) return NextResponse.json({ ok: false, error: "event not found" }, { status: 404 });

  const openai = getOpenAI();
  const r = await openai.chat.completions.create({
    model: MODEL_CLASSIFIER,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Translate the given text to clear, neutral English. Return JSON {translated_title, translated_excerpt}. Excerpt should be ~120 words max. Do not add commentary or hedges." },
      { role: "user", content: JSON.stringify({ title: ev.title, body: (ev.body ?? "").slice(0, 1500) }) },
    ],
  });
  const raw = r.choices[0]?.message?.content;
  if (!raw) return NextResponse.json({ ok: false, error: "empty translation" }, { status: 500 });
  try {
    const out = JSON.parse(raw) as { translated_title?: string; translated_excerpt?: string };
    return NextResponse.json({ ok: true, translated_title: out.translated_title ?? null, translated_excerpt: out.translated_excerpt ?? null });
  } catch {
    return NextResponse.json({ ok: false, error: "parse fail" }, { status: 500 });
  }
}
