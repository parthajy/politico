import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().min(2),
  district_id: z.number().nullable().optional(),
  constituency_id: z.number().nullable().optional(),
  outlet: z.string().nullable().optional(),
  voice_id: z.string().uuid().nullable().optional(),
  // AI provenance — set when this story accepts an AI suggestion.
  source_event_id: z.string().uuid().nullable().optional(),
  ai_angle: z.string().nullable().optional(),
  ai_pitch: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "firm_admin" && profile?.role !== "firm_analyst") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const { data, error } = await sb
    .from("stories")
    .insert({
      title: body.title,
      district_id: body.district_id ?? null,
      constituency_id: body.constituency_id ?? null,
      outlet: body.outlet ?? null,
      voice_id: body.voice_id ?? null,
      status: "idea",
    })
    .select("id, title, status, outlet, url, reach_estimate, published_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({
    user_id: user.id,
    action: "story_create",
    entity_type: "stories",
    entity_id: data.id,
    metadata: {
      title: body.title,
      source_event_id: body.source_event_id ?? null,
      ai_angle: body.ai_angle ?? null,
      ai_pitch: body.ai_pitch ?? null,
      human_edited_title: body.ai_angle != null && body.title !== body.ai_angle,
    },
  });
  return NextResponse.json({ ok: true, story: data });
}
